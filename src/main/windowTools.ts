import { BrowserWindow, screen, type Rectangle } from 'electron'
import { HEADLESS } from './headless'
import { IS_MAC } from './platform'

export interface WindowToolsPaths {
  consolePreload: string
  deckPreload: string
  loadToolbar: (win: BrowserWindow) => void
  loadInkPad: (win: BrowserWindow) => void
}

/** A native window handle as a number (Windows HWND). */
export function handleOf(win: BrowserWindow): number {
  const b = win.getNativeWindowHandle()
  return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0)
}

/**
 * The tools over a program window shown on a projector (Windows): a small always-on-top toolbar
 * (marks, both timers, name picker) and a see-through ink pad lying exactly on the window.
 * Both are left out of screen capture; the projector captures only the program window itself.
 * The pad lets clicks through to the window unless a drawing tool is chosen.
 */
export class WindowTools {
  readonly toolbar: BrowserWindow
  readonly pad: BrowserWindow
  private shown = false
  private drawing = false
  private placed = false

  constructor(paths: WindowToolsPaths) {
    this.pad = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      webPreferences: { preload: paths.deckPreload, contextIsolation: true, sandbox: true, backgroundThrottling: false }
    })
    this.pad.setAlwaysOnTop(true, 'floating')
    this.pad.setContentProtection(true)
    // macOS: also over programs in full screen (their own Space).
    if (IS_MAC) this.pad.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.pad.setIgnoreMouseEvents(true)
    paths.loadInkPad(this.pad)

    this.toolbar = new BrowserWindow({
      show: false,
      width: 520,
      height: 56,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { preload: paths.consolePreload, contextIsolation: true, sandbox: true, backgroundThrottling: false }
    })
    this.toolbar.setAlwaysOnTop(true, 'screen-saver')
    this.toolbar.setContentProtection(true)
    if (IS_MAC) this.toolbar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    paths.loadToolbar(this.toolbar)
  }

  handles(): number[] {
    return [this.toolbar, this.pad].filter((w) => !w.isDestroyed()).map(handleOf)
  }

  isShown(): boolean {
    return this.shown
  }

  /** Show over the window (Windows: physical pixels; macOS: points, as the system reports them), or hide (null). */
  place(physical: Rectangle | null): void {
    if (HEADLESS || this.toolbar.isDestroyed() || this.pad.isDestroyed()) return
    if (!physical) {
      if (!this.shown) return
      this.shown = false
      this.pad.hide()
      this.toolbar.hide()
      return
    }
    const bounds = IS_MAC ? physical : screen.screenToDipRect(null, physical)
    const now = this.pad.getBounds()
    if (now.x !== bounds.x || now.y !== bounds.y || now.width !== bounds.width || now.height !== bounds.height) this.pad.setBounds(bounds)
    if (!this.placed) {
      // First time: the toolbar starts at the top middle of the window's display; then it stays where the teacher drags it.
      const area = screen.getDisplayMatching(bounds).workArea
      const size = this.toolbar.getBounds()
      this.toolbar.setPosition(Math.round(area.x + (area.width - size.width) / 2), area.y + 8)
      this.placed = true
    }
    if (!this.shown) {
      this.shown = true
      this.pad.showInactive()
      this.toolbar.showInactive()
    }
  }

  /** Drawing tools make the pad take the mouse; the pointer lets clicks through to the window. */
  setDrawing(drawing: boolean): void {
    if (this.drawing === drawing || this.pad.isDestroyed()) return
    this.drawing = drawing
    this.pad.setIgnoreMouseEvents(!drawing)
  }

  /** The toolbar page reports its size (it changes when collapsed or expanded). */
  resizeToolbar(width: number, height: number): void {
    if (this.toolbar.isDestroyed()) return
    const w = Math.max(40, Math.min(1600, Math.round(width)))
    const h = Math.max(24, Math.min(400, Math.round(height)))
    const b = this.toolbar.getBounds()
    if (b.width === w && b.height === h) return
    // Keep the toolbar's centre where it is.
    this.toolbar.setBounds({ x: Math.round(b.x + (b.width - w) / 2), y: b.y, width: w, height: h })
  }

  destroy(): void {
    for (const w of [this.toolbar, this.pad]) if (!w.isDestroyed()) w.destroy()
  }
}
