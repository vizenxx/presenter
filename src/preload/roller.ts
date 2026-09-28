import { contextBridge, ipcRenderer } from 'electron'
import type { RollerPlay } from '../shared/types'

contextBridge.exposeInMainWorld('roller', {
  onPlay: (cb: (play: RollerPlay) => void) => {
    ipcRenderer.on('roller:play', (_e, play: RollerPlay) => cb(play))
  },
  onHide: (cb: () => void) => {
    ipcRenderer.on('roller:hide', () => cb())
  },
  pointer: () => ipcRenderer.send('roller:pointer')
})
