import { app, ipcMain, Menu, type WebContents } from 'electron'
import path from 'node:path'
import type { InkOp, InkTool } from '../shared/ink'
import type { KeyIntent, NavAction, OutputId, PreviewRect } from '../shared/types'
import type { ZoomDirection } from '../shared/zoom'
import type { GuideFile } from '../shared/guide'
import { registerDeckScheme, setViewerRoot } from './deckProtocol'
import { AI_REQUEST, copyText } from './guide'
import { Output, type DeckStateMsg } from './output'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'
import { startupLog } from './startupLog'
import { Store } from './store'

registerDeckScheme()
// Tests run with their own data folder so they never touch the teacher's recent files or zoom memory.
if (process.env['PRESENTER_USER_DATA']) app.setPath('userData', process.env['PRESENTER_USER_DATA'])
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const preload = (name: string): string => path.join(__dirname, `../preload/${name}.js`)

function loadPage(wc: WebContents, name: string): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && dev) void wc.loadURL(`${dev}/${name}.html`)
  else void wc.loadFile(path.join(__dirname, `../renderer/${name}.html`))
}

function wireIpc(store: Store): void {
  const outputOf = (wc: WebContents): Output | undefined => Output.byContents.get(wc.id)
  ipcMain.handle('console:get-state', () => {
    startupLog('console asked for its state')
    return store.getState()
  })
  ipcMain.on('console:got-state', () => startupLog('console received its state (the app is ready)'))
  ipcMain.on('deck:state', (e, msg: DeckStateMsg) => outputOf(e.sender)?.receiveState(msg))
  ipcMain.on('deck:editing', (e, editing: boolean) => {
    const o = outputOf(e.sender)
    if (o) o.editing = editing
  })
  ipcMain.on('deck:pointer', (e) => {
    const o = outputOf(e.sender)
    if (o) store.onPointer(o.id)
  })
  ipcMain.on('overlay:pointer', () => store.onPointer('projector'))
  // Marks: only the projector deck page may send them.
  ipcMain.on('ink:op', (e, op: InkOp) => {
    if (outputOf(e.sender)?.kind === 'projector') store.inkOp(op, 'deck')
  })
  ipcMain.on('ink:ready', (e) => {
    if (outputOf(e.sender)?.kind === 'projector') store.inkReady()
  })
  ipcMain.on('ink:set-tool', (_e, tool: InkTool) => store.setInkTool(tool))
  ipcMain.on('ink:set-color', (_e, color: string) => store.setInkColor(color))
  ipcMain.on('console:ink-tool', (_e, tool: InkTool) => store.setInkTool(tool))
  ipcMain.on('console:ink-color', (_e, color: string) => store.setInkColor(color))
  ipcMain.on('console:ink-op', (_e, op: InkOp, fromCanvas: boolean) => store.inkOp(op, fromCanvas ? 'console' : 'main'))
  ipcMain.handle('console:ink-snapshot', () => store.inkSnapshot())
  ipcMain.on('console:mirror-mode', (_e, mode: 'video' | 'snapshot') => store.setMirrorMode(mode))
  ipcMain.handle('console:guide', () => ({ aiRequest: AI_REQUEST }))
  ipcMain.on('console:copy-text', (_e, text: string) => copyText(String(text)))
  ipcMain.handle('console:save-guide-file', (_e, which: GuideFile) => store.saveGuideFile(which))
  ipcMain.on('console:open-dialog', () => void store.openDialog())
  ipcMain.on('console:open-path', (_e, p: string) => void store.openMainDeck(p))
  ipcMain.on('console:dismiss-deck-status', () => store.dismissDeckStatus())
  ipcMain.on('console:navigate', (_e, action: NavAction) => store.navigate(action))
  ipcMain.on('console:key', (_e, intent: KeyIntent) => store.onKey(intent, null))
  ipcMain.on('console:select', (_e, id: OutputId) => store.select(id))
  ipcMain.on('console:set-linked', (_e, id: OutputId, linked: boolean) => store.setLinked(id, linked))
  ipcMain.on('console:nudge', (_e, id: OutputId, delta: number) => store.nudge(id, delta))
  ipcMain.on('console:add-screen', (_e, sameDeck: boolean) => void store.addScreen(sameDeck))
  ipcMain.on('console:remove-screen', (_e, id: OutputId) => store.removeScreen(id))
  ipcMain.on('console:fullscreen', (_e, id: OutputId) => store.toggleFullscreen(id))
  ipcMain.on('console:timer-start', (_e, sec: number) => store.timerStart(sec))
  ipcMain.on('console:timer-toggle', () => store.timerToggle())
  ipcMain.on('console:timer-reset', () => store.timerReset())
  ipcMain.on('console:timer-dismiss', () => store.dismissAlarm())
  ipcMain.on('console:layout-preview', (_e, rect: PreviewRect | null) => store.layoutPreview(rect))
  ipcMain.on('console:layout-current', (_e, rect: PreviewRect | null) => store.layoutCurrent(rect))
  ipcMain.on('console:start-projecting', () => store.startProjecting())
  ipcMain.on('console:stop-projecting', () => store.stopProjecting())
  ipcMain.on('console:zoom', (_e, id: OutputId | null, direction: ZoomDirection) => store.zoom(id, direction))
  ipcMain.on('console:roller-roll', () => store.rollerRoll())
  ipcMain.on('console:roller-hide', () => store.rollerHide())
  ipcMain.on('console:roller-reset', () => store.rollerReset())
  ipcMain.on('console:roller-super-lucky', (_e, on: boolean) => store.rollerSetSuperLucky(on))
  ipcMain.on('console:roller-select-list', (_e, id: string) => store.rollerSelectList(id))
  ipcMain.on('console:roller-save-list', (_e, id: string | null, name: string, text: string) => store.rollerSaveList(id, name, text))
  ipcMain.on('console:roller-delete-list', (_e, id: string) => store.rollerDeleteList(id))
  ipcMain.on('roller:pointer', () => store.rollerPointer())
}

app.whenReady().then(() => {
  startupLog('app ready')
  // macOS needs an app menu for ⌘Q, ⌘C, ⌘V in text fields. No Undo item: ⌘Z undoes a mark.
  Menu.setApplicationMenu(
    IS_MAC
      ? Menu.buildFromTemplate([
          { role: 'appMenu' },
          { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
          { role: 'windowMenu' }
        ])
      : null
  )
  // The PDF/PPT viewer is a built renderer page, served on every deck host.
  setViewerRoot(path.join(__dirname, '../renderer'))
  // Registered before any page exists, so every page starts muted.
  if (HEADLESS) app.on('web-contents-created', (_e, wc) => wc.setAudioMuted(true))
  const store = new Store({
    deckPreload: preload('deck'),
    consolePreload: preload('console'),
    overlayPreload: preload('overlay'),
    rollerPreload: preload('roller'),
    loadConsole: (win) => loadPage(win.webContents, 'console'),
    loadOverlay: (view) => loadPage(view.webContents, 'overlay'),
    loadRoller: (view) => loadPage(view.webContents, 'roller')
  })
  store.start()
  wireIpc(store)
  startupLog('windows created')
  if (process.env['PRESENTER_TEST'] === '1') (globalThis as Record<string, unknown>)['__presenter'] = store
  const initial = process.env['PRESENTER_OPEN'] ?? process.argv.find((a) => /\.html?$/i.test(a))
  if (initial) void store.openMainDeck(initial)
})

app.on('window-all-closed', () => app.quit())
