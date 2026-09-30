import { BaseWindow, screen, type Display, type WebContentsView } from 'electron'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'

const WINDOWED = { width: 960, height: 540 }

/**
 * Projector 2, 3 …: an extra audience screen the teacher asks for from a card's projector menu.
 * It shows one content at a time (or stays black), with the name picker's overlay on top.
 * It opens full screen on a display nobody uses yet, else as a normal window.
 */
export class ProjectorScreen {
  readonly win: BaseWindow
  private content: WebContentsView | null = null
  private fullscreen = false

  constructor(
    readonly number: number,
    private readonly roller: WebContentsView,
    private readonly title: string,
    display: Display | null,
    private readonly onFullscreen: (full: boolean) => void,
    onResize: () => void,
    onClosed: () => void
  ) {
    const area = screen.getPrimaryDisplay().workArea
    const bounds = display ? display.bounds : { x: area.x + 80 + 40 * number, y: area.y + 80 + 30 * number, ...WINDOWED }
    this.win = new BaseWindow({ ...bounds, title, backgroundColor: '#000000', autoHideMenuBar: true, show: !HEADLESS })
    this.win.contentView.addChildView(roller)
    this.win.on('resize', () => {
      this.layout()
      onResize()
    })
    this.win.on('enter-full-screen', () => this.setFull(true))
    this.win.on('leave-full-screen', () => this.setFull(false))
    // Take the content off first: closing the window must not end the content's page.
    this.win.on('close', () => {
      if (this.content) this.win.contentView.removeChildView(this.content)
      this.content = null
    })
    this.win.on('closed', onClosed)
    this.layout()
    if (display) this.setFullscreen(true)
  }

  isFullscreen(): boolean {
    return this.fullscreen
  }

  /** Show this content (null = black). The previous content is simply taken off. */
  show(view: WebContentsView | null): void {
    if (this.win.isDestroyed()) return
    if (this.content && this.content !== view) this.win.contentView.removeChildView(this.content)
    this.content = view
    if (view) {
      this.win.contentView.addChildView(view, 0)
      view.setVisible(true)
    }
    this.layout()
  }

  shows(view: WebContentsView): boolean {
    return this.content === view
  }

  mediaSourceId(): string {
    return this.win.isDestroyed() ? '' : this.win.getMediaSourceId()
  }

  /** The size a deck on this screen is laid out for. */
  contentSize(): { width: number; height: number } {
    if (this.win.isDestroyed()) return { ...WINDOWED }
    const b = this.win.getContentBounds()
    return { width: b.width, height: b.height }
  }

  toggleFullscreen(): void {
    this.setFullscreen(!this.fullscreen)
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.close()
  }

  /** macOS: simple full screen stays on the same Space (see ProjectorWindow). */
  private setFullscreen(on: boolean): void {
    if (this.win.isDestroyed() || HEADLESS) return
    if (IS_MAC) {
      this.win.setSimpleFullScreen(on)
      this.setFull(on)
    } else this.win.setFullScreen(on)
  }

  private setFull(on: boolean): void {
    this.fullscreen = on
    this.layout()
    this.onFullscreen(on)
  }

  private layout(): void {
    if (this.win.isDestroyed()) return
    const b = this.win.getContentBounds()
    this.content?.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
    this.roller.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
    this.win.setTitle(this.content ? this.title : `${this.title} · nothing shown`)
  }
}
