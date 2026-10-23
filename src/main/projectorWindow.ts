import { app, BaseWindow, View, WebContentsView, screen } from 'electron'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'
import { projectorDisplay } from './displays'
import { computeRects, type TileNode } from '../shared/tiles'

/** The dark line between two contents on one projector (the divider). */
export const TILE_GAP = 6

const OVERLAY = { width: 320, height: 120, margin: 24 }
/** Deck design size, used when there is no second display. */
export const WINDOWED = { width: 1280, height: 720 }

/**
 * The participants' screen. Hidden until the teacher starts projecting; then it shows
 * the projector deck full-screen on the external display (or as a 1280x720 window
 * when there is no second display), with the timer overlay on top.
 */
export class ProjectorWindow {
  readonly win: BaseWindow
  readonly overlay: WebContentsView
  /** The contents shown now (one, or several in a split), and how they share the room. */
  private tiles = new Map<string, WebContentsView>()
  private tree: TileNode | null = null
  private overlayVisible = false
  /** Black or white over everything (B / W). */
  private readonly cover = new View()
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
    this.cover.setVisible(false)
    this.win.contentView.addChildView(this.cover)
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

  /**
   * The contents under the overlay: one fills the window; several share it as the split tree says.
   * Views that are no longer listed are taken off (their owner hides them).
   */
  setTiles(views: Map<string, WebContentsView>, tree: TileNode | null): void {
    if (this.win.isDestroyed()) return
    const keep = new Set(views.values())
    for (const v of this.tiles.values()) if (!keep.has(v)) this.win.contentView.removeChildView(v)
    const had = new Set(this.tiles.values())
    for (const v of views.values()) {
      if (had.has(v)) continue
      v.setBorderRadius(0)
      this.win.contentView.addChildView(v, 0)
    }
    this.tiles = views
    this.tree = tree
    this.layout()
  }

  shows(view: WebContentsView): boolean {
    return [...this.tiles.values()].includes(view)
  }

  /** Put the deck view under the overlay. */
  attach(view: WebContentsView): void {
    this.setTiles(new Map([['one', view]]), null)
  }

  detach(view: WebContentsView): void {
    if (this.tiles.size === 1 && [...this.tiles.values()][0] === view) this.setTiles(new Map(), null)
    else {
      const next = new Map([...this.tiles].filter(([, v]) => v !== view))
      this.setTiles(next, this.tree)
    }
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
    const rects = this.tree && this.tiles.size > 1 ? computeRects(this.tree, { x: 0, y: 0, width, height }, TILE_GAP) : null
    for (const [id, view] of this.tiles) {
      const r = rects?.get(id)
      view.setBounds(r ? { x: r.x, y: r.y, width: r.width, height: r.height } : { x: 0, y: 0, width, height })
      view.setVisible(true)
    }
    this.roller.setBounds({ x: 0, y: 0, width, height })
    this.cover.setBounds({ x: 0, y: 0, width, height })
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

  /** Black or white over the whole screen (null = show it again). */
  setBlank(kind: 'black' | 'white' | null): void {
    if (kind) this.cover.setBackgroundColor(kind === 'white' ? '#ffffff' : '#000000')
    this.cover.setVisible(kind !== null)
  }

  isBlank(): boolean {
    return this.cover.getVisible()
  }

  setOverlayVisible(visible: boolean): void {
    if (visible === this.overlayVisible) return
    this.overlayVisible = visible
    this.overlay.setVisible(visible)
  }
}
