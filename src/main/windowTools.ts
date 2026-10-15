import { BrowserWindow, screen, type Rectangle } from 'electron'
import { keepInside } from '../shared/place'
import { HEADLESS } from './headless'
import { toolsLog } from './toolsLog'
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
  /** The window being followed, where it was last, and where the toolbar stands on it. */
  private windowKey = ''
  private lastBounds: Rectangle | null = null
  private offset: { dx: number; dy: number } | null = null

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
      // Windows: not always on top. The pad and the toolbar sit directly above the window they follow
      // (WindowsHelper.stackAbove), so they are covered when that window is, and move in front when it does.
      // macOS keeps window levels.
      alwaysOnTop: IS_MAC,
      webPreferences: { preload: paths.deckPreload, contextIsolation: true, sandbox: true, backgroundThrottling: false }
    })
    if (IS_MAC) this.pad.setAlwaysOnTop(true, 'floating')
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
      alwaysOnTop: IS_MAC,
      webPreferences: { preload: paths.consolePreload, contextIsolation: true, sandbox: true, backgroundThrottling: false }
    })
    if (IS_MAC) this.toolbar.setAlwaysOnTop(true, 'screen-saver')
    this.toolbar.setContentProtection(true)
    if (IS_MAC) this.toolbar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    paths.loadToolbar(this.toolbar)
    // What the two windows do (tools-log.txt): a toolbar that flashes shows up here as hide/show, blur/focus,
    // resize, move or a page load, with the time of each.
    for (const [name, win] of [['toolbar', this.toolbar], ['pad', this.pad]] as const) {
      for (const event of ['show', 'hide', 'focus', 'blur', 'resize', 'move', 'minimize', 'restore'] as const) {
        let last = 0
        win.on(event as 'show', () => {
          // move and resize can come in dozens: one line per 300 ms is enough.
          const now = Date.now()
          if ((event === 'move' || event === 'resize') && now - last < 300) return
          last = now
          toolsLog(`${name}: ${event}`)
        })
      }
      win.webContents.on('did-start-loading', () => toolsLog(`${name} page: starts loading`))
      win.webContents.on('did-finish-load', () => toolsLog(`${name} page: loaded`))
      win.webContents.on('render-process-gone', (_e, details) => toolsLog(`${name} page: process gone (${details.reason})`))
    }
    // Dragged to or past the edge: it comes back inside the display it is on (never lost off screen).
    this.toolbar.on('moved', () => {
      this.keepToolbarInside()
      if (this.lastBounds) this.rememberOffset(this.lastBounds)
    })
  }

  /** Where the toolbar stands on the followed window, so it can go with the window when that moves. */
  private rememberOffset(window: Rectangle): void {
    if (this.toolbar.isDestroyed()) return
    const b = this.toolbar.getBounds()
    this.offset = { dx: b.x - window.x, dy: b.y - window.y }
  }

  /** Puts the toolbar wholly inside the work area of the display it is mostly on. */
  keepToolbarInside(): void {
    if (HEADLESS || this.toolbar.isDestroyed()) return
    const b = this.toolbar.getBounds()
    const next = keepInside(b, screen.getDisplayMatching(b).workArea)
    // A pixel or two of difference is only the rounding of a scaled display (125 %, 150 %); moving for it would never settle.
    const off = (a: number, c: number): boolean => Math.abs(a - c) > 2
    if (off(next.x, b.x) || off(next.y, b.y) || off(next.width, b.width) || off(next.height, b.height)) this.toolbar.setBounds(next)
  }

  handles(): number[] {
    return [this.toolbar, this.pad].filter((w) => !w.isDestroyed()).map(handleOf)
  }

  isShown(): boolean {
    return this.shown
  }

  /**
   * Show over the window (Windows: physical pixels; macOS: points, as the system reports them), or hide (null).
   * windowKey says which window it is: when it changes, the toolbar comes to the visible part of the new
   * window; while it stays, the toolbar goes with the window when the window moves.
   */
  place(physical: Rectangle | null, windowKey: string | null = null): void {
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
    const key = windowKey ?? ''
    if (!this.placed || key !== this.windowKey) {
      // First time, or another window is followed: the toolbar comes to the top middle of the part of that
      // window that can be seen (the window cut to its display); from there it stays where the teacher drags it.
      const area = screen.getDisplayMatching(bounds).workArea
      const left = Math.max(bounds.x, area.x)
      const top = Math.max(bounds.y, area.y)
      const right = Math.min(bounds.x + bounds.width, area.x + area.width)
      const bottom = Math.min(bounds.y + bounds.height, area.y + area.height)
      const visible = right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : area
      const size = this.toolbar.getBounds()
      const x = Math.round(visible.x + (visible.width - size.width) / 2)
      const y = visible.y + 8
      this.toolbar.setPosition(x, y)
      this.placed = true
      this.windowKey = key
      this.keepToolbarInside()
      this.rememberOffset(bounds)
    } else if (this.lastBounds && this.offset && (bounds.x !== this.lastBounds.x || bounds.y !== this.lastBounds.y)) {
      // The window moved: the toolbar goes with it, keeping its place on the window.
      this.toolbar.setPosition(bounds.x + this.offset.dx, bounds.y + this.offset.dy)
      this.keepToolbarInside()
    }
    this.lastBounds = bounds
    if (!this.shown) {
      this.shown = true
      this.pad.showInactive()
      this.toolbar.showInactive()
      // A pad shown again gets its click-through style from the state once more (see setDrawing).
      this.pad.setIgnoreMouseEvents(!this.drawing)
    }
  }

  isDrawing(): boolean {
    return this.drawing
  }

  /** Drawing tools make the pad take the mouse; the pointer lets clicks through to the window. */
  setDrawing(drawing: boolean): void {
    if (this.pad.isDestroyed()) return
    this.drawing = drawing
    // Applied every time (not only when it changes): after the pad was hidden and shown again the system's
    // click-through style must follow the state, never the other way round.
    this.pad.setIgnoreMouseEvents(!drawing)
  }

  /** The toolbar page reports its size (it changes when collapsed or expanded). */
  resizeToolbar(width: number, height: number): void {
    if (this.toolbar.isDestroyed()) return
    const w = Math.max(40, Math.min(1600, Math.round(width)))
    const h = Math.max(24, Math.min(900, Math.round(height)))
    const b = this.toolbar.getBounds()
    if (b.width === w && b.height === h) return
    // Keep the toolbar's centre where it is.
    this.toolbar.setBounds({ x: Math.round(b.x + (b.width - w) / 2), y: b.y, width: w, height: h })
    // The bar grew: it may now reach past the edge of the display.
    this.keepToolbarInside()
  }

  destroy(): void {
    for (const w of [this.toolbar, this.pad]) if (!w.isDestroyed()) w.destroy()
  }
}
