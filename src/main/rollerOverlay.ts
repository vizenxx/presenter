import { WebContentsView } from 'electron'
import type { RollerPlay } from '../shared/types'

/** The full-screen 抽人 picture laid over a students' screen. Hidden until a roll. */
export class RollerOverlay {
  readonly view: WebContentsView

  constructor(preload: string, load: (view: WebContentsView) => void) {
    this.view = new WebContentsView({ webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false } })
    this.view.setBackgroundColor('#00000000')
    this.view.setVisible(false)
    load(this.view)
  }

  play(payload: RollerPlay): void {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return
    this.view.setVisible(true)
    wc.send('roller:play', payload)
  }

  /** Random groups on the students' screen (sound: this screen plays the landing sound). */
  showGroups(groups: string[][], sound: boolean): void {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return
    this.view.setVisible(true)
    wc.send('roller:groups', groups, sound)
  }

  hide(): void {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return
    this.view.setVisible(false)
    wc.send('roller:hide')
  }

  destroy(): void {
    const wc = this.view.webContents
    if (!wc.isDestroyed()) wc.close()
  }
}
