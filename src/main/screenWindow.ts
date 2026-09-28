import { BaseWindow, screen, type WebContentsView } from 'electron'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'
import type { Output } from './output'

/** An extra screen the teacher adds; can be dragged to any display and made full-screen. */
export class ScreenWindow {
  private readonly win: BaseWindow

  constructor(
    private readonly output: Output,
    onClosed: () => void,
    private readonly onFullscreen: (full: boolean) => void,
    private readonly roller: WebContentsView,
    title: string,
    onResize: () => void
  ) {
    const area = screen.getPrimaryDisplay().workArea
    this.win = new BaseWindow({ x: area.x + 80, y: area.y + 80, width: 960, height: 540, title, backgroundColor: '#000000', autoHideMenuBar: true, show: !HEADLESS })
    this.win.contentView.addChildView(output.view)
    this.win.contentView.addChildView(roller)
    this.win.on('resize', () => {
      this.layout()
      onResize()
    })
    this.win.on('enter-full-screen', () => {
      this.layout()
      onFullscreen(true)
    })
    this.win.on('leave-full-screen', () => {
      this.layout()
      onFullscreen(false)
    })
    this.win.on('closed', onClosed)
    this.layout()
  }

  /** The size this screen's deck is laid out for. */
  contentSize(): { width: number; height: number } {
    if (this.win.isDestroyed()) return { width: 960, height: 540 }
    const b = this.win.getContentBounds()
    return { width: b.width, height: b.height }
  }

  setTitle(title: string): void {
    if (!this.win.isDestroyed()) this.win.setTitle(title)
  }

  toggleFullscreen(): void {
    if (this.win.isDestroyed() || HEADLESS) return
    if (!IS_MAC) {
      this.win.setFullScreen(!this.win.isFullScreen())
      return
    }
    // Same Space, no animation (see ProjectorWindow); simple full screen sends no events.
    const full = !this.win.isSimpleFullScreen()
    this.win.setSimpleFullScreen(full)
    this.layout()
    this.onFullscreen(full)
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.close()
  }

  private layout(): void {
    if (this.win.isDestroyed()) return
    const b = this.win.getContentBounds()
    this.output.view.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
    this.roller.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
  }
}
