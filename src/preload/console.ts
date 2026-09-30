import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { InkOp } from '../shared/ink'
import type { AppState, ConsoleApi } from '../shared/types'

const api: ConsoleApi = {
  onState: (cb) => {
    let pushed = false
    let first = true
    const take = (state: AppState): void => {
      if (first) ipcRenderer.send('console:got-state')
      first = false
      cb(state)
    }
    ipcRenderer.on('state', (_e, state: AppState) => {
      pushed = true
      take(state)
    })
    // The page subscribes only after React's first render, which can be after the main process
    // sent its first state; so ask for the current state once (a newer push wins).
    void ipcRenderer.invoke('console:get-state').then((state: AppState) => {
      if (!pushed) take(state)
    })
  },
  project: (id) => ipcRenderer.send('console:project', id),
  listWindows: () => ipcRenderer.invoke('console:list-windows'),
  addWindowScreen: (id, name) => ipcRenderer.send('console:add-window-screen', id, name),
  onMirror: (cb) => {
    ipcRenderer.on('mirror', (_e, jpeg: Uint8Array) => cb(jpeg))
  },
  openDialog: () => ipcRenderer.send('console:open-dialog'),
  openPath: (p) => ipcRenderer.send('console:open-path', p),
  pathForFile: (file) => webUtils.getPathForFile(file),
  navigate: (action) => ipcRenderer.send('console:navigate', action),
  key: (intent) => ipcRenderer.send('console:key', intent),
  select: (id) => ipcRenderer.send('console:select', id),
  setLinked: (id, linked) => ipcRenderer.send('console:set-linked', id, linked),
  nudge: (id, delta) => ipcRenderer.send('console:nudge', id, delta),
  addScreen: (sameDeck) => ipcRenderer.send('console:add-screen', sameDeck),
  removeScreen: (id) => ipcRenderer.send('console:remove-screen', id),
  toggleFullscreen: (id) => ipcRenderer.send('console:fullscreen', id),
  timerStart: (sec) => ipcRenderer.send('console:timer-start', sec),
  timerToggle: () => ipcRenderer.send('console:timer-toggle'),
  timerReset: () => ipcRenderer.send('console:timer-reset'),
  timerDismiss: () => ipcRenderer.send('console:timer-dismiss'),
  layoutPreview: (rect) => ipcRenderer.send('console:layout-preview', rect),
  layoutCurrent: (rect) => ipcRenderer.send('console:layout-current', rect),
  startProjecting: () => ipcRenderer.send('console:start-projecting'),
  stopProjecting: () => ipcRenderer.send('console:stop-projecting'),
  zoom: (id, direction) => ipcRenderer.send('console:zoom', id, direction),
  rollerRoll: () => ipcRenderer.send('console:roller-roll'),
  rollerHide: () => ipcRenderer.send('console:roller-hide'),
  rollerReset: () => ipcRenderer.send('console:roller-reset'),
  rollerSetSuperLucky: (on) => ipcRenderer.send('console:roller-super-lucky', on),
  rollerSelectList: (id) => ipcRenderer.send('console:roller-select-list', id),
  rollerSaveList: (id, name, text) => ipcRenderer.send('console:roller-save-list', id, name, text),
  rollerDeleteList: (id) => ipcRenderer.send('console:roller-delete-list', id),
  dismissDeckStatus: () => ipcRenderer.send('console:dismiss-deck-status'),
  setInkTool: (tool) => ipcRenderer.send('console:ink-tool', tool),
  setInkColor: (color) => ipcRenderer.send('console:ink-color', color),
  inkOp: (op, fromCanvas) => ipcRenderer.send('console:ink-op', op, fromCanvas),
  onInkOp: (cb) => {
    const listener = (_e: unknown, op: InkOp): void => cb(op)
    ipcRenderer.on('ink:op', listener)
    return () => {
      ipcRenderer.removeListener('ink:op', listener)
    }
  },
  inkSnapshot: () => ipcRenderer.invoke('console:ink-snapshot'),
  mirrorMode: (mode) => ipcRenderer.send('console:mirror-mode', mode),
  guide: () => ipcRenderer.invoke('console:guide'),
  copyText: (text) => ipcRenderer.send('console:copy-text', text),
  saveGuideFile: (which) => ipcRenderer.invoke('console:save-guide-file', which)
}

contextBridge.exposeInMainWorld('presenter', api)
