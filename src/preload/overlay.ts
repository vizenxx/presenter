import { contextBridge, ipcRenderer } from 'electron'
import type { TimerView } from '../shared/types'

contextBridge.exposeInMainWorld('overlay', {
  onTimer: (cb: (t: TimerView) => void) => {
    ipcRenderer.on('timer', (_e, t: TimerView) => cb(t))
  },
  pointer: () => ipcRenderer.send('overlay:pointer')
})
