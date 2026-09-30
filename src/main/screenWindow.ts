import { BaseWindow, screen, type WebContentsView } from 'electron'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'
import type { Output } from './output'

/** An extra screen the teacher adds; can be dragged to any display and made full-screen. */
export class ScreenWindow {
  private readonly win: BaseWindow
  /** True while this screen's page is on the projector; the window then stays empty. */
  private lent = false
  private title: string

  constructor(
    private readonly output: Output,
    onClosed: () => void,
    private readonly onFullscreen: (full: boolean) => void,
    private readonly roller: WebContentsView,
    title: string,
    onResize: () => void
  ) {
    this.title = title
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

  mediaSourceId(): string {
    return this.win.isDestroyed() ? '' : this.win.getMediaSourceId()
  }

  /** The size this screen's deck is laid out for. */
  contentSize(): { width: number; height: number } {
    if (this.win.isDestroyed()) return { width: 960, height: 540 }
    const b = this.win.getContentBounds()
    return { width: b.width, height: b.height }
  }

  setTitle(title: string): void {
    this.title = title
    this.showTitle()
  }

  /** The page moves to the projector (or the console's current pane) for now. */
  lend(): void {
    if (this.lent || this.win.isDestroyed()) return
    this.lent = true
    this.win.contentView.removeChildView(this.output.view)
    this.showTitle()
  }

  /** The page comes back from the projector. */
  takeBack(): void {
    if (!this.lent || this.win.isDestroyed()) return
    this.lent = false
    this.win.contentView.addChildView(this.output.view, 0)
    this.output.view.setVisible(true)
    this.layout()
    this.showTitle()
  }

  private showTitle(): void {
    if (!this.win.isDestroyed()) this.win.setTitle(this.lent ? `${this.title} · on the projector now` : this.title)
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
    if (!this.lent) this.output.view.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
    this.roller.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
  }
}
