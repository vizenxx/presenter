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
const API_METHODS = ["onState", "onMirror", "openDialog", "openPath", "pathForFile", "navigate", "key", "select", "setLinked", "nudge", "addScreen", "removeScreen", "timerStart", "timerToggle", "timerReset", "timerDismiss", "layoutPreview", "layoutCurrent", "startProjecting", "stopProjecting", "zoom", "rollerRoll", "rollerHide", "rollerReset", "rollerSetSuperLucky", "rollerSelectList", "rollerSaveList", "rollerDeleteList", "dismissDeckStatus", "setInkTool", "setInkColor", "inkOp", "onInkOp", "inkSnapshot", "mirrorMode", "guide", "copyText", "saveGuideFile", "showOn", "projectorFullscreen", "closeProjector", "speakerMode", "speakerMinutes", "speakerToggle", "speakerReset", "toolbarSize", "listWindows", "addWindowScreen", "setTheme", "timerWarnings", "speakerAdjust", "timerAdjust", "timerSet", "speakerTimes"]

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
    speaker: { mode: 'down', minutes: 45, startedAt: null, heldMs: 754000, fromSec: 9 * 3600, untilSec: 10 * 3600 + 50 * 60 },
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
    roller: { lists: [{ id: 'l', name: 'Class list', count: 6 }], activeListId: 'l', activeText: '', people: ['Ann Lee', 'Bo Chen', 'Cai Dorji', 'Dema Wangmo', 'Eli Tashi', 'Fay Zangpo'].map((name, i) => ({ id: `1225010${i}`, name, wins: [1, 0, 2, 0, 0, 0][i] })), superLucky: true, roll: null, showing: false },
    deckStatus: { state: 'ready' },
    ink: { tool: 'pen', color: '#ef4444' },
    theme
  }
}

const SAMPLE_WINDOWS = ['Browser – Class website', 'Video player – lesson clip.mp4', 'Spreadsheet – marks.xlsx'].map((name, i) => ({ id: `window:${100 + i}:0`, name, app: ['Microsoft Edge', 'VLC media player', 'Microsoft Excel'][i], icon: '', minimized: i === 2, thumbnail: i === 2 ? '' : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='%23334155'/><rect x='20' y='20' width='280' height='30' fill='%2394a3b8'/></svg>" }))

function writeStub(state: AppState): void {
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
api.onState = (cb) => setTimeout(() => cb(state), 50)
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

type Open = 'guide' | 'guide-prepare' | 'window-picker' | 'start' | 'screen-menu' | 'add-menu' | 'crowd' | 'roller' | 'bells' | 'adjust' | 'clock' | null
/** Clicks the button that opens each pop-up. */
const OPENERS: Record<string, string> = {
  guide: `[...document.querySelectorAll('header button')].find((x) => x.textContent.includes('📘'))`,
  'guide-prepare': `(() => { [...document.querySelectorAll('header button')].find((x) => x.textContent.includes('📘')).click(); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.startsWith('2'))), 300)) })()`,
  'screen-menu': `[...document.querySelectorAll('footer button')].find((x) => x.textContent.trim() === '⋯')`,
  'window-picker': `(() => { [...document.querySelectorAll('footer button')].find((x) => x.textContent.includes('＋')).click(); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('button')].find((x) => x.textContent.startsWith('A window'))), 300)) })()`,
  'add-menu': `[...document.querySelectorAll('footer button')].find((x) => x.textContent.includes('＋'))`,
  roller: `[...document.querySelectorAll('header button')].find((x) => x.textContent.includes('🎲'))`,
  bells: `[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('🔔'))`,
  adjust: `[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '±')`,
  clock: `[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('🕘'))`
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
  // Three warning bells: the timer panel must still fit.
  if (open === 'bells') state.timer.warnings = [{ sec: 300, beeps: 1 }, { sec: 120, beeps: 2 }, { sec: 30, beeps: 5 }]
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
  // A stopped class timer: Set works only then.
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

  // One Start in the class timer: Set only sets the time; the Start button starts it.
  const starts = await js<number>(`[...document.querySelectorAll('section')].filter((x) => x.textContent.includes('Class timer · students see it')).flatMap((x) => [...x.querySelectorAll('button')]).filter((b) => b.textContent.trim() === 'Start').length`)
  if (starts !== 1) throw new Error(`the class timer has ${starts} Start buttons`)
  // Minutes: empty the box completely, then type 0.
  await js(`${field('Minutes')}.focus()`)
  await js(`${field('Minutes')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  const emptied = await js<string>(`${field('Minutes')}.value`)
  if (emptied !== '') throw new Error(`the minutes box keeps "${emptied}" after Backspace`)
  await key('0')
  // Seconds: empty both digits, type 30: the time is set to 0:30 (0:00 on the way is not sent); Enter starts it.
  await js(`${field('Seconds')}.focus()`)
  await js(`${field('Seconds')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('Backspace')
  if ((await js<string>(`${field('Seconds')}.value`)) !== '') throw new Error('the seconds box does not empty')
  await key('3')
  await key('0')
  const set = (await calls()).filter((c) => c[0] === 'timerSet').map((c) => c[1])
  if (set[set.length - 1] !== 30 || set.includes(0)) throw new Error(`Set should end at 30 s and never send 0: ${JSON.stringify(set)}`)
  if ((await calls()).some((c) => c[0] === 'timerStart')) throw new Error('typing in Set started the timer')
  await key('Enter')
  const started = (await calls()).filter((c) => c[0] === 'timerStart')
  if (started.length !== 1 || started[0][1] !== 30) throw new Error(`Enter should start 30 s: ${JSON.stringify(started)}`)
  console.log('ok class timer: one Start; Set empties fully, sets 0:30, Enter starts it')

  // 🔔 next to the class timer's name opens its warning bells in a pop-up; Esc closes it.
  if ((await js<string>(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('🔔')).textContent.trim()`)) !== '🔔 1') throw new Error('the bell button does not show 1 bell')
  await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('🔔')).click()`)
  await wait(150)
  if (!(await js<boolean>(`document.body.textContent.includes('Warning bells · Class timer')`))) throw new Error('the bells pop-up does not say it is for the class timer')
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
  if (await js<boolean>(`document.body.textContent.includes('Warning bells · Class timer')`)) throw new Error('Esc does not close the bells pop-up')
  if ((await calls()).some((c) => c[0] === 'stopProjecting' || c[0] === 'setInkTool')) throw new Error('Esc in a pop-up did more than close it')
  console.log('ok warning bells: a pop-up from 🔔 at the class timer; add, change, remove; Esc closes only it')

  // ± on My timer opens Change the time for My timer; the class timer (stopped) cannot be changed.
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
  if (!(await clickText('Class timer'))) throw new Error('no "Class timer" choice')
  await wait(100)
  if (!(await js<boolean>(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '+ 0:30').disabled`))) throw new Error('a stopped class timer can be changed')
  const changes = (await calls()).filter((c) => c[0] === 'timerAdjust' || c[0] === 'speakerAdjust').map((c) => `${c[0]} ${c[1]}`)
  if (changes.join('|') !== 'speakerAdjust -30') throw new Error(`change the time sent: ${JSON.stringify(changes)}`)
  await js(`document.body.focus()`)
  await key('Escape')
  await wait(150)
  console.log('ok change the time: a pop-up from ± on each timer; − 0:30 on My timer; a stopped class timer is not changed')

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

/** My timer From–to: no Start or Reset (it starts by itself); the 🕘 pop-up sets the clock times. */
async function clockTimes(): Promise<void> {
  const state = sampleState(false)
  state.speaker = { ...state.speaker, mode: 'clock', heldMs: 0, fromSec: 9 * 3600, untilSec: 10 * 3600 + 50 * 60 }
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
  const mine = `[...document.querySelectorAll('section')].find((x) => x.textContent.includes('My timer · only you see it'))`
  const buttons = await js<string[]>(`[...${mine}.querySelectorAll('button')].map((b) => b.textContent.trim())`)
  if (buttons.includes('Start') || buttons.includes('Resume') || buttons.includes('Reset')) throw new Error(`From–to should have no Start or Reset: ${JSON.stringify(buttons)}`)
  if (!buttons.includes('🕘 09:00–10:50')) throw new Error(`no 🕘 09:00–10:50 button: ${JSON.stringify(buttons)}`)
  await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('🕘')).click()`)
  await wait(150)
  // To: 11 : 15. Each box sends when you leave it.
  const field = (title: string): string => `document.querySelector('input[title="${title}"]')`
  const leave = (title: string): Promise<unknown> => js(`${field(title)}.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`)
  await js(`${field('To: hour')}.focus()`)
  await js(`${field('To: hour')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('Backspace')
  await key('1')
  await key('1')
  await leave('To: hour')
  await js(`${field('To: minute')}.focus()`)
  await js(`${field('To: minute')}.setSelectionRange(9, 9)`)
  await key('Backspace')
  await key('Backspace')
  await key('1')
  await key('5')
  await leave('To: minute')
  await wait(100)
  const sent = (await js<unknown[][]>('window.presenter.__calls()')).filter((c) => c[0] === 'speakerTimes').map((c) => `${c[1]}-${c[2]}`)
  if (JSON.stringify(sent) !== JSON.stringify([`${9 * 3600}-${11 * 3600 + 50 * 60}`, `${9 * 3600}-${10 * 3600 + 15 * 60}`])) throw new Error(`clock times sent: ${JSON.stringify(sent)}`)
  console.log('ok My timer From–to: no Start or Reset; the 🕘 pop-up sends the times when you leave a box')
  win.destroy()
  await wait(300)
}

/** The floating toolbar's ⏱ settings: the same Set as the console, and one Start. */
async function toolbarTimer(): Promise<void> {
  const state = sampleState(false, true)
  state.timer = { status: 'idle', remainingSec: 300, durationSec: 300, alarming: false, warnings: [{ sec: 60, beeps: 3 }] }
  writeStub(state)
  const win = new BrowserWindow({ show: false, width: 1400, height: 160, useContentSize: true, backgroundColor: '#475569', webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'toolbar.html'))
  await wait(1200)
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>
  const opened = await js<boolean>(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('⏱')); if (b) b.click(); return !!b })()`)
  if (!opened) throw new Error('the toolbar has no ⏱ button')
  await wait(300)
  const starts = await js<number>(`[...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Start').length`)
  if (starts !== 1) throw new Error(`the toolbar timer has ${starts} Start buttons`)
  if (!(await js<boolean>(`!!document.querySelector('input[title="Minutes"]') && !document.querySelector('input[title="Minutes"]').disabled`))) throw new Error('the toolbar timer has no usable Set')
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'toolbar-timer.png'), image.toPNG())
  console.log('ok floating toolbar timer: one Start and Set')
  win.destroy()
  await wait(300)
}

app.whenReady().then(async () => {
  let code = 0
  try {
    await inputs()
    await toolbarTimer()
    await shot(false)
    await shot(true)
    await shot(false, 'guide')
    await shot(false, 'guide-prepare')
    await shot(false, 'screen-menu')
    await shot(false, 'crowd')
    await shot(false, 'window-picker')
    await shot(false, 'roller')
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
    await clockTimes()
    console.log('CONSOLE OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    app.exit(code)
  }
})
