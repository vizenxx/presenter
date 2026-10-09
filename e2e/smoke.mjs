// End-to-end smoke test. Run after `npm run build`: node e2e/smoke.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
// Real decks next to this project on the maintainer's computer (read only); override with DECK / PPTX.
const UXD_DECK = process.env.DECK ?? path.resolve(root, '../2026-Autumn/UXD202/Final Slides/Week-08-Unit 3 Interaction Design and Prototyping.html')
const PLAIN_DECK = path.join(here, 'fixtures', 'plain-deck.html')
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })
// A fresh data folder per run: tests never touch the teacher's recent files or zoom memory.
const USER_DATA = path.join(OUT, 'userdata')
fs.rmSync(USER_DATA, { recursive: true, force: true })
// A warning time saved by 0.2.0 (one time, 3 beeps) must come back as one warning bell.
fs.mkdirSync(USER_DATA, { recursive: true })
fs.writeFileSync(path.join(USER_DATA, 'timer.json'), JSON.stringify({ warnSec: 90 }))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Safety: the full test opens full-screen windows and plays the alarm. With a second display
// connected, a class may be on the projector, so the app runs hidden and muted and only the
// steps without projecting run (1-8), unless explicitly allowed. PRESENTER_E2E_HIDDEN=1 asks for the
// hidden mode on one display too (no window, no sound while someone works at the computer).
const screenCount = Number(
  execFileSync('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens.Count']).toString().trim()
)
const HEADLESS = process.env.PRESENTER_E2E_HIDDEN === '1' || (screenCount > 1 && process.env.PRESENTER_E2E_ALLOW_MULTI !== '1')
if (HEADLESS) console.log(`${screenCount} display(s): hidden mode, steps 1-8 only (no window, no sound).`)
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
  // Open deck starts in the folder of the deck opened last (remembered across restarts).
  assert.equal(path.resolve(await call(() => globalThis.__presenter.deckFolder())), path.resolve(path.dirname(UXD_DECK)), 'Open deck starts in the last deck folder')
  assert.equal(path.resolve(JSON.parse(fs.readFileSync(path.join(USER_DATA, 'folder.json'), 'utf8')).folder), path.resolve(path.dirname(UXD_DECK)), 'the folder is remembered')
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
  s = await waitFor('zoom 110', (s) => out(s, 'projector').zoomPercent === 110 && out(s, 'next').zoomPercent === 110)
  assert.ok(Math.abs((await zoomRatio('projector')) - 1.1) < 0.02, 'projector really zoomed')
  assert.ok(Math.abs((await zoomRatio('next')) - 1.1) < 0.02, 'preview follows projector')
  await call(() => globalThis.__presenter.zoom('next', 'out'))
  s = await waitFor('zoom via preview goes to its screen', (s) => out(s, 'projector').zoomPercent === 105 && out(s, 'next').zoomPercent === 105)
  console.log('ok 6b zoom')

  // 7. Timer: rings at zero; a key stops the alarm and does not turn the page.
  await call(() => globalThis.__presenter.timerStart(2))
  s = await waitFor('alarm', (s) => s.timer.alarming, 6000)
  await press('ArrowRight')
  s = await waitFor('alarm stopped', (s) => !s.timer.alarming)
  assert.equal(out(s, 'projector').shownIndex, 5)
  console.log('ok 7 timer alarm and dismiss')

  // 7b. Warning bells: each beeps its own number of times at its time (here 0:08 with 2 beeps, then remembered); one beep for each of the last five seconds; none at the start.
  const cues = () => call(() => globalThis.__presenter.projectorWin.overlay.webContents.executeJavaScript('document.body.dataset.cues || ""'))
  async function waitForCues(label, pred, ms) {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (pred(await cues())) return
      await sleep(150)
    }
    throw new Error(`timeout: ${label}: ${await cues()}`)
  }
  // Step 7's short timer already beeped; start from an empty record.
  await call(() => globalThis.__presenter.projectorWin.overlay.webContents.executeJavaScript('delete document.body.dataset.cues'))
  s = await state()
  assert.deepEqual(s.timer.warnings, [{ sec: 90, beeps: 3 }], 'the 0.2.0 warning time becomes one bell')
  await call(() => globalThis.__presenter.timerWarnings([{ sec: 8, beeps: 2 }, { sec: 300, beeps: 1 }]))
  s = await waitFor('warning bells set, in the order they ring', (s) => s.timer.warnings.length === 2 && s.timer.warnings[0].sec === 300 && s.timer.warnings[1].sec === 8)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(USER_DATA, 'timer.json'), 'utf8')).warnings, [{ sec: 300, beeps: 1 }, { sec: 8, beeps: 2 }], 'the bells are remembered')
  await call(() => globalThis.__presenter.timerStart(10))
  await sleep(600)
  assert.equal((await cues()).trim(), '', 'no beep when the timer starts')
  await waitForCues('the 0:08 bell beeps twice', (c) => c.includes('warning:2'), 5000)
  await call(() => globalThis.__presenter.timerWarnings([{ sec: 60, beeps: 3 }]))
  await call(() => globalThis.__presenter.timerStart(6))
  await waitForCues('last-seconds beeps', (c) => (c.match(/last-seconds/g) ?? []).length >= 2, 5000)
  await call(() => globalThis.__presenter.timerReset())
  console.log('ok 7b timer warning beeps')

  // 7c. Light or dark look: saved, and the console page follows it.
  await call(() => globalThis.__presenter.setTheme('light'))
  s = await waitFor('light look in the state', (s) => s.theme === 'light')
  const pageTheme = () => call(() => globalThis.__presenter.consoleWin.win.webContents.executeJavaScript('document.documentElement.dataset.theme || ""'))
  for (let i = 0; i < 40 && (await pageTheme()) !== 'light'; i++) await sleep(100)
  assert.equal(await pageTheme(), 'light', 'the console page uses the light look')
  assert.equal(JSON.parse(fs.readFileSync(path.join(USER_DATA, 'theme.json'), 'utf8')).theme, 'light', 'the look is saved')
  await call(() => globalThis.__presenter.setTheme('dark'))
  await waitFor('dark look again', (s) => s.theme === 'dark')
  console.log('ok 7c light and dark look')

  // 7d. Marking keys on a slide and on the floating toolbar: Ctrl+Z undoes, Esc leaves the drawing tool.
  const keyTo = (target, keyCode, modifiers = []) =>
    call((_electron, a) => {
      const wc = a.target === 'toolbar' ? globalThis.__presenter.tools.toolbar.webContents : globalThis.__presenter.outputs.get(a.target).view.webContents
      wc.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers: a.modifiers })
      wc.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers: a.modifiers })
    }, { target, keyCode, modifiers })
  const marks = () => call(() => globalThis.__presenter.scene('projector').strokes.length)
  const markOnce = (id) => call((_electron, id) => globalThis.__presenter.inkOp({ t: 'begin', stroke: { id, tool: 'pen', color: '#ef4444', points: [0.2, 0.2, 0.4, 0.4] } }, 'main'), id)
  async function waitUntil(label, check, ms = 3000) {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await check()) return
      await sleep(100)
    }
    throw new Error(`timeout: ${label}`)
  }
  await call(() => globalThis.__presenter.setInkTool('pen'))
  await markOnce('key-1')
  assert.equal(await marks(), 1, 'one mark on the slide')
  await keyTo('projector', 'Z', ['control'])
  await waitUntil('Ctrl+Z on the slide undoes', async () => (await marks()) === 0)
  await keyTo('projector', 'Escape')
  s = await waitFor('Esc on the slide leaves the pen', (s) => s.ink.tool === 'pointer')
  assert.equal(s.projecting, false, 'Esc while drawing does not stop or start anything else')
  await call(() => globalThis.__presenter.setInkTool('arrow'))
  await markOnce('key-2')
  await keyTo('toolbar', 'Z', ['control'])
  await waitUntil('Ctrl+Z on the floating toolbar undoes', async () => (await marks()) === 0)
  await keyTo('toolbar', 'Escape')
  await waitFor('Esc on the floating toolbar leaves the arrow', (s) => s.ink.tool === 'pointer')
  console.log('ok 7d Ctrl+Z and Esc on a slide and on the floating toolbar')

  // 7e. Change the time of a running timer: add, take away (one second stays), and give a rung timer more time.
  await call(() => globalThis.__presenter.timerStart(120))
  await call(() => globalThis.__presenter.timerAdjust(60))
  s = await waitFor('class timer + 1:00', (s) => s.timer.remainingSec >= 177 && s.timer.remainingSec <= 180)
  await call(() => globalThis.__presenter.timerAdjust(-999))
  s = await waitFor('class timer keeps one second', (s) => s.timer.status === 'running' && s.timer.remainingSec === 1)
  s = await waitFor('then it rings', (s) => s.timer.alarming, 4000)
  await call(() => globalThis.__presenter.timerAdjust(30))
  s = await waitFor('a rung timer runs again for the added time', (s) => s.timer.status === 'running' && !s.timer.alarming && s.timer.remainingSec >= 28)
  await call(() => globalThis.__presenter.timerReset())
  await call(() => globalThis.__presenter.speakerMode('down'))
  await call(() => globalThis.__presenter.speakerAdjust(60))
  s = await state()
  assert.equal(s.speaker.heldMs, 0, 'My timer does not change before it starts')
  await call(() => globalThis.__presenter.speakerToggle())
  await call(() => globalThis.__presenter.speakerAdjust(60))
  s = await state()
  assert.ok(s.speaker.heldMs <= -59_000 && s.speaker.heldMs >= -60_000, `My timer counting down got one more minute (${s.speaker.heldMs})`)
  await call(() => globalThis.__presenter.speakerReset())
  console.log('ok 7e change the time of a running timer')

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

  // 8c. The projector menu decides what the audience sees; selecting a card does not.
  // A projector shows one content; the one it showed waits and keeps its page.
  const inConsole = (id) => call((_e, id) => globalThis.__presenter.consoleWin.win.contentView.children.includes(globalThis.__presenter.outputs.get(id).view), id)
  await call(() => globalThis.__presenter.addScreen(false))
  s = await waitFor('screen 5 waits', (s) => out(s, 'screen-5')?.total === 4)
  assert.equal(out(s, 'screen-5').shownOn, null, 'a new content waits (no window)')
  await call(() => globalThis.__presenter.select('screen-5'))
  s = await state()
  assert.equal(s.onAirId, 'projector', 'selecting does not change what the audience sees')
  await call(() => globalThis.__presenter.showOn('screen-5', 1))
  s = await state()
  assert.equal(s.onAirId, 'screen-5', 'screen 5 on Projector 1')
  assert.equal(out(s, 'projector').shownOn, null, 'screen 1 waits')
  assert.equal(await inConsole('screen-5'), true, 'screen 5 in the current pane')
  assert.equal(await inConsole('projector'), false, 'screen 1 left the current pane')
  await call(() => globalThis.__presenter.startProjecting())
  assert.equal(await call(() => globalThis.__presenter.projectorWin.content === globalThis.__presenter.outputs.get('screen-5').view), true, 'Projector 1 shows screen 5')
  const page1 = out(s, 'projector').shownIndex
  await call(() => globalThis.__presenter.showOn('projector', 'new'))
  s = await state()
  assert.deepEqual(s.projectors.map((p) => [p.number, p.contentId]), [[2, 'projector']], 'Projector 2 opened with screen 1')
  assert.equal(await call(() => globalThis.__presenter.extras.get(2).screen.shows(globalThis.__presenter.outputs.get('projector').view)), true, 'Projector 2 window shows screen 1')
  assert.equal(out(s, 'projector').shownIndex, page1, 'screen 1 kept its page')
  await call(() => globalThis.__presenter.showOn('projector', 1))
  s = await state()
  assert.equal(s.onAirId, 'projector', 'screen 1 back on Projector 1')
  assert.equal(out(s, 'screen-5').shownOn, null, 'screen 5 waits again')
  assert.deepEqual(s.projectors.map((p) => [p.number, p.contentId]), [[2, null]], 'Projector 2 now shows nothing')
  await call(() => globalThis.__presenter.closeProjector(2))
  s = await waitFor('projector 2 closed', (s) => s.projectors.length === 0)
  await call(() => globalThis.__presenter.stopProjecting())
  assert.equal(await inConsole('projector'), true, 'screen 1 back in the current pane')
  await call(() => globalThis.__presenter.removeScreen('screen-5'))
  console.log('ok 8c projector menu: Projector 1, a new Projector 2, pages kept')

  // Steps 9-15 show the projector window and capture the desktop.
  if (!HEADLESS) {
    // 9. Screenshots before projecting: console DOM, and the real desktop with the live views.
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, 'console-uxd202.png') })
    await call(() => globalThis.__presenter.consoleWin.win.moveTop())
    await sleep(800)

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
    await call(() => globalThis.__presenter.timerReset())
    await call(() => globalThis.__presenter.stopProjecting())
    console.log('ok 11 overlay')

    // 12. Zoom is remembered per deck file.
    await call((_e, p) => globalThis.__presenter.openMainDeck(p), UXD_DECK)
    s = await waitFor('zoom remembered', (s) => out(s, 'projector').zoomPercent === 105 && out(s, 'next').zoomPercent === 105)
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
    const PPTX = process.env.PPTX ?? path.resolve(root, '../2026-Autumn/UXD202/Original Slides/UXD202 Lecture n1.pptx')
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
    await press('Escape')
    s = await waitFor('esc leaves the pen', (s) => s.ink.tool === 'pointer' && s.projecting)
    await press('ArrowRight')
    assert.equal((await call(() => globalThis.__presenter.inkSnapshot())).length, 0, 'marks clear on a page turn')
    await press('Escape')
    s = await waitFor('esc stops projecting', (s) => !s.projecting)
    console.log('ok 15 marks and live mirror')

    // 16. Window screen: a program window shown live; clicking its card brings it to the front
    // and puts it on the projector. The test uses its own window only (no desktop capture).
    const TEST_TITLE = 'Presenter e2e window'
    await call(({ BrowserWindow }, title) => {
      const w = new BrowserWindow({ width: 640, height: 400, title, show: true })
      w.on('page-title-updated', (e) => e.preventDefault())
      void w.loadURL('data:text/html,<body style="margin:0;background:%23087f5b"><h1 style="color:white;font:64px sans-serif;margin:40px">e2e window</h1></body>')
      globalThis.__e2eWin = w
    }, TEST_TITLE)
    await sleep(1500)
    // Minimized, like most windows a teacher leaves open: it must still be listed (as in Zoom).
    await call(() => globalThis.__e2eWin.minimize())
    await sleep(800)
    const src = await call(async (_e, title) => (await globalThis.__presenter.listWindows()).map(({ id, name, minimized }) => ({ id, name, minimized })).find((w) => w.name === title), TEST_TITLE)
    assert.ok(src, 'the minimized test window is in the window list')
    assert.equal(src.minimized, true, 'listed as minimized')
    await call((_e, w) => globalThis.__presenter.addWindowScreen(w.id, w.name), src)
    s = await waitFor('window screen added', (s) => s.outputs.some((o) => o.kind === 'capture'))
    await sleep(1000)
    assert.equal(await call(() => globalThis.__e2eWin.isMinimized()), true, 'adding it leaves the window as it is')
    const wid = s.outputs.find((o) => o.kind === 'capture').id
    await call(() => globalThis.__presenter.consoleWin.win.focus())
    await sleep(300)
    await call((_e, id) => globalThis.__presenter.select(id), wid)
    await sleep(1000)
    s = await state()
    assert.equal(s.onAirId, 'projector', 'clicking the window card does not change what the audience sees')
    assert.equal(await call(() => globalThis.__e2eWin.isMinimized()), true, 'clicking the card does not bring the window forward')
    await call((_e, id) => globalThis.__presenter.showOn(id, 1), wid)
    s = await state()
    assert.equal(s.onAirId, wid, 'the projector menu puts it on Projector 1')
    const videoWidth = await call(async (_e, id) => {
      const wc = globalThis.__presenter.outputs.get(id).view.webContents
      for (let i = 0; i < 40; i++) {
        const w = await wc.executeJavaScript('document.querySelector("video").videoWidth').catch(() => 0)
        if (w > 0) return w
        await new Promise((r) => setTimeout(r, 250))
      }
      return 0
    }, wid)
    assert.ok(videoWidth > 0, 'the window is shown live')
    let raised = false
    for (let i = 0; i < 25 && !raised; i++) {
      raised = await call(() => globalThis.__e2eWin.isFocused())
      if (!raised) await sleep(200)
    }
    assert.ok(raised, 'the window came to the front')

    // 17. Floating tools over the program window in front: the toolbar and the ink pad come up,
    // the pad lies on the window, marks belong to the window, and all of it hides behind the console.
    const toolsShown = () => call(() => globalThis.__presenter.tools.isShown())
    let toolsUp = false
    for (let i = 0; i < 25 && !toolsUp; i++) {
      toolsUp = await toolsShown()
      if (!toolsUp) await sleep(150)
    }
    assert.ok(toolsUp, 'tools shown over the window in front')
    const fit = await call(() => {
      const p = globalThis.__presenter.tools.pad.getBounds()
      const w = globalThis.__e2eWin.getBounds()
      return [p.x - w.x, p.y - w.y, p.width - w.width, p.height - w.height]
    })
    assert.ok(Math.abs(fit[0]) <= 12 && Math.abs(fit[1]) <= 12 && Math.abs(fit[2]) <= 24 && Math.abs(fit[3]) <= 24, `ink pad lies on the window (${fit})`)
    s = await state()
    assert.equal(s.toolsFor, wid, 'the tools serve this window')
    await call(() => globalThis.__presenter.setInkTool('pen'))
    await call(() => globalThis.__presenter.inkOp({ t: 'begin', stroke: { id: 'w1', tool: 'pen', color: '#ef4444', points: [0.1, 0.1, 0.5, 0.5] } }, 'pad'))
    assert.equal(await call((_e, id) => globalThis.__presenter.scene(id).strokes.length, wid), 1, 'the mark belongs to the window content')
    assert.equal(await call(() => globalThis.__presenter.scene('projector').strokes.length), 0, 'the deck has no marks')
    // Drawing on the window gives the toolbar the keyboard (Esc and Ctrl+Z must not reach the program);
    // Esc there returns to the pointer and gives the keyboard back to the window.
    await call(() => globalThis.__presenter.padPointer())
    await sleep(600)
    assert.equal(await call(() => globalThis.__presenter.tools.toolbar.isFocused()), true, 'the toolbar takes the keyboard while drawing on the window')
    await call(() => {
      const wc = globalThis.__presenter.tools.toolbar.webContents
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    })
    await waitFor('Esc on the toolbar leaves the pen', (s) => s.ink.tool === 'pointer')
    let windowHasKeys = false
    for (let i = 0; i < 20 && !windowHasKeys; i++) {
      windowHasKeys = await call(() => globalThis.__e2eWin.isFocused())
      if (!windowHasKeys) await sleep(150)
    }
    assert.ok(windowHasKeys, 'the window gets the keyboard back after Esc')
    // Using the toolbar (it becomes the window in front) must keep the tools up.
    await call(() => globalThis.__presenter.tools.toolbar.focus())
    await sleep(800)
    assert.equal(await toolsShown(), true, 'tools stay while the toolbar is used')
    const barSize = await call(() => globalThis.__presenter.tools.toolbar.getBounds())
    assert.ok(barSize.height <= 60 && barSize.width > 600, `toolbar is one wide row (${barSize.width} x ${barSize.height})`)
    const clickBar = (text) => call((_e, text) => globalThis.__presenter.tools.toolbar.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (b) b.click(); return !!b })()`), text)
    assert.equal(await clickBar('Roll'), true, 'the toolbar has a Roll button')
    s = await waitFor('roll from the toolbar', (s) => s.roller.roll !== null, 4000)
    assert.equal(await clickBar('Timer'), true, 'the toolbar has a Timer button')
    await sleep(400)
    assert.equal(await call(() => globalThis.__presenter.tools.toolbar.webContents.executeJavaScript('!!document.querySelector("input[title=Minutes]")')), true, 'Timer opens its settings')
    await sleep(3500)
    await call(() => globalThis.__presenter.rollerHide())
    await call(() => globalThis.__presenter.rollerReset())
    await call(() => globalThis.__presenter.consoleWin.win.focus())
    let toolsGone = false
    for (let i = 0; i < 25 && !toolsGone; i++) {
      toolsGone = !(await toolsShown())
      if (!toolsGone) await sleep(150)
    }
    assert.ok(toolsGone, 'tools hide when the console is in front')
    console.log('ok 17 floating tools: over the window in front, pad on the window, marks on the window, hidden behind the console')
    await call(() => globalThis.__presenter.startProjecting())
    assert.equal(await call((_e, id) => globalThis.__presenter.projectorWin.content === globalThis.__presenter.outputs.get(id).view, wid), true, 'projector window shows the window screen')
    await call(() => globalThis.__presenter.stopProjecting())
    await call((_e, id) => globalThis.__presenter.removeScreen(id), wid)
    s = await state()
    assert.equal(s.onAirId, 'projector', 'removing it puts screen 1 back')
    // The start screen's choice: a program window as the content shown on Projector 1 at once.
    await call((_e, w) => globalThis.__presenter.addWindowScreen(w.id, w.name, true), src)
    s = await waitFor('window straight onto Projector 1', (s) => s.outputs.some((o) => o.kind === 'capture' && o.id === s.onAirId))
    const wid2 = s.onAirId
    await call((_e, id) => globalThis.__presenter.removeScreen(id), wid2)
    s = await state()
    assert.equal(s.onAirId, 'projector', 'removing it puts screen 1 back')
    await call(() => globalThis.__e2eWin.destroy())
    console.log('ok 16 window content: listed when minimized, untouched until shown, then brought forward and live on Projector 1')
  }

  assert.deepEqual(errors, [], 'console errors')
  console.log(HEADLESS ? 'SMOKE OK (hidden mode, steps 1-8)' : 'SMOKE OK')
} finally {
  await app.close()
}
