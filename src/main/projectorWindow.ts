import { app, BaseWindow, WebContentsView, screen } from 'electron'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'
import { projectorDisplay } from './displays'

const OVERLAY = { width: 320, height: 120, margin: 24 }
/** Deck design size, used when there is no second display. */
export const WINDOWED = { width: 1280, height: 720 }

/**
 * The students' screen. Hidden until the teacher starts projecting; then it shows
 * the projector deck full-screen on the external display (or as a 1280x720 window
 * when there is no second display), with the timer overlay on top.
 */
export class ProjectorWindow {
  readonly win: BaseWindow
  readonly overlay: WebContentsView
  private content: WebContentsView | null = null
  private overlayVisible = false
  private allowClose = false
  /** Window titles in the chosen language. */
  titles = { normal: 'Projector · Presenter', windowed: 'Projector (window) · Esc stops projecting' }

  constructor(
    overlayPreload: string,
    loadOverlay: (view: WebContentsView) => void,
    onCloseRequest: () => void,
    private readonly roller: WebContentsView
  ) {
    this.win = new BaseWindow({ ...WINDOWED, backgroundColor: '#000000', title: 'Presenter', autoHideMenuBar: true, show: false })
    this.overlay = new WebContentsView({ webPreferences: { preload: overlayPreload, contextIsolation: true, sandbox: true, backgroundThrottling: false } })
    this.overlay.setBackgroundColor('#00000000')
    this.overlay.setVisible(false)
    // Stack: deck (attached later at index 0), 抽人 picture, timer on top.
    this.win.contentView.addChildView(roller)
    this.win.contentView.addChildView(this.overlay)
    loadOverlay(this.overlay)
    this.win.on('resize', () => this.layout())
    this.win.on('enter-full-screen', () => this.layout())
    this.win.on('leave-full-screen', () => this.layout())
    // Closing the window only stops projecting; the app keeps running.
    this.win.on('close', (event) => {
      if (this.allowClose) return
      event.preventDefault()
      onCloseRequest()
    })
    app.on('before-quit', () => {
      this.allowClose = true
    })
  }

  isOpen(): boolean {
    return !this.win.isDestroyed() && this.win.isVisible()
  }

  /** Put the deck view under the overlay. */
  attach(view: WebContentsView): void {
    this.content = view
    this.win.contentView.addChildView(view, 0)
    this.layout()
  }

  detach(view: WebContentsView): void {
    this.win.contentView.removeChildView(view)
    if (this.content === view) this.content = null
  }

  /** Show on the external display, full-screen; without one, as a window. Keeps focus on the console. */
  open(): void {
    if (this.win.isDestroyed() || HEADLESS) return
    const target = projectorDisplay()
    this.setFull(false)
    if (target) {
      this.win.setBounds(target.bounds)
      this.win.setTitle(this.titles.normal)
    } else {
      const area = screen.getPrimaryDisplay().workArea
      this.win.setContentBounds({ x: area.x + Math.max(0, area.width - WINDOWED.width - 20), y: area.y + 40, ...WINDOWED })
      this.win.setTitle(this.titles.windowed)
    }
    this.win.showInactive()
    if (target) this.setFull(true)
    this.layout()
  }

  /**
   * macOS: "simple" full screen covers the display at once and stays on the current Space;
   * native full screen would open a new Space with an animation and move the focus there.
   */
  private setFull(on: boolean): void {
    if (IS_MAC) {
      if (this.win.isSimpleFullScreen() !== on) this.win.setSimpleFullScreen(on)
    } else if (this.win.isFullScreen() !== on) this.win.setFullScreen(on)
  }

  /** Follow display changes while projecting. */
  place(): void {
    if (this.isOpen()) this.open()
  }

  close(): void {
    if (this.win.isDestroyed()) return
    this.setFull(false)
    this.win.hide()
  }

  layout(): void {
    if (this.win.isDestroyed()) return
    const { width, height } = this.contentSize()
    this.content?.setBounds({ x: 0, y: 0, width, height })
    this.roller.setBounds({ x: 0, y: 0, width, height })
    this.overlay.setBounds({
      x: Math.max(0, width - OVERLAY.width - OVERLAY.margin),
      y: Math.max(0, height - OVERLAY.height - OVERLAY.margin),
      width: OVERLAY.width,
      height: OVERLAY.height
    })
  }

  contentSize(): { width: number; height: number } {
    if (this.win.isDestroyed()) return { ...WINDOWED }
    const b = this.win.getContentBounds()
    return { width: b.width, height: b.height }
  }

  setOverlayVisible(visible: boolean): void {
    if (visible === this.overlayVisible) return
    this.overlayVisible = visible
    this.overlay.setVisible(visible)
  }
}
