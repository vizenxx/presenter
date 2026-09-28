import { BrowserWindow } from 'electron'
import { consoleDisplay } from './displays'
import { HEADLESS } from './headless'

/** The teacher's control window on the laptop display. */
export class ConsoleWindow {
  readonly win: BrowserWindow

  constructor(preload: string, load: (win: BrowserWindow) => void, onClosed: () => void) {
    const area = consoleDisplay().workArea
    this.win = new BrowserWindow({
      ...area,
      minWidth: 1024,
      minHeight: 620,
      title: 'Presenter',
      backgroundColor: '#0b0f17',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false }
    })
    this.win.webContents.on('will-navigate', (event) => event.preventDefault())
    // The title follows the chosen language (set by the store), not the page's <title>.
    this.win.on('page-title-updated', (event) => event.preventDefault())
    this.win.once('ready-to-show', () => {
      if (HEADLESS) return
      this.win.maximize()
      this.win.show()
    })
    this.win.on('closed', onClosed)
    load(this.win)
  }

  place(): void {
    // maximize() would also show a hidden window.
    if (this.win.isDestroyed() || HEADLESS) return
    if (this.win.isMaximized()) this.win.unmaximize()
    this.win.setBounds(consoleDisplay().workArea)
    this.win.maximize()
  }
}
