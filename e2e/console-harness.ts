/**
 * Off-screen layout check of the console page with a sample state (English and Chinese),
 * at the laptop's console size. No window appears. Build first, then: npm run check:console
 */
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { aiRequestText } from '../src/shared/guide'
import type { AppState } from '../src/shared/types'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
const STUB = path.join(OUT, 'harness', 'console-stub-preload.cjs')
const AI_REQUEST = aiRequestText(fs.readFileSync(path.join(ROOT, 'docs', 'ai-integration.md'), 'utf8'))
/** Every ConsoleApi method (contextBridge copies plain objects only, so no Proxy). */
const API_METHODS = ["onState", "onMirror", "openDialog", "openPath", "pathForFile", "navigate", "key", "select", "setLinked", "nudge", "addScreen", "removeScreen", "toggleFullscreen", "timerStart", "timerToggle", "timerReset", "timerDismiss", "layoutPreview", "layoutCurrent", "startProjecting", "stopProjecting", "zoom", "rollerRoll", "rollerHide", "rollerReset", "rollerSetSuperLucky", "rollerSelectList", "rollerSaveList", "rollerDeleteList", "dismissDeckStatus", "setLanguage", "setInkTool", "setInkColor", "inkOp", "onInkOp", "inkSnapshot", "mirrorMode", "guide", "copyText", "saveGuideFile"]

app.disableHardwareAcceleration()
// Each screenshot closes its window; keep the app alive between them.
app.on('window-all-closed', () => undefined)
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** crowd = six extra screens and the next preview selected (checks that the screens bar stays in view). */
function sampleState(projecting: boolean, crowd = false): AppState {
  const deck = { path: 'C:/decks/UXD202 Lecture n1.pptx', name: 'UXD202 Lecture n1' }
  const base = { deck, adapter: 'uxd202' as const, total: 18, linked: true, fullscreen: false, zoomPercent: 100, deckKind: 'slides' as const }
  return {
    outputs: [
      { ...base, id: 'projector', kind: 'projector', screenNumber: 1, index: 2, shownIndex: 2, title: 'The first stage of the product development life cycle' },
      { ...base, id: 'next', kind: 'preview', screenNumber: 0, index: 3, shownIndex: 3, title: 'The goal is to figure out the specifications' },
      { ...base, id: 'screen-2', kind: 'window', screenNumber: 2, index: 2, shownIndex: 2, linked: false, title: 'The first stage of the product development life cycle' },
      ...(crowd ? [3, 4, 5, 6, 7].map((n) => ({ ...base, id: `screen-${n}`, kind: 'window' as const, screenNumber: n, index: n, shownIndex: n, title: `Slide ${n + 1}` })) : [])
    ],
    selectedId: crowd ? 'next' : 'projector',
    mainDeck: deck,
    slidesOf: 'projector',
    previewOf: 'projector',
    slides: Array.from({ length: 18 }, (_, i) => ({ title: `Slide title ${i + 1}`, notes: i === 2 ? 'Ask the class first.' : '' })),
    milestones: [],
    timer: { status: 'running', remainingSec: 297, durationSec: 300, alarming: false },
    plannedMinutes: null,
    recent: [deck],
    hasExternalDisplay: true,
    projecting,
    projectorSize: { width: 1920, height: 1080 },
    previewSize: { width: 1920, height: 1080 },
    roller: { lists: [{ id: 'l', name: 'Class list', count: 6 }], activeListId: 'l', activeText: '', people: ['Ann Lee', 'Bo Chen', 'Cai Dorji', 'Dema Wangmo', 'Eli Tashi', 'Fay Zangpo'].map((name, i) => ({ id: `1225010${i}`, name, wins: [1, 0, 2, 0, 0, 0][i] })), superLucky: true, roll: null, showing: false },
    deckStatus: { state: 'ready' },
    ink: { tool: 'pen', color: '#ef4444' }
  }
}

function writeStub(state: AppState): void {
  fs.mkdirSync(path.dirname(STUB), { recursive: true })
  fs.writeFileSync(
    STUB,
    `const { contextBridge } = require('electron')
const state = ${JSON.stringify(state)}
const noop = () => {}
const api = {}
for (const key of ${JSON.stringify(API_METHODS)}) api[key] = noop
api.onState = (cb) => setTimeout(() => cb(state), 50)
api.onInkOp = () => noop
api.inkSnapshot = () => Promise.resolve([])
api.pathForFile = () => ''
api.guide = () => Promise.resolve({ aiRequest: ${JSON.stringify(AI_REQUEST)} })
api.saveGuideFile = () => Promise.resolve(null)
contextBridge.exposeInMainWorld('presenter', api)
`
  )
}

type Open = 'guide' | 'guide-prepare' | 'screen-menu' | 'add-menu' | 'crowd' | 'roller' | null
/** Clicks the button that opens each pop-up. */
const OPENERS: Record<string, string> = {
  guide: `[...document.querySelectorAll('header button')].find((x) => x.textContent.includes('📘'))`,
  'guide-prepare': `(() => { [...document.querySelectorAll('header button')].find((x) => x.textContent.includes('📘')).click(); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.startsWith('2'))), 300)) })()`,
  'screen-menu': `[...document.querySelectorAll('footer button')].find((x) => x.textContent.trim() === '⋯')`,
  'add-menu': `[...document.querySelectorAll('footer button')].find((x) => x.textContent.includes('＋'))`,
  roller: `[...document.querySelectorAll('header button')].find((x) => x.textContent.includes('🎲'))`
}

async function shot(projecting: boolean, open: Open = null): Promise<void> {
  writeStub(sampleState(projecting, open === 'crowd'))
  const win = new BrowserWindow({ show: false, width: 1536, height: 864, useContentSize: true, webPreferences: { preload: STUB, contextIsolation: true, sandbox: true, offscreen: true } })
  // A page load can be refused while the previous window is still closing; retry once.
  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html')).catch(async () => {
    await wait(500)
    await win.loadFile(path.join(ROOT, 'out', 'renderer', 'console.html'))
  })
  await wait(1200)
  if (open && OPENERS[open]) {
    const opened = await win.webContents.executeJavaScript(`(async () => { const b = await ${OPENERS[open]}; if (b) b.click(); return !!b })()`)
    if (!opened) throw new Error(`${open} button not found`)
    await wait(600)
  }
  const image = await win.webContents.capturePage()
  const name = `console${projecting ? '-projecting' : ''}${open ? `-${open}` : ''}.png`
  fs.writeFileSync(path.join(OUT, name), image.toPNG())
  const overflow = await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight')
  // A dialog must fit inside the window (its body scrolls instead).
  const dialogCut = await win.webContents.executeJavaScript(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return false; const r = d.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight })()`)
  if (dialogCut) throw new Error(`${open}: the dialog runs off the window`)
  console.log(`ok ${name}${overflow ? ' (page scrolls!)' : ''}`)
  win.destroy()
  await wait(300)
}

app.whenReady().then(async () => {
  let code = 0
  try {
    await shot(false)
    await shot(true)
    await shot(false, 'guide')
    await shot(false, 'guide-prepare')
    await shot(false, 'screen-menu')
    await shot(false, 'crowd')
    await shot(false, 'roller')
    console.log('CONSOLE OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    app.exit(code)
  }
})
