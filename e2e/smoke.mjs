// End-to-end smoke test. Run after `npm run build`: node e2e/smoke.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const UXD_DECK = process.env.DECK ?? 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Curriculum/2026-Autumn/UXD202/Final Slides/Week-08-Unit 3 Interaction Design and Prototyping.html'
const PLAIN_DECK = path.join(here, 'fixtures', 'plain-deck.html')
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
// A fresh data folder per run: tests never touch the teacher's recent files or zoom memory.
const USER_DATA = path.join(OUT, 'userdata')
fs.rmSync(USER_DATA, { recursive: true, force: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Safety: the full test opens full-screen windows and plays the alarm. With a second display
// connected, a class may be on the projector, so the app runs hidden and muted and only the
// steps without projecting run (1-8), unless explicitly allowed.
const screenCount = Number(
  execFileSync('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens.Count']).toString().trim()
)
const HEADLESS = screenCount > 1 && process.env.PRESENTER_E2E_ALLOW_MULTI !== '1'
if (HEADLESS) console.log(`${screenCount} displays connected: hidden mode, steps 1-8 only (no window, no sound).`)
// PRESENTER_EXE = a packaged app (e.g. dist/win-unpacked/Presenter.exe); default: this source folder.
const EXE = process.env.PRESENTER_EXE
const app = await electron.launch({
  args: EXE ? [] : [root],
  cwd: root,
  executablePath: EXE ?? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  env: { ...process.env, PRESENTER_TEST: '1', PRESENTER_HEADLESS: HEADLESS ? '1' : '', PRESENTER_OPEN: UXD_DECK, PRESENTER_USER_DATA: USER_DATA }
})
const errors = []
try {
  const call = (fn, arg) => app.evaluate(fn, arg)
  const state = () => call(() => globalThis.__presenter.getState())
  const out = (s, id) => s.outputs.find((o) => o.id === id)
  async function waitFor(label, pred, ms = 15000) {
    const t0 = Date.now()
    let s
    while (Date.now() - t0 < ms) {
      s = await state()
      if (pred(s)) return s
      await sleep(150)
    }
    throw new Error(`timeout: ${label}\n${JSON.stringify(s?.outputs, null, 1)}`)
  }
  let page
  for (let i = 0; i < 100 && !page; i++) {
    page = app.windows().find((w) => w.url().includes('console.html'))
    if (!page) await sleep(100)
  }
  assert.ok(page, 'console window')
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  const press = async (key) => {
    await page.keyboard.press(key)
    await sleep(250)
  }

  // 1. UXD202 deck is detected; the next preview shows the slide after the projector's.
  let s = await waitFor('uxd202 detected', (s) => out(s, 'projector').adapter === 'uxd202' && out(s, 'next').adapter === 'uxd202' && out(s, 'next').shownIndex === 1)
  assert.ok(out(s, 'projector').total > 10, 'total from deck')
  assert.ok(s.slides.length === out(s, 'projector').total, 'slide list')
  const projectorVisible = () => call(() => globalThis.__presenter.projectorWin.win.isVisible())
  const projectorInConsole = () =>
    call(() => globalThis.__presenter.consoleWin.win.contentView.children.includes(globalThis.__presenter.outputs.get('projector').view))
  assert.equal(s.projecting, false, 'not projecting at start')
  assert.equal(await projectorVisible(), false, 'projector window hidden at start')
  assert.equal(await projectorInConsole(), true, 'deck shown in the console before projecting')
  console.log('ok 1 detect', out(s, 'projector').total, 'slides; projector hidden until asked')

  // 2. The projector turns; the preview follows it.
  await press('ArrowRight')
  s = await waitFor('preview follows', (s) => out(s, 'projector').shownIndex === 1 && out(s, 'next').shownIndex === 2)
  console.log('ok 2 preview follows the projector')

  // 3. Selecting the preview: page keys turn only it; list and notes follow it; it never links.
  // Selecting the projector brings it back to the slide after the projector's.
  await call(() => {
    globalThis.__presenter.select('next')
    globalThis.__presenter.setLinked('next', false)
  })
  await press('ArrowRight')
  s = await waitFor('preview alone', (s) => out(s, 'next').shownIndex === 3)
  assert.equal(out(s, 'projector').shownIndex, 1, 'projector stays')
  assert.equal(s.slidesOf, 'next', 'list and notes follow the preview')
  assert.equal(s.previewOf, 'projector', 'preview still follows the projector')
  assert.equal(out(s, 'next').linked, true, 'preview never links')
  await call(() => globalThis.__presenter.select('projector'))
  s = await waitFor('preview back', (s) => out(s, 'next').shownIndex === 2)
  console.log('ok 3 preview pages alone while selected')

  // 4. An unlinked extra screen, selected, turns alone; the preview, list and notes follow it.
  await call(() => globalThis.__presenter.addScreen(true))
  s = await waitFor('screen 2 detected', (s) => out(s, 'screen-2')?.adapter === 'uxd202' && out(s, 'screen-2').shownIndex === 1)
  await call(() => {
    globalThis.__presenter.setLinked('screen-2', false)
    globalThis.__presenter.select('screen-2')
  })
  await press('ArrowRight')
  s = await waitFor('screen 2 alone', (s) => out(s, 'screen-2').shownIndex === 2 && out(s, 'next').shownIndex === 3)
  assert.equal(out(s, 'projector').shownIndex, 1, 'projector stays')
  assert.equal(s.slidesOf, 'screen-2', 'slide list follows the selection')
  console.log('ok 4 preview follows the selected screen')

  // 5. Back to the projector: the preview follows it again; the unlinked screen stays.
  await call(() => globalThis.__presenter.select('projector'))
  s = await waitFor('preview back', (s) => out(s, 'next').shownIndex === 2)
  await press('ArrowLeft')
  s = await waitFor('projector back', (s) => out(s, 'projector').shownIndex === 0 && out(s, 'next').shownIndex === 1)
  assert.equal(out(s, 'screen-2').shownIndex, 2, 'unlinked screen stays')
  await call(() => globalThis.__presenter.removeScreen('screen-2'))
  await press('ArrowRight')
  s = await waitFor('projector 2', (s) => out(s, 'projector').shownIndex === 1 && out(s, 'next').shownIndex === 2)
  console.log('ok 5 preview returns to the projector')

  // 6. Jump from the slide list keeps the offset.
  await call(() => globalThis.__presenter.navigate({ type: 'goto', index: 5 }))
  s = await waitFor('goto', (s) => out(s, 'projector').shownIndex === 5 && out(s, 'next').shownIndex === 6)
  console.log('ok 6 goto')

  // 6b. 字号: Ctrl + zooms the selected screen; the next preview follows it.
  const zoomRatio = (id) => call((_e, id) => {
    const o = globalThis.__presenter.outputs.get(id)
    return o.view.webContents.getZoomFactor() / o.baseZoom
  }, id)
  await press('Control+Equal')
  await press('Control+Equal')
  s = await waitFor('zoom 125', (s) => out(s, 'projector').zoomPercent === 125 && out(s, 'next').zoomPercent === 125)
  assert.ok(Math.abs((await zoomRatio('projector')) - 1.25) < 0.02, 'projector really zoomed')
  assert.ok(Math.abs((await zoomRatio('next')) - 1.25) < 0.02, 'preview follows projector')
  await call(() => globalThis.__presenter.zoom('next', 'out'))
  s = await waitFor('zoom via preview goes to its screen', (s) => out(s, 'projector').zoomPercent === 110 && out(s, 'next').zoomPercent === 110)
  console.log('ok 6b zoom')

  // 7. Timer: rings at zero; a key stops the alarm and does not turn the page.
  await call(() => globalThis.__presenter.timerStart(2))
  s = await waitFor('alarm', (s) => s.timer.alarming, 6000)
  await press('ArrowRight')
  s = await waitFor('alarm stopped', (s) => !s.timer.alarming)
  assert.equal(out(s, 'projector').shownIndex, 5)
  console.log('ok 7 timer alarm and dismiss')

  // 8. Extra screen with the same deck joins the linked group.
  await call(() => globalThis.__presenter.addScreen(true))
  s = await waitFor('extra detected', (s) => out(s, 'screen-3')?.adapter === 'uxd202')
  await press('ArrowRight')
  s = await waitFor('extra moves', (s) => out(s, 'projector').shownIndex === 6 && out(s, 'screen-3').shownIndex === 6)
  await call(() => globalThis.__presenter.removeScreen('screen-3'))
  console.log('ok 8 extra screen')

  // 8b. A screen with another deck: selecting it moves the preview, slide list and notes to that deck.
  const OTHER = path.join(here, 'fixtures', 'frameworks', 'plain-goto1', 'index.html')
  await call((_e, p) => {
    globalThis.__presenter.pickDeck = async () => ({ path: p, name: 'Other deck' })
  }, OTHER)
  await call(() => globalThis.__presenter.addScreen(false))
  s = await waitFor('other deck connected', (s) => out(s, 'screen-4')?.total === 4)
  await call(() => {
    globalThis.__presenter.setLinked('screen-4', false)
    globalThis.__presenter.select('screen-4')
  })
  s = await waitFor('preview shows the other deck', (s) => out(s, 'next').deck?.name === 'Other deck' && out(s, 'next').total === 4 && out(s, 'next').shownIndex === 1)
  assert.equal(s.slidesOf, 'screen-4', 'slide list of the other deck')
  assert.equal(s.slides[0].notes, 'Script one EN\n\n脚本一', 'notes of the other deck')
  await call(() => globalThis.__presenter.navigate({ type: 'last' }))
  s = await waitFor('other deck at its end', (s) => out(s, 'screen-4').shownIndex === 3 && out(s, 'next').shownIndex === 3)
  assert.equal(out(s, 'projector').shownIndex, 6, 'projector did not move')
  await call(() => globalThis.__presenter.removeScreen('screen-4'))
  s = await waitFor('preview back on the projector deck', (s) => out(s, 'next').deck?.name === out(s, 'projector').deck.name && out(s, 'next').shownIndex === 7)
  console.log('ok 8b preview and notes follow a screen with another deck')

  // Steps 9-15 show the projector window and capture the desktop.
  if (!HEADLESS) {
    // 9. Screenshots before projecting: console DOM, and the real desktop with the live views.
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, 'console-uxd202.png') })
    await call(() => globalThis.__presenter.consoleWin.win.moveTop())
    await sleep(800)
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'capture.ps1'), '-Out', path.join(OUT, 'desktop-console.png')])

    // 9b. F5 starts projecting; pages still turn; Esc stops and the deck returns to the console.
    await press('F5')
    s = await waitFor('projecting', (s) => s.projecting)
    assert.equal(await projectorVisible(), true, 'projector window shown')
    assert.equal(await projectorInConsole(), false, 'deck moved to the projector window')
    await press('ArrowRight')
    s = await waitFor('move while projecting', (s) => out(s, 'projector').shownIndex === 7 && out(s, 'next').shownIndex === 8)
    await press('Escape')
    s = await waitFor('stopped', (s) => !s.projecting)
    assert.equal(await projectorVisible(), false, 'projector window hidden again')
    assert.equal(await projectorInConsole(), true, 'deck back in the console')
    console.log('ok 9 project with F5, stop with Esc')

    // 10. Any HTML: key mode drives a plain deck with real arrow keys.
    await call((_e, p) => globalThis.__presenter.openMainDeck(p), PLAIN_DECK)
    s = await waitFor('keys mode', (s) => out(s, 'projector').adapter === 'keys' && out(s, 'next').adapter === 'keys', 8000)
    assert.equal(out(s, 'projector').zoomPercent, 100, 'another deck starts at 100%')
    const deckIndex = (id) => call((_e, id) => globalThis.__presenter.outputs.get(id).view.webContents.executeJavaScript('window.__index'), id)
    await sleep(400)
    assert.equal(await deckIndex('projector'), 0)
    assert.equal(await deckIndex('next'), 1)
    await press('ArrowRight')
    await press('ArrowRight')
    await sleep(400)
    assert.equal(await deckIndex('projector'), 2)
    assert.equal(await deckIndex('next'), 3)
    console.log('ok 10 key mode')

    // 11. Timer overlay shows on the projector for a key-mode deck (only while projecting).
    await call(() => globalThis.__presenter.timerStart(30))
    await sleep(300)
    assert.equal(await call(() => globalThis.__presenter.projectorWin.overlay.getVisible()), false, 'no overlay before projecting')
    await call(() => globalThis.__presenter.startProjecting())
    await sleep(500)
    const overlayVisible = await call(() => globalThis.__presenter.projectorWin.overlay.getVisible())
    assert.equal(overlayVisible, true)
    await call(() => globalThis.__presenter.projectorWin.win.moveTop())
    await sleep(1200)
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'capture.ps1'), '-Out', path.join(OUT, 'desktop-overlay.png')])
    await call(() => globalThis.__presenter.timerReset())
    await call(() => globalThis.__presenter.stopProjecting())
    console.log('ok 11 overlay')

    // 12. Zoom is remembered per deck file.
    await call((_e, p) => globalThis.__presenter.openMainDeck(p), UXD_DECK)
    s = await waitFor('zoom remembered', (s) => out(s, 'projector').zoomPercent === 110 && out(s, 'next').zoomPercent === 110)
    await press('Control+Digit0')
    s = await waitFor('zoom reset', (s) => out(s, 'projector').zoomPercent === 100)
    console.log('ok 12 zoom memory')

    // 13. 抽人: no students' screen = console only; while projecting the picture rolls on the
    // projector, keys wait for the landing, then a key closes it without turning the page.
    const pageBefore = out(await state(), 'projector').shownIndex
    await call(() => globalThis.__presenter.rollerRoll())
    s = await waitFor('roll without audience', (s) => s.roller.roll !== null)
    assert.equal(s.roller.showing, false, 'nothing shown without a students screen')
    await call(() => globalThis.__presenter.startProjecting())
    await call(() => globalThis.__presenter.rollerRoll())
    s = await waitFor('roller showing', (s) => s.roller.showing)
    assert.equal(await call(() => globalThis.__presenter.projectorRoller.view.getVisible()), true, 'picture on the projector')
    await press('ArrowRight')
    assert.equal((await state()).roller.showing, true, 'a key during the roll is ignored')
    await sleep(3500)
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'capture.ps1'), '-Out', path.join(OUT, 'desktop-roller.png')])
    await press('ArrowRight')
    s = await waitFor('roller closed', (s) => !s.roller.showing)
    assert.equal(out(s, 'projector').shownIndex, pageBefore, 'closing key did not turn the page')
    assert.equal(s.roller.people.reduce((n, p) => n + p.wins, 0), 2, 'two picks counted')
  await call(() => globalThis.__presenter.rollerReset())
  s = await waitFor('picks reset', (s) => s.roller.people.every((p) => p.wins === 0) && s.roller.roll === null)
    await call(() => globalThis.__presenter.stopProjecting())
    console.log('ok 13 roller')

    // 14. A PowerPoint file: converted, shown page by page, titles and notes from the PPTX,
    // the preview follows, and the projector overlay shows the timer (no deck timer).
    const PPTX = process.env.PPTX ?? 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Curriculum/2026-Autumn/UXD202/Original Slides/UXD202 Lecture n1.pptx'
    await call((_e, p) => globalThis.__presenter.openMainDeck(p), PPTX)
    s = await waitFor('pptx shown', (s) => out(s, 'projector').deckKind === 'slides' && out(s, 'projector').total > 0 && out(s, 'next').shownIndex === 1, 90000)
    assert.equal(s.slides.length, out(s, 'projector').total, 'titles for every page')
    assert.ok(s.slides.some((x) => x.notes), 'speaker notes read from the PPTX')
    await press('ArrowRight')
    s = await waitFor('pptx page turn', (s) => out(s, 'projector').shownIndex === 1 && out(s, 'next').shownIndex === 2)
    await call(() => globalThis.__presenter.startProjecting())
    await call(() => globalThis.__presenter.timerStart(30))
    await sleep(500)
    assert.equal(await call(() => globalThis.__presenter.projectorWin.overlay.getVisible()), true, 'overlay timer for a PPT deck')
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'capture.ps1'), '-Out', path.join(OUT, 'desktop-pptx.png')])
    await call(() => globalThis.__presenter.timerReset())
    await call(() => globalThis.__presenter.stopProjecting())
    console.log('ok 14 pptx')

    // 15. Marks and the live mirror: P picks the pen, the console mirror switches to live
    // video, the first Esc leaves the pen, the second stops projecting.
    await press('p')
    s = await waitFor('pen tool', (s) => s.ink.tool === 'pen')
    await call(() => globalThis.__presenter.startProjecting())
    const t0 = Date.now()
    while (!(await call(() => globalThis.__presenter.mirrorVideo)) && Date.now() - t0 < 8000) await sleep(200)
    assert.equal(await call(() => globalThis.__presenter.mirrorVideo), true, 'console mirror uses live video')
    await call(() => globalThis.__presenter.inkOp({ t: 'begin', stroke: { id: 'e2e', tool: 'pen', color: '#ef4444', points: [0.2, 0.2, 0.8, 0.8] } }, 'main'))
    await sleep(600)
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'capture.ps1'), '-Out', path.join(OUT, 'desktop-ink.png')])
    await press('Escape')
    s = await waitFor('esc leaves the pen', (s) => s.ink.tool === 'pointer' && s.projecting)
    await press('ArrowRight')
    assert.equal((await call(() => globalThis.__presenter.inkSnapshot())).length, 0, 'marks clear on a page turn')
    await press('Escape')
    s = await waitFor('esc stops projecting', (s) => !s.projecting)
    console.log('ok 15 marks and live mirror')
  }

  assert.deepEqual(errors, [], 'console errors')
  console.log(HEADLESS ? 'SMOKE OK (hidden mode, steps 1-8)' : 'SMOKE OK')
} finally {
  await app.close()
}
