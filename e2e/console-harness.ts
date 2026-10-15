/**
 * Off-screen layout check of the console page with a sample state, in the dark and the light look,
 * at the laptop's console size. No window appears. Build first, then: npm run check:console
 */
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { aiRequestText } from '../src/shared/guide'
import type { AppState, UiTheme } from '../src/shared/types'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
const STUB = path.join(OUT, 'harness', 'console-stub-preload.cjs')
const AI_REQUEST = aiRequestText(fs.readFileSync(path.join(ROOT, 'docs', 'ai-integration.md'), 'utf8'))
/** Every ConsoleApi method (contextBridge copies plain objects only, so no Proxy). */
const API_METHODS = ["onState", "onMirror", "openDialog", "openPath", "pathForFile", "navigate", "key", "select", "setLinked", "nudge", "addScreen", "removeScreen", "timerStart", "timerToggle", "timerReset", "timerDismiss", "layoutPreview", "layoutCurrent", "startProjecting", "stopProjecting", "zoom", "rollerRoll", "rollerHide", "rollerReset", "rollerSetSuperLucky", "rollerSelectList", "rollerSaveList", "rollerDeleteList", "dismissDeckStatus", "setInkTool", "setInkColor", "inkOp", "onInkOp", "inkSnapshot", "mirrorMode", "guide", "copyText", "saveGuideFile", "showOn", "projectorFullscreen", "closeProjector", "speakerMode", "speakerMinutes", "speakerToggle", "speakerReset", "toolbarSize", "focusConsole", "listWindows", "addWindowScreen", "setTheme", "setFlipped", "dismissResumed", "replaceScreen", "switchTo", "raiseWindow", "projectorClick", "mediaFullscreen", "timerWarnings", "speakerAdjust", "timerAdjust", "timerSet", "speakerPeriods", "setBlank", "savePicture", "addWhiteboard", "rollerGroups", "rollerClearGroups", "mediaToggle"]

app.disableHardwareAcceleration()
// Each screenshot closes its window; keep the app alive between them.
app.on('window-all-closed', () => undefined)
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** crowd = six extra screens and the next preview selected (checks that the screens bar stays in view). */
function sampleState(projecting: boolean, crowd = false, theme: UiTheme = 'dark'): AppState {
  const deck = { path: 'C:/decks/UXD202 Lecture n1.pptx', name: 'UXD202 Lecture n1' }
  const base = { deck, adapter: 'uxd202' as const, total: 18, linked: true, fullscreen: false, zoomPercent: 100, deckKind: 'slides' as const, captureName: null, shownOn: null as number | null }
  return {
    outputs: [
      { ...base, id: 'projector', kind: 'projector', shownOn: crowd ? null : 1, screenNumber: 1, index: 2, shownIndex: 2, title: 'The first stage of the product development life cycle' },
      { ...base, id: 'next', kind: 'preview', screenNumber: 0, index: 3, shownIndex: 3, title: 'The goal is to figure out the specifications' },
      { ...base, id: 'screen-2', kind: 'window', shownOn: crowd ? 1 : null, screenNumber: 2, index: 2, shownIndex: 2, linked: false, title: 'The first stage of the product development life cycle' },
      ...(crowd ? [3, 4, 5, 6].map((n) => ({ ...base, id: `screen-${n}`, kind: 'window' as const, screenNumber: n, index: n, shownIndex: n, title: `Slide ${n + 1}` })) : []),
      { ...base, id: 'window-7', kind: 'capture', screenNumber: 7, deck: null, deckKind: null, adapter: 'none', total: null, index: 0, shownIndex: 0, linked: false, title: '', captureName: 'Video player – lesson clip.mp4', shownOn: crowd ? 2 : null }
    ],
    selectedId: crowd ? 'next' : 'projector',
    mainDeck: deck,
    slidesOf: 'projector',
    onAirId: crowd ? 'screen-2' : 'projector',
    speaker: { mode: 'down', minutes: 45, startedAt: null, heldMs: 754000, periods: [{ days: [1, 2, 3, 4, 5], fromSec: 9 * 3600, untilSec: 10 * 3600 + 50 * 60 }], clockExtra: null },
    toolsFor: crowd ? 'window-7' : null,
    projectors: crowd ? [{ number: 2, contentId: 'window-7', fullscreen: true }] : [],
    previewOf: 'projector',
    slides: Array.from({ length: 18 }, (_, i) => ({ title: `Slide title ${i + 1}`, notes: i === 2 ? 'Ask the class first.' : '' })),
    milestones: [],
    timer: { status: 'running', remainingSec: 297, durationSec: 300, alarming: false, warnings: [{ sec: 60, beeps: 3 }] },
    plannedMinutes: null,
    recent: [deck],
    hasExternalDisplay: true,
    projecting,
    projectorSize: { width: 1920, height: 1080 },
    previewSize: { width: 1920, height: 1080 },
    roller: { lists: [{ id: 'l', name: 'Class list', count: 6 }], activeListId: 'l', activeText: '', people: ['Ann Lee', 'Bo Chen', 'Cai Dorji', 'Dema Wangmo', 'Eli Tashi', 'Fay Zangpo'].map((name, i) => ({ id: `1225010${i}`, name, wins: [1, 0, 2, 0, 0, 0][i] })), superLucky: true, roll: null, showing: false, groups: null },
    deckStatus: { state: 'ready' },
    ink: { tool: 'pen', color: '#ef4444' },
    zoomed: false,
    theme,
    flipped: false,
    blank: null,
    resumedAt: null
  }
}

const SAMPLE_WINDOWS = ['Browser – Class website', 'Video player – lesson clip.mp4', 'Spreadsheet – marks.xlsx'].map((name, i) => ({ id: `window:${100 + i}:0`, name, app: ['Microsoft Edge', 'VLC media player', 'Microsoft Excel'][i], icon: '', minimized: i === 2, thumbnail: i === 2 ? '' : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='%23334155'/><rect x='20' y='20' width='280' height='30' fill='%2394a3b8'/></svg>" }))

function writeStub(state: AppState, ticks = false): void {
  fs.mkdirSync(path.dirname(STUB), { recursive: true })
  fs.writeFileSync(
    STUB,
    `const { contextBridge } = require('electron')
const state = ${JSON.stringify(state)}
const noop = () => {}
const calls = []
const api = {}
for (const key of ${JSON.stringify(API_METHODS)}) api[key] = (...args) => { calls.push([key, ...args]) }
api.__calls = () => JSON.parse(JSON.stringify(calls))
api.onState = (cb) => {
  setTimeout(() => cb(state), 50)
  // A running timer: the shared timer's time and My timer's held time move on every 0.4 s, like a fast clock.
  if (${ticks}) { let n = 0; setInterval(() => { n++; cb({ ...state, timer: { ...state.timer, remainingSec: state.timer.remainingSec - n } }) }, 400) }
}
api.onInkOp = () => noop
api.inkSnapshot = () => Promise.resolve([])
api.pathForFile = () => ''
api.guide = () => Promise.resolve({ aiRequest: ${JSON.stringify(AI_REQUEST)} })
api.saveGuideFile = () => Promise.resolve(null)
api.listWindows = () => Promise.resolve(${JSON.stringify(SAMPLE_WINDOWS)})
contextBridge.exposeInMainWorld('presenter', api)
`
  )
}

type Open = 'guide' | 'guide-prepare' | 'window-picker' | 'start' | 'screen-menu' | 'add-menu' | 'crowd' | 'roller' | 'bells' | 'adjust' | 'clock' | 'media' | 'slides' | 'notes' | null
/** Clicks the button that opens each pop-up. */
const OPENERS: Record<string, string> = {
  guide: `[...document.querySelectorAll('header button')].find((x) => x.title.startsWith('How to use Presenter'))`,
  'guide-prepare': `(() => { [...document.querySelectorAll('header button')].find((x) => x.title.startsWith('How to use Presenter')).click(); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.startsWith('2'))), 300)) })()`,
  'screen-menu': `[...document.querySelectorAll('footer button')].find((x) => x.textContent.trim() === '⋯')`,
  'window-picker': `(() => { [...document.querySelectorAll('footer button')].find((x) => x.textContent.includes('＋')).click(); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('button')].find((x) => x.textContent.startsWith('A window'))), 300)) })()`,
  'add-menu': `[...document.querySelectorAll('footer button')].find((x) => x.textContent.includes('＋'))`,
  roller: `[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Participants')`,
  slides: `[...document.querySelectorAll('[aria-label="Slides and notes"] button')].find((x) => x.textContent.trim() === 'Slides')`,
  notes: `[...document.querySelectorAll('[aria-label="Slides and notes"] button')].find((x) => x.textContent.trim() === 'Notes')`,
  bells: `[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Warning bells of the shared timer'))`,
  adjust: `[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '±')`,
  clock: `[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Sessions:'))`
}

async function shot(projecting: boolean, open: Open = null, page = 'console', theme: UiTheme = 'dark'): Promise<void> {
  const state = sampleState(projecting, open === 'crowd', theme)
  if (open === 'start') {
    // First start: no deck yet (Open deck, or a program window as the first content).
    state.mainDeck = null
    state.outputs = state.outputs.filter((o) => o.kind !== 'capture' && o.kind !== 'window').map((o) => ({ ...o, deck: null, deckKind: null, total: null }))
  }
  // My timer by clock times, its 🕘 pop-up open.
  if (open === 'clock') state.speaker = { ...state.speaker, mode: 'clock', heldMs: 0 }
  // The picker with made groups (light look): Shuffle again and Clear show; without groups (dark look) the hint does.
  if (open === 'roller' && theme === 'light') state.roller.groups = [['Ann Lee', 'Bo Chen', 'Cai Dorji'], ['Dema Wangmo', 'Eli Tashi', 'Fay Zangpo']]
  // Three warning bells: the timer panel must still fit.
  if (open === 'bells') state.timer.warnings = [{ sec: 300, beeps: 1 }, { sec: 120, beeps: 2 }, { sec: 30, beeps: 5 }]
  // A PPT slide with a video (playing) and a sound: their buttons sit next to the slide title.
  // …and click animations: one of three shown.
  if (open === 'media') state.outputs[0] = { ...state.outputs[0], media: { kinds: ['video', 'audio'], playing: 0 }, steps: { count: 3, done: 1 } }
  writeStub(state)
  // The toolbar starts in a 520 x 56 window, as in the app (src/main/windowTools.ts).
  const win = new BrowserWindow({ show: false, width: page === 'console' ? 1536 : 520, height: page === 'console' ? 864 : 56, useContentSize: true, backgroundColor: '#475569', webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  // A page load can be refused while the previous window is still closing; retry once.
  await win.loadFile(path.join(ROOT, 'out', 'renderer', `${page}.html`)).catch(async () => {
    await wait(500)
    await win.loadFile(path.join(ROOT, 'out', 'renderer', `${page}.html`))
  })
  await wait(1200)
  if (open && OPENERS[open]) {
    const opened = await win.webContents.executeJavaScript(`(async () => { const b = await ${OPENERS[open]}; if (b) b.click(); return !!b })()`)
    if (!opened) throw new Error(`${open} button not found`)
    await wait(600)
  }
  if (page === 'toolbar') {
    // One row however narrow the window starts, and nothing painted outside the rounded bar.
    const bar = await win.webContents.executeJavaScript('(() => { const r = document.getElementById("root").firstElementChild.getBoundingClientRect(); return [Math.ceil(r.width), Math.ceil(r.height)] })()')
    if (bar[1] > 56) throw new Error(`toolbar wraps: ${bar[0]} x ${bar[1]}`)
    if (bar[0] <= 520) throw new Error(`toolbar squeezed to the window: ${bar[0]} px`)
    const bodyBg = await win.webContents.executeJavaScript('getComputedStyle(document.body).backgroundColor')
    if (bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') throw new Error(`toolbar page not see-through: ${bodyBg}`)
    win.setContentSize(bar[0], bar[1])
    await wait(300)
  }
  if (open === 'media') {
    const labels = await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /^(Video|Sound)( [0-9]+)?$/.test(t))`)
    if (labels.join('|') !== 'Video 1|Sound 2') throw new Error(`media buttons: ${JSON.stringify(labels)}`)
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Sound 2')).click()`)
    const calls = await win.webContents.executeJavaScript('window.presenter.__calls()')
    if (!calls.some((c: unknown[]) => c[0] === 'mediaToggle' && c[1] === 1)) throw new Error('▶ Sound 2 did not ask to play the sound')
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Full screen')).click()`)
    const after = await win.webContents.executeJavaScript('window.presenter.__calls()')
    if (!after.some((c: unknown[]) => c[0] === 'mediaFullscreen')) throw new Error('Full screen did not ask for full screen')
    const stepsText = await win.webContents.executeJavaScript(`document.body.innerText.includes('1/3 clicks')`)
    if (!stepsText) throw new Error('the slide line does not show 1/3 clicks')
  }
  if (page === 'console' && open === null && !projecting) {
    const text = await win.webContents.executeJavaScript('document.body.innerText')
    if (text.includes('Slide title 18') || text.includes('Ask the class first.')) throw new Error('the slide bar is open by itself')
    // The two buttons are in the current slide's row, at its left edge; no column of their own.
    const where = await win.webContents.executeJavaScript(`(() => { const g = document.querySelector('[aria-label="Slides and notes"]'); const pane = g && g.closest('section'); if (!pane) return null; const r = g.getBoundingClientRect(); const p = pane.getBoundingClientRect(); const nav = document.querySelector('nav'); return { left: r.left - p.left, inPane: pane.textContent.includes('Slide 3 / 18'), nav: !!nav } })()`)
    if (!where || !where.inPane || where.left > 40 || where.nav) throw new Error(`the Slides and Notes buttons are not at the left of the current slide's row: ${JSON.stringify(where)}`)
  }
  if (open === 'notes') {
    const text = await win.webContents.executeJavaScript('document.body.innerText')
    if (!text.includes('Notes · slide 3') || !text.includes('Ask the class first.')) throw new Error('the notes of the slide in view are not in the bar')
  }
  if (open === 'slides') {
    const text = await win.webContents.executeJavaScript('document.body.innerText')
    if (!text.includes('Slide title 1') || !text.includes('Slide title 18')) throw new Error(`the slide list is not in the pop-up: ${text.slice(0, 80)}`)
  }
  if (open === 'roller') {
    // With teams already made the panel opens on Teams; otherwise it opens on Pick one: switch to Teams to read its hint.
    if (theme !== 'light') {
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Teams').click()`)
      await wait(200)
    }
    const text = await win.webContents.executeJavaScript('document.body.innerText')
    const withGroups = theme === 'light'
    if (withGroups !== (text.includes('Shuffle again') && text.includes('Clear'))) throw new Error(`the picker ${withGroups ? 'with groups lacks Shuffle again or Clear' : 'without groups shows them'}`)
    if (!withGroups && !text.includes('Splits this list into teams at random')) throw new Error('the picker without groups has no hint')
  }
  const image = await win.webContents.capturePage()
  const name = `${page}${projecting ? '-projecting' : ''}${open ? `-${open}` : ''}${theme === 'light' ? '-light' : ''}.png`
  fs.writeFileSync(path.join(OUT, name), image.toPNG())
  const overflow = await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight')
  // A dialog must fit inside the window (its body scrolls instead).
  const dialogCut = await win.webContents.executeJavaScript(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return false; const r = d.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight })()`)
  if (dialogCut) throw new Error(`${open}: the dialog runs off the window`)
  console.log(`ok ${name}${overflow ? ' (page scrolls!)' : ''}`)
  win.destroy()
  await wait(300)
}

/** Real typing and holding in the console page: number boxes empty fully, seconds start, A+ repeats while held. */
async function inputs(): Promise<void> {
  // An HTML deck: Text size works only for HTML.
  const state = sampleState(false)
  state.outputs = state.outputs.map((o) => (o.deck ? { ...o, deckKind: 'html' as const } : o))
  // A stopped shared timer: Set works only then.
  state.timer = { status: 'idle', remainingSec: 300, durationSec: 300, alarming: false, warnings: [{ sec: 60, beeps: 3 }] }
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1536, height: 864, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1200)
  const wc = win.webContents
  const js = <T>(code: string): Promise<T> => wc.executeJavaScript(code) as Promise<T>
  const key = async (keyCode: string): Promise<void> => {
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await wait(60)
  }
  const field = (title: string): string => `document.querySelector('input[title="${title}"]')`
  // This hidden page never has the keyboard, so leaving a box fires no blur here; send the event React listens to.
  const leave = (title: string): Promise<unknown> => js(`${field(title)}.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`)
  const calls = (): Promise<unknown[][]> => js('window.presenter.__calls()')

  const clickText = (text: string): Promise<boolean> => js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b })()`)

  // One Start in the shared timer: Set only sets the time; the Start button starts it.
  const starts = await js<number>(`[...document.querySelectorAll('section')].filter((x) => x.textContent.includes('Participants see it')).flatMap((x) => [...x.querySelectorAll('button')]).filter((b) => b.textContent.trim() === 'Start').length`)
  if (starts !== 1) throw new Error(`the shared timer has ${starts} Start buttons`)
  // The time is its own entry: double-click the minutes, type, Enter. Stopped, it sets the time Start will use.
  const sharedTime = `[...document.querySelectorAll('section')].find((x) => x.textContent.includes('Participants see it'))`
  await js(`${sharedTime}.querySelector('[role=button]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(100)
  if (!(await js<boolean>(`!!${field('Minutes')}`))) throw new Error('a double-click on the minutes does not open the minutes box')
  await key('Backspace')
  await key('Backspace')
  await key('7')
  await key('Enter')
  await wait(100)
  const setTo = (await calls()).filter((c) => c[0] === 'timerSet').map((c) => c[1])
  if (setTo.join(',') !== '420') throw new Error(`typing 7 in the minutes of a stopped timer sets 7:00 (420 s): ${JSON.stringify(setTo)}`)
  if ((await calls()).some((c) => c[0] === 'timerStart' || c[0] === 'timerAdjust')) throw new Error('editing the time of a stopped timer started or adjusted it')
  if (await js<boolean>(`!!${field('Minutes')}`)) throw new Error('the minutes box stays after Enter')
  // Esc leaves it as it was.
  await js(`${sharedTime}.querySelectorAll('[role=button]')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(100)
  await key('Backspace')
  await key('9')
  await key('Escape')
  await wait(100)
  if ((await calls()).filter((c) => c[0] === 'timerSet').length !== 1) throw new Error('Esc did not leave the time as it was')
  console.log('ok shared timer: one Start; the time is its own entry (double-click, type, Enter sets it; Esc leaves it)')

  // The bell button next to the shared timer's name opens its warning bells in a pop-up; Esc closes it.
  if ((await js<string>(`[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Warning bells of the shared timer')).textContent.trim()`)) !== '1') throw new Error('the bell button does not show 1 bell')
  await js(`[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Warning bells of the shared timer')).click()`)
  await wait(150)
  if (!(await js<boolean>(`document.body.textContent.includes('Warning bells · Shared timer')`))) throw new Error('the bells pop-up does not say it is for the shared timer')
  // Warning bells: add one, change the minutes and the beeps of the first, remove it (the stub state stays at one bell 1:00 / 3 beeps).
  const sent = async (): Promise<string[]> => (await calls()).filter((c) => c[0] === 'timerWarnings').map((c) => JSON.stringify(c[1]))
  await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('Add a bell')).click()`)
  await wait(100)
  await js(`${field('Bell: minutes left')}.focus()`)
  await js(`${field('Bell: minutes left')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('2')
  await leave('Bell: minutes left')
  await js(`${field('How many beeps (1–9)')}.focus()`)
  await js(`${field('How many beeps (1–9)')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  if ((await js<string>(`${field('How many beeps (1–9)')}.value`)) !== '') throw new Error('the beeps box does not empty')
  await key('5')
  await leave('How many beeps (1–9)')
  await wait(100)
  await js(`document.querySelector('button[title="Remove this bell"]').click()`)
  await wait(100)
  const bells = await sent()
  // Each box sends once, when you leave it (not on every key).
  const want = ['[{"sec":60,"beeps":3},{"sec":30,"beeps":1}]', '[{"sec":120,"beeps":3}]', '[{"sec":60,"beeps":5}]', '[]']
  if (JSON.stringify(bells) !== JSON.stringify(want)) throw new Error(`warning bells sent ${JSON.stringify(bells)}, expected ${JSON.stringify(want)}`)
  await js(`document.body.focus()`)
  await key('Escape')
  await wait(150)
  if (await js<boolean>(`document.body.textContent.includes('Warning bells · Shared timer')`)) throw new Error('Esc does not close the bells pop-up')
  if ((await calls()).some((c) => c[0] === 'stopProjecting' || c[0] === 'setInkTool')) throw new Error('Esc in a pop-up did more than close it')
  console.log('ok warning bells: a pop-up from the bell at the shared timer; add, change, remove; Esc closes only it')

  // ± on My timer opens Change the time for My timer; the shared timer (stopped) cannot be changed.
  const plusMinus = await js<number>(`[...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === '±').length`)
  if (plusMinus !== 2) throw new Error(`expected ± on both timers, found ${plusMinus}`)
  await js(`[...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === '±')[1].click()`)
  await wait(150)
  if ((await js<string | null>(`[...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === 'My timer')?.getAttribute('aria-pressed') ?? null`)) !== 'true') throw new Error('± on My timer does not choose My timer')
  await js(`${field('Change by: minutes')}.focus()`)
  await js(`${field('Change by: minutes')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('0')
  await js(`${field('Change by: seconds')}.focus()`)
  await js(`${field('Change by: seconds')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('Backspace')
  await key('3')
  await key('0')
  await wait(100)
  if (!(await clickText('− 0:30'))) throw new Error('no "− 0:30" button after typing 0:30')
  if (!(await clickText('Shared timer'))) throw new Error('no "Shared timer" choice')
  await wait(100)
  if (!(await js<boolean>(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '+ 0:30').disabled`))) throw new Error('a stopped shared timer can be changed')
  const changes = (await calls()).filter((c) => c[0] === 'timerAdjust' || c[0] === 'speakerAdjust').map((c) => `${c[0]} ${c[1]}`)
  if (changes.join('|') !== 'speakerAdjust -30') throw new Error(`change the time sent: ${JSON.stringify(changes)}`)
  await js(`document.body.focus()`)
  await key('Escape')
  await wait(150)
  console.log('ok change the time: a pop-up from ± on each timer; − 0:30 on My timer; a stopped shared timer is not changed')

  // A slide number, then Enter: jump there; the number shows in the top bar while you type.
  await js(`document.body.focus()`)
  await key('1')
  await key('2')
  if (!(await js<boolean>(`document.querySelector('header').textContent.includes('Go to slide 12')`))) throw new Error('the typed slide number does not show')
  await key('Enter')
  const jumps = (await calls()).filter((c) => c[0] === 'navigate').map((c) => JSON.stringify(c[1]))
  if (!jumps.includes('{"type":"goto","index":11}')) throw new Error(`12 Enter did not jump to slide 12: ${JSON.stringify(jumps)}`)
  if (await js<boolean>(`document.querySelector('header').textContent.includes('Go to slide')`)) throw new Error('the number stays after Enter')
  console.log('ok typed slide number + Enter jumps')

  // A+ held for one second repeats (one step at once, then every 80 ms after 400 ms).
  const r = await js<number[]>(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'A+'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  wc.sendInputEvent({ type: 'mouseDown', x: Math.round(r[0]), y: Math.round(r[1]), button: 'left', clickCount: 1 })
  await wait(1000)
  wc.sendInputEvent({ type: 'mouseUp', x: Math.round(r[0]), y: Math.round(r[1]), button: 'left', clickCount: 1 })
  await wait(300)
  const steps = (await calls()).filter((c) => c[0] === 'zoom' && c[2] === 'in').length
  if (steps < 5) throw new Error(`holding A+ gave only ${steps} steps`)
  // A short click is one step.
  wc.sendInputEvent({ type: 'mouseDown', x: Math.round(r[0]), y: Math.round(r[1]), button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: Math.round(r[0]), y: Math.round(r[1]), button: 'left', clickCount: 1 })
  await wait(600)
  const after = (await calls()).filter((c) => c[0] === 'zoom' && c[2] === 'in').length
  if (after !== steps + 1) throw new Error(`a click on A+ gave ${after - steps} steps`)
  console.log(`ok A+ repeats while held (${steps} steps in 1 s), a click is one step`)
  win.destroy()
  await wait(300)
}

/**
 * A running timer, edited through its time: the other parts keep running while a part is typed;
 * Enter sets the typed part and leaves the others as they are at that moment (so the timer is moved
 * by the difference); Esc leaves everything running. The stub ticks the time down every 0.4 s.
 */
async function timeEditing(): Promise<void> {
  const state = sampleState(false)
  state.timer = { status: 'running', remainingSec: 754, durationSec: 900, alarming: false, warnings: [] }
  writeStub(state, true)
  const win = new BrowserWindow({ show: false, width: 1536, height: 864, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1200)
  const wc = win.webContents
  const js = <T>(code: string): Promise<T> => wc.executeJavaScript(code) as Promise<T>
  const key = async (keyCode: string): Promise<void> => {
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await wait(60)
  }
  const calls = (): Promise<unknown[][]> => js('window.presenter.__calls()')
  const card = (name: string): string => `[...document.querySelectorAll('section')].find((x) => x.textContent.includes(${JSON.stringify(name)}))`
  const parts = (name: string): Promise<string[]> => js(`(() => { const c = ${card(name)}; return [...c.querySelectorAll('[role=button], input[aria-label]')].map((e) => (e.tagName === 'INPUT' ? 'input:' + e.value : e.textContent)) })()`)

  // Shared timer, 12:34 and running. Edit the minutes: type 5.
  const before = await parts('Participants see it')
  if (before.length !== 2 || before[0] !== '12') throw new Error(`the running timer should show 12:xx: ${JSON.stringify(before)}`)
  await js(`${card('Participants see it')}.querySelector('[role=button]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(100)
  await key('Backspace')
  await key('Backspace')
  await key('5')
  const seconds0 = (await parts('Participants see it'))[1]
  await wait(1700)
  const during = await parts('Participants see it')
  if (during[0] !== 'input:5') throw new Error(`the minutes box should hold 5 while editing: ${JSON.stringify(during)}`)
  if (during[1] === seconds0) throw new Error(`the seconds stood still while the minutes were typed (${seconds0} → ${during[1]})`)
  if ((await calls()).some((c) => c[0] === 'timerAdjust')) throw new Error('the timer was changed before Enter')
  await key('Enter')
  await wait(100)
  const adjusts = (await calls()).filter((c) => c[0] === 'timerAdjust').map((c) => c[1] as number)
  // 12 minutes (and some seconds) → 5 minutes (and the same seconds): 7 minutes less, whatever the seconds.
  if (adjusts.length !== 1 || adjusts[0] !== -420) throw new Error(`Enter should take 7 minutes away (the seconds untouched): ${JSON.stringify(adjusts)}`)
  console.log('ok running timer: the seconds keep running while the minutes are typed; Enter moves only the minutes')

  // Esc: nothing changes.
  await js(`${card('Participants see it')}.querySelectorAll('[role=button]')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(100)
  await key('Backspace')
  await key('Backspace')
  await key('1')
  await key('Escape')
  await wait(100)
  if ((await calls()).filter((c) => c[0] === 'timerAdjust').length !== 1) throw new Error('Esc changed the running timer')
  if ((await parts('Participants see it')).some((x) => x.startsWith('input'))) throw new Error('the box stays after Esc')

  // My timer (paused, 32:26 left): the minutes to 20 → 12:00 less; the seconds stay.
  const mine = await parts('Only you see it')
  if (mine.length < 2) throw new Error(`My timer should have editable time parts: ${JSON.stringify(mine)}`)
  await js(`${card('Only you see it')}.querySelector('[role=button]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(100)
  await key('Backspace')
  await key('Backspace')
  await key('2')
  await key('0')
  await key('Enter')
  await wait(100)
  const speaker = (await calls()).filter((c) => c[0] === 'speakerAdjust').map((c) => c[1])
  if (speaker.join(',') !== '-720') throw new Error(`My timer: 32 → 20 minutes should send -720: ${JSON.stringify(speaker)}`)
  console.log('ok My timer: the time is its own entry, the same way')
  win.destroy()
  await wait(300)
}

/** My timer From–to: no Start or Reset (it starts by itself); the clock pop-up edits sessions (weekdays, AM/PM). */
async function clockTimes(): Promise<void> {
  const state = sampleState(false)
  state.speaker = { ...state.speaker, mode: 'clock', heldMs: 0 }
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1536, height: 864, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1200)
  const wc = win.webContents
  const js = <T>(code: string): Promise<T> => wc.executeJavaScript(code) as Promise<T>
  const key = async (keyCode: string): Promise<void> => {
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await wait(60)
  }
  const mine = `[...document.querySelectorAll('section')].find((x) => x.textContent.includes('Only you see it'))`
  const buttons = await js<string[]>(`[...${mine}.querySelectorAll('button')].map((b) => b.textContent.trim())`)
  if (buttons.includes('Start') || buttons.includes('Resume') || buttons.includes('Reset')) throw new Error(`From–to should have no Start or Reset: ${JSON.stringify(buttons)}`)
  if (!(await js<boolean>(`!![...document.querySelectorAll('button')].find((x) => x.title.startsWith('Sessions:'))`))) throw new Error(`no sessions (clock) button: ${JSON.stringify(buttons)}`)
  await js(`[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Sessions:')).click()`)
  await wait(150)
  const field = (title: string): string => `document.querySelector('input[title="${title}"]')`
  const leave = (title: string): Promise<unknown> => js(`${field(title)}.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`)
  const press = (title: string): Promise<unknown> => js(`document.querySelector('button[title="${title}"]').click()`)
  // The end hour: 10 → 11 (AM stays). Then PM. Then Saturday too. Then remove it. Then add a period.
  await js(`${field('Period 1 to: hour')}.focus()`)
  await js(`${field('Period 1 to: hour')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('Backspace')
  await key('1')
  await key('1')
  await leave('Period 1 to: hour')
  await wait(100)
  await press('Period 1 to: PM')
  await press('Period 1: Sat')
  await press('Remove this period')
  await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('Add a period')).click()`)
  await wait(100)
  const sent = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'speakerPeriods').map((c) => JSON.stringify(c[1]))
  const p0 = { days: [1, 2, 3, 4, 5], fromSec: 9 * 3600, untilSec: 10 * 3600 + 50 * 60 }
  const want = [
    [{ ...p0, untilSec: 11 * 3600 + 50 * 60 }],
    [{ ...p0, untilSec: 22 * 3600 + 50 * 60 }],
    [{ ...p0, days: [1, 2, 3, 4, 5, 6] }],
    [],
    [p0, { days: [1, 2, 3, 4, 5], fromSec: 11 * 3600 + 5 * 60, untilSec: 12 * 3600 + 5 * 60 }]
  ].map((x) => JSON.stringify(x))
  if (JSON.stringify(sent) !== JSON.stringify(want)) throw new Error(`sessions sent ${JSON.stringify(sent)}, expected ${JSON.stringify(want)}`)
  console.log('ok My timer From–to: no Start or Reset; the clock pop-up edits hour, AM/PM, weekdays, remove and add')
  win.destroy()
  await wait(300)
}

/**
 * Typing a text on the live copy of the projector in the console (while projecting): a click puts a
 * text box over the slide, typing sends the words as marks, Esc ends it, a click on the text edits it
 * again, and the keys typed do not work as shortcuts (T, B, digits …).
 */
async function consoleText(): Promise<void> {
  const state = sampleState(true)
  state.ink = { tool: 'text', color: '#ef4444' }
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1536, height: 864, useContentSize: true, backgroundColor: '#475569', webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1500)
  const wc = win.webContents
  const rect = (await wc.executeJavaScript(`(() => { const c = document.querySelector('video ~ canvas'); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })()`)) as number[]
  const at = (fx: number, fy: number): [number, number] => [Math.round(rect[0] + rect[2] * fx), Math.round(rect[1] + rect[3] * fy)]
  const click = async ([x, y]: [number, number]): Promise<void> => {
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await wait(250)
  }
  const calls = (): Promise<Array<[string, ...unknown[]]>> => wc.executeJavaScript('window.presenter.__calls()')
  const ops = async (): Promise<Array<{ t: string; text?: string; stroke?: { tool: string; points: number[] } }>> => (await calls()).filter((c) => c[0] === 'inkOp').map((c) => c[1] as { t: string; text?: string })
  wc.focus()
  await click(at(0.3, 0.3))
  const begun = (await ops()).find((o) => o.t === 'begin')
  if (!begun || begun.stroke?.tool !== 'text' || begun.stroke.points.length !== 2) throw new Error(`the console click did not begin a text: ${JSON.stringify(begun)}`)
  const areas = await wc.executeJavaScript(`document.querySelectorAll('textarea').length`)
  if (areas !== 1) throw new Error(`expected one typing box, found ${areas}`)
  // Letters that are shortcuts (T = text tool, B = black screen) go into the text.
  await wc.insertText('Tab 12')
  await wait(150)
  const typed = (await ops()).filter((o) => o.t === 'text').map((o) => o.text)
  if (typed[typed.length - 1] !== 'Tab 12') throw new Error(`the typed words were not sent: ${JSON.stringify(typed)}`)
  if ((await calls()).some((c) => c[0] === 'setBlank' || c[0] === 'setInkTool' || c[0] === 'navigate')) throw new Error('typing worked as a shortcut')
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await wait(200)
  if ((await wc.executeJavaScript(`document.querySelectorAll('textarea').length`)) !== 0) throw new Error('Esc did not end the typing')
  // Nothing was typed in a second click: no mark stays.
  await click(at(0.6, 0.6))
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await wait(200)
  if (!(await ops()).some((o) => o.t === 'erase')) throw new Error('an empty text was kept')
  console.log('ok console: a click types a text over the slide; letters stay in the text; Esc ends it; empty text leaves nothing')
  win.destroy()
  await wait(300)
}

/**
 * The participants' screen with teams, at 1280 x 720: 23 people in 5 teams, and 30 people with
 * long names in 6 teams. Every team shows, no team runs off the screen, and every name is whole
 * (wrapped if it must be, never cut).
 */
async function groupsShot(): Promise<void> {
  const stub = path.join(OUT, 'harness', 'roller-stub-preload.cjs')
  const cases: Array<{ label: string; names: string[]; teams: number }> = [
    { label: 'short names', names: Array.from({ length: 23 }, (_, i) => `Person ${String.fromCharCode(65 + (i % 26))}${i + 1} Wangmo`), teams: 5 },
    {
      label: 'long names',
      names: Array.from({ length: 30 }, (_, i) => `${['Ngawang', 'Tshering', 'Dechen', 'Karma', 'Sonam'][i % 5]} ${['Phuntsho', 'Choden', 'Lhamo', 'Wangchuk'][i % 4]} ${['Dorji', 'Tenzin', 'Zangmo', 'Gyeltshen', 'Namgay'][i % 5]} ${i + 1}`),
      teams: 6
    }
  ]
  for (const c of cases) {
    const groups = Array.from({ length: c.teams }, (_, g) => c.names.filter((_, i) => i % c.teams === g))
    fs.writeFileSync(stub, `const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('roller', {
  onPlay: () => {},
  onGroups: (cb) => setTimeout(() => cb(${JSON.stringify(groups)}, false), 100),
  onHide: () => {},
  pointer: () => {}
})
`)
    const win = new BrowserWindow({ show: false, width: 1280, height: 720, useContentSize: true, backgroundColor: '#ffffff', webPreferences: { preload: stub, contextIsolation: true, sandbox: true, offscreen: true } })
    await win.loadFile(path.join(ROOT, 'out', 'renderer', 'roller.html'))
    await wait(1500)
    const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
    const shown = await js<number>(`document.querySelectorAll('.group').length`)
    if (shown !== c.teams) throw new Error(`${c.label}: the participants' screen shows ${shown} teams, not ${c.teams}`)
    if (await js<boolean>(`[...document.querySelectorAll('.group')].some((g) => g.getBoundingClientRect().bottom > innerHeight + 1)`)) throw new Error(`${c.label}: a team runs off the participants' screen`)
    // Nothing runs into the title above or the hint below.
    const room = await js<{ titleBottom: number; hintTop: number; top: number; bottom: number; size: string }>(`(() => { const t = document.getElementById('title').getBoundingClientRect(); const h = document.getElementById('hint').getBoundingClientRect(); const r = [...document.querySelectorAll('.group')].map((g) => g.getBoundingClientRect()); return { titleBottom: t.bottom, hintTop: h.top, top: Math.min(...r.map((x) => x.top)), bottom: Math.max(...r.map((x) => x.bottom)), size: document.getElementById('groups').style.getPropertyValue('--gname-size') } })()`)
    if (room.top < room.titleBottom - 1 || room.bottom > room.hintTop + 1) throw new Error(`${c.label}: a team runs into the title or the hint: ${JSON.stringify(room)}`)
    const clipped = await js<string[]>(`[...document.querySelectorAll('.group li')].filter((li) => li.scrollWidth > li.clientWidth + 1 || getComputedStyle(li).textOverflow === 'ellipsis').map((li) => li.textContent)`)
    if (clipped.length > 0) throw new Error(`${c.label}: names cut off: ${clipped.slice(0, 3).join(' | ')}`)
    // Names are told apart: a dot before each name, a line between the rows, room above and below.
    const apart = await js<{ dots: number; names: number; lines: number; padded: boolean }>(`(() => { const lis = [...document.querySelectorAll('.group li')]; const second = lis.filter((li) => li.previousElementSibling); return { names: lis.length, dots: lis.filter((li) => li.querySelector('.dot')).length, lines: second.filter((li) => parseFloat(getComputedStyle(li).borderTopWidth) > 0).length, padded: lis.every((li) => parseFloat(getComputedStyle(li).paddingTop) >= 3) } })()`)
    if (apart.dots !== apart.names || !apart.padded || apart.lines === 0) throw new Error(`${c.label}: names are not told apart: ${JSON.stringify(apart)}`)
    const texts = await js<string[]>(`[...document.querySelectorAll('.group li')].map((li) => li.textContent)`)
    if (texts.join('|') !== groups.flat().join('|')) throw new Error(`${c.label}: the names shown are not the names given`)
    if (!(await js<string>('document.querySelector(".group h2").textContent')).startsWith('Team ')) throw new Error('teams are not called Team 1, Team 2 …')
    fs.writeFileSync(path.join(OUT, c.label === 'short names' ? 'roller-groups.png' : 'roller-groups-long.png'), (await win.webContents.capturePage()).toPNG())
    console.log(`ok teams on the participants' screen (${c.label}): ${c.teams} teams fit, every name whole`)
    win.destroy()
    await wait(300)
  }
}

/**
 * The floating toolbar's timers: the same two cards as the console (the time is its own entry,
 * the bells open in a pop-up inside the toolbar's own window, which grows with them).
 */
async function toolbarTimer(): Promise<void> {
  const state = sampleState(false, true)
  state.timer = { status: 'idle', remainingSec: 300, durationSec: 300, alarming: false, warnings: [{ sec: 60, beeps: 3 }] }
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1400, height: 160, useContentSize: true, backgroundColor: '#475569', webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'toolbar.html'))
  await wait(1200)
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
  const wc = win.webContents
  const key = async (keyCode: string): Promise<void> => {
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await wait(60)
  }
  const size = (): Promise<number[]> => js(`(() => { const r = document.getElementById('root').firstElementChild.getBoundingClientRect(); return [Math.ceil(r.width), Math.ceil(r.height)] })()`)
  const bar = await size()
  const opened = await js<boolean>(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Timer'); if (b) b.click(); return !!b })()`)
  if (!opened) throw new Error('the toolbar has no timer button')
  await wait(300)
  // The two cards of the console: Start on each (the shared timer, My timer), once.
  const names = await js<string[]>(`[...document.querySelectorAll('section h2')].map((h) => h.textContent)`)
  if (names.join('|') !== 'Shared timer|My timer') throw new Error(`the toolbar should hold the two console cards: ${JSON.stringify(names)}`)
  const starts = await js<number>(`[...document.querySelectorAll('section')].filter((s) => [...s.querySelectorAll('button')].filter((b) => ['Start', 'Resume'].includes(b.textContent.trim())).length === 1).length`)
  if (starts !== 2) throw new Error(`each timer card has one Start or Resume button (2 cards expected): ${starts}`)
  if (await js<boolean>(`!!document.querySelector('input[title="Minutes"]')`)) throw new Error('a time box is open before anything was double-clicked')
  // The time is its own entry here too.
  await js(`document.querySelector('section [role=button]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(100)
  if (!(await js<boolean>(`!!document.querySelector('input[title="Minutes"]')`))) throw new Error('double-clicking the minutes opens no box on the toolbar')
  await key('Backspace')
  await key('Backspace')
  await key('8')
  await key('Enter')
  await wait(100)
  const calls = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'timerSet').map((c) => c[1])
  if (calls.join(',') !== '480') throw new Error(`8 in the minutes sets 8:00 (480 s): ${JSON.stringify(calls)}`)
  // Another screen on Projector 1, from the toolbar's own pop-up (inside its window).
  await js(`[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Show another screen on Projector 1')).click()`)
  await wait(200)
  const picked = await js<boolean>(`(() => { const i = [...document.querySelectorAll('button')].find((x) => x.className.includes('group') && x.textContent.includes('Screen 2')); if (!i) return false; i.click(); return true })()`)
  if (!picked) throw new Error('the toolbar screen menu lists no Screen 2')
  const shows = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'switchTo').map((c) => `${c[1]}`)
  if (shows.join(',') !== 'screen-2') throw new Error(`the toolbar should switch to Screen 2: ${JSON.stringify(shows)}`)
  // The way back: one button asks for the console.
  await js(`[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Back to the Presenter console')).click()`)
  if (!(await js<unknown[][]>('window.presenter.__calls()')).some((c) => c[0] === 'focusConsole')) throw new Error('the toolbar has no way back to the console')
  // The bells: a pop-up inside the toolbar window; the window (its content) grows to hold it.
  const before = await size()
  await js(`[...document.querySelectorAll('button')].find((x) => x.title.startsWith('Warning bells of the shared timer')).click()`)
  await wait(300)
  const after = await size()
  const inside = await js<boolean>(`(() => { const m = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('Warning bells')); if (!m) return false; const r = m.getBoundingClientRect(); const root = document.getElementById('root').firstElementChild.getBoundingClientRect(); return r.top >= root.top && r.bottom <= root.bottom + 1 && r.left >= root.left && r.right <= root.right + 1 })()`)
  if (!inside) throw new Error('the bells pop-up is not inside the toolbar')
  if (after[1] <= before[1]) throw new Error(`the toolbar did not grow for the pop-up: ${before} -> ${after}`)
  win.setContentSize(Math.max(after[0], bar[0]), after[1])
  await wait(300)
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'toolbar-timer.png'), image.toPNG())
  console.log('ok floating toolbar timers: the console cards; the time is its own entry; the bells open inside the window')
  win.destroy()
  await wait(300)
}

/**
 * Every pop-up stays inside the window, at the smallest console size and turned either way, and
 * a turned console puts the two sides, the bar buttons and the header the other way round.
 */
async function sidesAndPopups(): Promise<void> {
  const openers: Array<[string, string]> = [
    ['recent', `[...document.querySelectorAll('header button')].find((x) => x.textContent.trim().startsWith('Recent'))`],
    ['participants', OPENERS['roller'] as string],
    ['bells', OPENERS['bells'] as string],
    ['adjust', OPENERS['adjust'] as string],
    ['add', OPENERS['add-menu'] as string],
    ['screen', OPENERS['screen-menu'] as string],
    ['slides', OPENERS['slides'] as string]
  ]
  const rects: Record<string, Record<string, number[]>> = {}
  for (const flipped of [false, true]) {
    const key = flipped ? 'flipped' : 'normal'
    rects[key] = {}
    for (const [name, opener] of openers) {
      const state = sampleState(false, name === 'participants')
      state.flipped = flipped
      writeStub(state)
      const win = new BrowserWindow({ show: false, width: 1024, height: 620, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
      await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
      await wait(900)
      const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
      // The bar buttons are always there; a pop-up opens from its button.
      if (name === 'slides') {
        await js(`(async () => { const b = await ${opener}; b.click() })()`)
        await wait(400)
        const panel = await js<number[] | null>(`(() => { const a = document.querySelector('aside'); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.right, innerWidth] })()`)
        if (!panel) throw new Error('the slide panel did not open')
        // Normal: at the left edge. Turned: at the right edge.
        if (!flipped && panel[0] > 40) throw new Error(`the slide panel should be at the left edge: ${panel}`)
        if (flipped && panel[2] - panel[1] > 40) throw new Error(`a turned console has the slide panel at the right edge: ${panel}`)
        rects[key]['slides'] = panel
      } else {
        const ok = await js<boolean>(`(async () => { const b = await ${opener}; if (b) b.click(); return !!b })()`)
        if (!ok) throw new Error(`${name} button not found`)
        await wait(400)
        const r = await js<number[] | null>(`(() => { const m = document.querySelector('div.absolute.z-20'); if (!m) return null; const r = m.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight] })()`)
        if (!r) throw new Error(`${name}: no pop-up in the ${key} console`)
        if (r[0] < 0 || r[1] < 0 || r[2] > r[4] || r[3] > r[5]) throw new Error(`${name} pop-up leaves the window (${key}): ${JSON.stringify(r.map(Math.round))}`)
        rects[key][name] = r
        if (name === 'bells' || name === 'participants') fs.writeFileSync(path.join(OUT, `console-${key}-${name}.png`), (await win.webContents.capturePage()).toPNG())
      }
      if (name === 'participants') {
        // Whole interface turned over: the header's first item is at the other end, the sides swap.
        const g = await js<number[]>(`(() => { const x = (el) => el.getBoundingClientRect(); const h = x(document.querySelector('header span')); const cur = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Current slide')); const nxt = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Next slide')); return [h.left, innerWidth, x(cur).left, x(nxt).left] })()`)
        if (!flipped && !(g[0] < g[1] / 2 && g[2] < g[3])) throw new Error(`normal console: brand left, current slide left of the next slide: ${JSON.stringify(g)}`)
        if (flipped && !(g[0] > g[1] / 2 && g[2] > g[3])) throw new Error(`turned console: brand right, current slide right of the next slide: ${JSON.stringify(g)}`)
      }
      win.destroy()
      await wait(200)
    }
  }
  fs.writeFileSync(path.join(OUT, 'popup-rects.json'), JSON.stringify(rects, null, 1))
  console.log('ok pop-ups stay inside the window at 1024 x 620 (normal and turned); a turned console swaps the sides and the slide panel')
}

/** Add screen lists the recent decks too; one of them becomes a new screen. */
async function addScreenRecent(): Promise<void> {
  const state = sampleState(false)
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1280, height: 760, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1000)
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
  const opened = await js<boolean>(`(() => { const b = [...document.querySelectorAll('footer button')].find((x) => x.textContent.includes('Add screen')); if (b) b.click(); return !!b })()`)
  if (!opened) throw new Error('no Add screen button')
  await wait(300)
  const items = await js<string[]>(`[...document.querySelectorAll('button.group')].map((b) => b.title || b.textContent.trim())`)
  if (!items.some((i) => i.includes('UXD202 Lecture n1'))) throw new Error(`Add screen has no Recent deck: ${JSON.stringify(items)}`)
  await js(`[...document.querySelectorAll('button.group')].find((b) => b.title && b.title.length > 0).click()`)
  const calls = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'addScreen')
  if (calls.length !== 1 || calls[0][1] !== false || typeof calls[0][2] !== 'string') throw new Error(`addScreen calls: ${JSON.stringify(calls)}`)
  console.log('ok Add screen lists Recent; a recent deck becomes a new screen')
  win.destroy()
  await wait(300)
}

/** The name of a screen opens a list: another deck, a program window, a whiteboard, or a deck from Recent. */
async function screenNameMenu(): Promise<void> {
  const state = sampleState(false)
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1280, height: 760, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1000)
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
  const opened = await js<boolean>(`(() => { const b = [...document.querySelectorAll('footer button')].find((x) => x.title.startsWith('Change what this screen holds') && x.textContent.includes('Screen 2')); if (b) b.click(); return !!b })()`)
  if (!opened) throw new Error('the screen name is not a button with a list')
  await wait(300)
  const items = await js<string[]>(`[...document.querySelectorAll('button.group')].map((b) => b.textContent.trim())`)
  for (const want of ['Open a deck…', 'A program window…', 'Whiteboard']) if (!items.some((i) => i.startsWith(want))) throw new Error(`the screen list has no "${want}": ${JSON.stringify(items)}`)
  if (items.length < 4) throw new Error(`the screen list should also list Recent decks: ${JSON.stringify(items)}`)
  const rect = await js<number[]>(`(() => { const m = document.querySelector('div.absolute.z-20').getBoundingClientRect(); return [m.left, m.top, m.right, m.bottom, innerWidth, innerHeight] })()`)
  if (rect[0] < 0 || rect[1] < 0 || rect[2] > rect[4] || rect[3] > rect[5]) throw new Error(`the screen list leaves the window: ${rect}`)
  await js(`[...document.querySelectorAll('button.group')].find((b) => b.textContent.trim() === 'Whiteboard').click()`)
  await js(`(() => { const b = [...document.querySelectorAll('footer button')].find((x) => x.title.startsWith('Change what this screen holds') && x.textContent.includes('Screen 2')); b.click() })()`)
  await wait(200)
  await js(`[...document.querySelectorAll('button.group')].find((b) => b.title && b.title.length > 0).click()`)
  const calls = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'replaceScreen')
  const kinds = calls.map((c) => `${c[1]}:${(c[2] as { kind: string }).kind}`)
  if (kinds.join(',') !== 'screen-2:whiteboard,screen-2:deck') throw new Error(`replaceScreen calls: ${JSON.stringify(kinds)}`)
  // A window card has an icon that brings that window back to the front.
  const raised = await js<boolean>(`(() => { const b = [...document.querySelectorAll('footer button')].find((x) => x.title.startsWith('Bring this window back')); if (b) b.click(); return !!b })()`)
  if (!raised) throw new Error('a window card has no way to bring its window back')
  const raise = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'raiseWindow')
  if (raise.length !== 1) throw new Error(`raiseWindow calls: ${JSON.stringify(raise)}`)
  console.log('ok a screen name opens a list: deck, program window, whiteboard, Recent; each replaces that screen; a window card can bring its window back')
  win.destroy()
  await wait(300)
}

/** While projecting, a click on the console's live copy (pointer tool) is a click on the slide on the projector. */
async function mirrorClick(): Promise<void> {
  const state = sampleState(true)
  state.ink = { ...state.ink, tool: 'pointer' }
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1280, height: 760, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1200)
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
  const ok = await js<boolean>(`(() => { const c = [...document.querySelectorAll('canvas')].find((x) => x.title.startsWith('Click to select the projector')); if (!c) return false; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.25, clientY: r.top + r.height * 0.75 })); return true })()`)
  if (!ok) throw new Error('the live copy of the projector has no clickable canvas')
  const clicks = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'projectorClick')
  if (clicks.length !== 1) throw new Error(`projectorClick calls: ${JSON.stringify(clicks)}`)
  const [nx, ny] = [Number(clicks[0][1]), Number(clicks[0][2])]
  if (Math.abs(nx - 0.25) > 0.03 || Math.abs(ny - 0.75) > 0.03) throw new Error(`the click should map to 0.25 / 0.75 of the slide: ${nx} / ${ny}`)
  console.log('ok a click on the live copy reaches the slide on the projector')
  win.destroy()
  await wait(300)
}

/** A deck opened again: the two-button choice sits above the slide, the buttons are equal and clearly different. */
async function resumeChoice(): Promise<void> {
  const state = sampleState(false)
  state.resumedAt = 6
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1280, height: 760, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  await wait(1000)
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
  const info = await js<{ stay: number[]; first: number[]; group: number[]; slot: number; stayClass: string; firstClass: string } | null>(`(() => {
    const g = document.querySelector('[role=group][aria-label^="This deck was open before"]'); if (!g) return null
    const bs = [...g.querySelectorAll('button')]; const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height] }
    const slot = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Current slide')).querySelector('.aspect-video, [class*=bg-page]')
    return { stay: r(bs[0]), first: r(bs[1]), group: r(g), slot: slot ? slot.getBoundingClientRect().top : -1, stayClass: bs[0].className, firstClass: bs[1].className } })()`)
  if (!info) throw new Error('the resume choice is not shown')
  const text = await js<string>(`document.querySelector('[role=group][aria-label^="This deck was open before"]').innerText`)
  if (!text.includes('Stay at slide 7') || !text.includes('Go to slide 1')) throw new Error(`the two choices are not named: ${JSON.stringify(text)}`)
  if (Math.abs(info.stay[2] - info.first[2]) > 2 || Math.abs(info.stay[3] - info.first[3]) > 2) throw new Error(`the two buttons differ in size: ${info.stay} / ${info.first}`)
  if (!(info.stay[0] < info.first[0])) throw new Error('Stay is on the left, Go to slide 1 on the right')
  if (info.stay[2] < 120 || info.stay[3] < 36) throw new Error(`the buttons are too small: ${info.stay}`)
  if (info.stayClass === info.firstClass || !info.stayClass.includes('bg-accent')) throw new Error('the two buttons must look different (blue Stay, plain Go to slide 1)')
  if (!(info.group[1] < info.slot)) throw new Error('the choice is not above the slide')
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Stay at slide 7')).click()`)
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Go to slide 1')).click()`)
  const calls = (await js<unknown[][]>('window.presenter.__calls()')).map((c) => c[0])
  if (!calls.includes('dismissResumed') || !calls.includes('navigate')) throw new Error(`Stay should dismiss and Go to slide 1 should navigate: ${JSON.stringify(calls)}`)
  fs.writeFileSync(path.join(OUT, 'console-resume.png'), (await win.webContents.capturePage()).toPNG())
  console.log('ok deck opened again: a clear two-button choice (Stay at slide N | Go to slide 1) above the slide')
  win.destroy()
  await wait(300)
}

app.whenReady().then(async () => {
  let code = 0
  try {
    await inputs()
    await toolbarTimer()
    await resumeChoice()
    await mirrorClick()
    await screenNameMenu()
    await addScreenRecent()
    await sidesAndPopups()
    await groupsShot()
    await consoleText()
    await timeEditing()
    await shot(false)
    await shot(true)
    await shot(false, 'guide')
    await shot(false, 'guide-prepare')
    await shot(false, 'screen-menu')
    await shot(false, 'crowd')
    await shot(false, 'window-picker')
    await shot(false, 'roller')
    await shot(false, 'slides')
    await shot(false, 'notes')
    await shot(false, 'crowd', 'toolbar')
    await shot(false, 'start')
    // The light look: the same views that carry the most colours.
    await shot(false, null, 'console', 'light')
    await shot(true, null, 'console', 'light')
    await shot(false, 'crowd', 'console', 'light')
    await shot(false, 'roller', 'console', 'light')
    await shot(false, 'guide-prepare', 'console', 'light')
    await shot(false, 'window-picker', 'console', 'light')
    await shot(false, 'start', 'console', 'light')
    await shot(false, 'crowd', 'toolbar', 'light')
    await shot(false, 'bells')
    await shot(false, 'bells', 'console', 'light')
    await shot(false, 'adjust')
    await shot(false, 'adjust', 'console', 'light')
    await shot(false, 'clock')
    await shot(false, 'clock', 'console', 'light')
    await shot(true, 'media')
    await shot(true, 'media', 'console', 'light')
    await clockTimes()
    console.log('CONSOLE OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    app.exit(code)
  }
})
