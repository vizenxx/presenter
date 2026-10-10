/**
 * Marks on the projected slide (pen, highlighter, box, arrow, laser, eraser).
 * Coordinates are fractions of the slide area (0..1), so the projector and the
 * console draw the same picture at any size. Every surface keeps an InkScene and
 * applies the same small operations; nothing is sent as pixels.
 */

import { canvasMeasure, drawText, hitText, textBounds, textHalo, TEXT_CLICK_FONT, TEXT_CLICK_ROOM, TEXT_FONT_FAMILY, TEXT_FONT_WEIGHT, TEXT_LINE_HEIGHT, layoutStroke, type Measure } from './inkText'

export type InkTool = 'pointer' | 'pen' | 'highlighter' | 'rect' | 'arrow' | 'text' | 'laser' | 'eraser' | 'zoom'
export const INK_TOOLS: InkTool[] = ['pointer', 'pen', 'highlighter', 'rect', 'arrow', 'text', 'laser', 'eraser', 'zoom']
export type StrokeTool = 'pen' | 'highlighter' | 'rect' | 'arrow' | 'text'

/** Tool keys (no modifier), the same in the console and on the floating toolbar. */
export const INK_KEYS: Record<string, InkTool> = { p: 'pen', h: 'highlighter', r: 'rect', a: 'arrow', t: 'text', l: 'laser', e: 'eraser', z: 'zoom' }

export type InkKeyAction = { type: 'tool'; tool: InkTool } | { type: 'undo' } | { type: 'clear' } | { type: 'pointer' }

/**
 * What a key does to the marks: Ctrl+Z (⌘Z) undoes, Esc leaves a drawing tool, Delete clears
 * (the Mac "delete" key sends Backspace), a letter picks a tool or, pressed again, the pointer.
 */
export function inkKeyAction(key: string, mods: { control?: boolean; alt?: boolean; meta?: boolean }, mac: boolean, tool: InkTool): InkKeyAction | null {
  if ((mods.control || mods.meta) && !mods.alt && key.toLowerCase() === 'z') return { type: 'undo' }
  if (mods.control || mods.alt || mods.meta) return null
  if (key === 'Escape') return tool === 'pointer' ? null : { type: 'pointer' }
  if (key === 'Delete' || (mac && key === 'Backspace')) return { type: 'clear' }
  const picked = INK_KEYS[key.toLowerCase()]
  if (!picked) return null
  return picked === tool ? { type: 'pointer' } : { type: 'tool', tool: picked }
}

/** red, yellow, green, blue, white, black */
export const INK_COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#111111']

export interface InkStroke {
  id: string
  tool: StrokeTool
  color: string
  /** Flat x,y pairs; a box has exactly two corners, an arrow its start and its tip; a text one point (a click) or two corners (a dragged box). */
  points: number[]
  /** The words of a text mark. */
  text?: string
}

export interface InkLaser {
  x: number
  y: number
}

export type InkOp =
  | { t: 'begin'; stroke: InkStroke }
  | { t: 'extend'; id: string; points: number[] }
  /** Replaces all points: the free corner of a box, the tip of an arrow, the end of a straight line, or where a text stands. */
  | { t: 'rect'; id: string; points: number[] }
  /** Sets the words of a text mark. */
  | { t: 'text'; id: string; text: string }
  | { t: 'erase'; ids: string[] }
  | { t: 'undo' }
  | { t: 'clear' }
  | { t: 'laser'; x: number; y: number }
  | { t: 'laser-off' }
  /** Enlarge a part of the slide to fill the screen ([x0, y0, x1, y1], fractions), or null to show it all again. */
  | { t: 'zoom'; rect: number[] | null }

export interface InkSettings {
  tool: InkTool
  color: string
}

/** Line width as a fraction of the slide height. */
export const STROKE_WIDTH: Record<StrokeTool, number> = { pen: 0.005, highlighter: 0.026, rect: 0.0045, arrow: 0.006, text: 0 }
const LASER_RADIUS = 0.009
/** Arrow head: the two lines of the V, as a fraction of the slide height, and their angle to the shaft. */
const ARROW_HEAD = 0.035
const ARROW_SPREAD = Math.PI / 6

// ---------- Shift: straight lines, squares, 45° steps ----------

/**
 * The free corner of a square box that starts at (x0, y0) and follows the pointer (x, y).
 * aspect = slide width / height, so the box is square on the real slide. It stays on the slide.
 */
export function squareCorner(x0: number, y0: number, x: number, y: number, aspect: number): [number, number] {
  const dx = (x - x0) * aspect
  const dy = y - y0
  const sx = dx < 0 ? -1 : 1
  const sy = dy < 0 ? -1 : 1
  const roomX = (sx > 0 ? 1 - x0 : x0) * aspect
  const roomY = sy > 0 ? 1 - y0 : y0
  const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), roomX, roomY)
  return [x0 + (sx * side) / aspect, y0 + sy * side]
}

/** The end of a line from (x0, y0) toward (x, y), turned to the nearest 45° step. It stays on the slide. */
export function snapLine(x0: number, y0: number, x: number, y: number, aspect: number): [number, number] {
  const dx = (x - x0) * aspect
  const dy = y - y0
  let length = Math.hypot(dx, dy)
  if (length === 0) return [x, y]
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const ux = Math.abs(Math.cos(angle)) < 1e-9 ? 0 : Math.cos(angle)
  const uy = Math.abs(Math.sin(angle)) < 1e-9 ? 0 : Math.sin(angle)
  if (ux > 0) length = Math.min(length, ((1 - x0) * aspect) / ux)
  if (ux < 0) length = Math.min(length, (x0 * aspect) / -ux)
  if (uy > 0) length = Math.min(length, (1 - y0) / uy)
  if (uy < 0) length = Math.min(length, y0 / -uy)
  return [x0 + (ux * length) / aspect, y0 + uy * length]
}

export class InkScene {
  strokes: InkStroke[] = []
  laser: InkLaser | null = null
  /** The enlarged part ([x0, y0, x1, y1]), or null. */
  zoom: number[] | null = null
  /** The text being typed on this surface: its own text box shows it, so it is not drawn (not shared). */
  editing: string | null = null
  /** Called when the strokes are replaced as a whole (another page's marks). */
  onReplace: (() => void) | null = null

  /** Replaces all marks (another page's). */
  replace(strokes: InkStroke[]): void {
    this.strokes = strokes.map((s) => ({ ...s, points: [...s.points] }))
    this.laser = null
    this.onReplace?.()
  }

  apply(op: InkOp): void {
    switch (op.t) {
      case 'begin':
        this.strokes.push({ ...op.stroke, points: [...op.stroke.points] })
        break
      case 'extend': {
        const stroke = this.find(op.id)
        if (stroke) stroke.points.push(...op.points)
        break
      }
      case 'rect': {
        const stroke = this.find(op.id)
        if (stroke) stroke.points = [...op.points]
        break
      }
      case 'text': {
        const stroke = this.find(op.id)
        if (stroke) stroke.text = op.text
        break
      }
      case 'erase': {
        const gone = new Set(op.ids)
        this.strokes = this.strokes.filter((s) => !gone.has(s.id))
        break
      }
      case 'undo':
        this.strokes.pop()
        break
      case 'clear':
        this.strokes = []
        this.laser = null
        break
      case 'laser':
        this.laser = { x: op.x, y: op.y }
        break
      case 'laser-off':
        this.laser = null
        break
      case 'zoom':
        this.zoom = op.rect ? [...op.rect] : null
        break
    }
  }

  private find(id: string): InkStroke | undefined {
    for (let i = this.strokes.length - 1; i >= 0; i--) if (this.strokes[i].id === id) return this.strokes[i]
    return undefined
  }
}

// ---------- zoom (the magnifier) ----------

/** The largest enlargement, and the smallest box (fraction of the slide) that counts as a drag, not a click. */
export const MAX_ZOOM = 8
export const MIN_ZOOM_BOX = 0.03

/**
 * How to enlarge a box to fill the screen, keeping its shape: scale s, then move by (tx, ty)
 * (fractions of the screen; a point p of the screen goes to t + s * p). The box's centre goes to
 * the screen's centre; the slide never shrinks.
 */
export function zoomTransform(rect: number[]): { s: number; tx: number; ty: number } {
  const [x0, y0, x1, y1] = rect
  const w = Math.max(1e-3, Math.abs(x1 - x0))
  const h = Math.max(1e-3, Math.abs(y1 - y0))
  const s = Math.max(1, Math.min(MAX_ZOOM, 1 / w, 1 / h))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return { s, tx: 0.5 - s * cx, ty: 0.5 - s * cy }
}

// ---------- eraser ----------

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * True when (x, y) is within `radius` (fraction of the slide height) of the stroke.
 * `aspect` = width / height, so distances are measured on the real slide shape.
 */
export function hitStroke(stroke: InkStroke, x: number, y: number, radius: number, aspect: number, measure?: Measure): boolean {
  if (stroke.tool === 'text') return measure ? hitText(stroke, x, y, radius, aspect, measure) : false
  const p = stroke.points
  const X = (v: number): number => v * aspect
  const reach = radius + STROKE_WIDTH[stroke.tool] / 2
  if (stroke.tool === 'rect') {
    if (p.length < 4) return false
    const [x0, y0, x1, y1] = p
    const edges: Array<[number, number, number, number]> = [
      [x0, y0, x1, y0],
      [x1, y0, x1, y1],
      [x1, y1, x0, y1],
      [x0, y1, x0, y0]
    ]
    return edges.some(([ax, ay, bx, by]) => segmentDistance(X(x), y, X(ax), ay, X(bx), by) <= reach)
  }
  if (p.length === 2) return Math.hypot(X(x) - X(p[0]), y - p[1]) <= reach
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (segmentDistance(X(x), y, X(p[i]), p[i + 1], X(p[i + 2]), p[i + 3]) <= reach) return true
  }
  return false
}

// ---------- drawing (any 2D canvas) ----------

export function drawInk(ctx: CanvasRenderingContext2D, width: number, height: number, scene: InkScene): void {
  ctx.clearRect(0, 0, width, height)
  let measure: Measure | null = null
  for (const stroke of scene.strokes) {
    if (stroke.tool !== 'text') drawStroke(ctx, width, height, stroke)
    else if (stroke.id !== scene.editing) drawText(ctx, width, height, stroke, (measure ??= canvasMeasure()))
  }
  if (scene.laser) drawLaser(ctx, width, height, scene.laser)
}

function drawStroke(ctx: CanvasRenderingContext2D, w: number, h: number, s: InkStroke): void {
  const p = s.points
  if (p.length < 2) return
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.lineWidth = STROKE_WIDTH[s.tool] * h
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.tool === 'highlighter') ctx.globalAlpha = 0.35
  ctx.beginPath()
  if (s.tool === 'rect') {
    if (p.length >= 4) {
      const x = Math.min(p[0], p[2]) * w
      const y = Math.min(p[1], p[3]) * h
      const r = Math.min(0.012 * h, Math.abs(p[2] - p[0]) * w / 2, Math.abs(p[3] - p[1]) * h / 2)
      ctx.roundRect(x, y, Math.abs(p[2] - p[0]) * w, Math.abs(p[3] - p[1]) * h, r)
    }
  } else if (s.tool === 'arrow') {
    // A straight shaft with an open V head at the tip.
    if (p.length >= 4) {
      const [x0, y0, x1, y1] = [p[0] * w, p[1] * h, p[2] * w, p[3] * h]
      const length = Math.hypot(x1 - x0, y1 - y0)
      const head = Math.min(length * 0.5, ARROW_HEAD * h)
      const angle = Math.atan2(y1 - y0, x1 - x0)
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.moveTo(x1 - head * Math.cos(angle - ARROW_SPREAD), y1 - head * Math.sin(angle - ARROW_SPREAD))
      ctx.lineTo(x1, y1)
      ctx.lineTo(x1 - head * Math.cos(angle + ARROW_SPREAD), y1 - head * Math.sin(angle + ARROW_SPREAD))
    }
  } else if (p.length === 2) {
    // A tap: a dot.
    ctx.moveTo(p[0] * w, p[1] * h)
    ctx.lineTo(p[0] * w + 0.01, p[1] * h)
  } else {
    // Smooth the pointer samples with midpoint quadratic curves.
    ctx.moveTo(p[0] * w, p[1] * h)
    for (let i = 2; i + 3 < p.length; i += 2) {
      const mx = ((p[i] + p[i + 2]) / 2) * w
      const my = ((p[i + 1] + p[i + 3]) / 2) * h
      ctx.quadraticCurveTo(p[i] * w, p[i + 1] * h, mx, my)
    }
    ctx.lineTo(p[p.length - 2] * w, p[p.length - 1] * h)
  }
  ctx.stroke()
  ctx.restore()
}

function drawLaser(ctx: CanvasRenderingContext2D, w: number, h: number, laser: InkLaser): void {
  const x = laser.x * w
  const y = laser.y * h
  const r = LASER_RADIUS * h
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
  glow.addColorStop(0, 'rgba(255, 40, 40, 0.55)')
  glow.addColorStop(1, 'rgba(255, 40, 40, 0)')
  ctx.save()
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, r * 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ff2a2a'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------- pointer input (any element over the slide) ----------

export interface InkInputOptions {
  /** Receives the pointer events; it must cover exactly the slide area. */
  element: HTMLElement
  settings: () => InkSettings
  scene: InkScene
  /** Called for every change: apply locally, redraw, and send it on. */
  onOp: (op: InkOp) => void
  /** Where the box for typing a text goes (an element of this page; the box is placed over the slide). Without it the text tool does nothing. */
  textHost?: HTMLElement
  /** Called when typing a text starts or ends: the page's own key handling must then leave the keys to the text. */
  onTyping?: (typing: boolean) => void
}

const ERASER_RADIUS = 0.015
/** The box shown while the zoom tool is dragged (never kept). */
const ZOOM_BOX_ID = 'zoom-box'
/** The box shown while a text box is dragged (never kept), and the smallest drag (slide heights) that counts as a box. */
const TEXT_BOX_ID = 'text-box'
const MIN_TEXT_BOX = 0.04
/** A box, an arrow or a straight line shorter than this (fraction of the slide height) is dropped: it was a click. */
const MIN_SHAPE = 0.006
let idSeq = 0

export function attachInkInput(opts: InkInputOptions): () => void {
  const { element, settings, scene, onOp } = opts
  // straight = a pen or highlighter stroke held with Shift: one line from where it started.
  let current: { id: string; tool: StrokeTool; start: [number, number]; end: [number, number]; straight: boolean } | null = null
  let erasing = false
  let zooming: { start: [number, number]; end: [number, number]; shown: boolean } | null = null
  // The text tool: a drag makes a box, a click a line; a click on a text edits it, a drag moves it.
  let textGesture:
    | { kind: 'create'; start: [number, number]; end: [number, number]; shown: boolean }
    | { kind: 'move'; id: string; start: [number, number]; origin: number[]; moved: boolean }
    | null = null
  let typing: { id: string; area: HTMLTextAreaElement; good: string; observer: ResizeObserver } | null = null
  let measure: Measure | null = null
  const measurer = (): Measure => (measure ??= canvasMeasure())

  const at = (e: PointerEvent): [number, number] => {
    const r = element.getBoundingClientRect()
    const clamp = (v: number): number => Math.min(1, Math.max(0, v))
    return [clamp((e.clientX - r.left) / Math.max(1, r.width)), clamp((e.clientY - r.top) / Math.max(1, r.height))]
  }
  const aspect = (): number => {
    const r = element.getBoundingClientRect()
    return r.width / Math.max(1, r.height)
  }
  const erase = (x: number, y: number): void => {
    const m = scene.strokes.some((s) => s.tool === 'text') ? measurer() : undefined
    const ids = scene.strokes.filter((s) => hitStroke(s, x, y, ERASER_RADIUS, aspect(), m)).map((s) => s.id)
    if (ids.length > 0) onOp({ t: 'erase', ids })
  }

  // ---------- text ----------

  const textStroke = (id: string): InkStroke | undefined => scene.strokes.find((s) => s.id === id && s.tool === 'text')
  const textAt = (x: number, y: number): InkStroke | undefined => {
    for (let i = scene.strokes.length - 1; i >= 0; i--) {
      const s = scene.strokes[i]
      if (s.tool === 'text' && hitText(s, x, y, 0.004, aspect(), measurer())) return s
    }
    return undefined
  }
  const newId = (): string => `${Date.now().toString(36)}-${(idSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  /** Puts the typing box over the text, with the font size the text has now. */
  const place = (): void => {
    if (!typing) return
    const s = textStroke(typing.id)
    if (!s) return
    const r = element.getBoundingClientRect()
    const H = Math.max(1, r.height)
    const { box, layout } = layoutStroke({ ...s, text: typing.area.value }, r.width / H, measurer())
    const st = typing.area.style
    st.left = `${r.left + box.x * r.width}px`
    st.top = `${r.top + box.y * H}px`
    const w = box.click ? Math.min(box.availW, layout.width + 0.05) : box.availW
    const h = box.click ? Math.max(layout.height, TEXT_CLICK_FONT * TEXT_LINE_HEIGHT) : box.availH
    st.width = `${Math.max(w, 0.06) * H}px`
    st.height = `${h * H}px`
    st.fontSize = `${layout.font * H}px`
    st.setProperty('-webkit-text-stroke', `${Math.max(1, layout.font * H * 0.1)}px ${textHalo(s.color)}`)
  }

  const finish = (): void => {
    const t = typing
    if (!t) return
    typing = null
    t.observer.disconnect()
    t.area.remove()
    scene.editing = null
    const s = textStroke(t.id)
    // Nothing typed: no empty mark is left behind. (A text on a page that was replaced is already kept by the page.)
    if (s) onOp((s.text ?? '').trim() === '' ? { t: 'erase', ids: [t.id] } : { t: 'text', id: t.id, text: s.text ?? '' })
    opts.onTyping?.(false)
  }
  scene.onReplace = finish

  /** Typing, only while it still fits (at the smallest size); an input method's composition is judged when it ends. */
  const accept = (): void => {
    const t = typing
    if (!t) return
    const s = textStroke(t.id)
    if (!s) {
      finish()
      return
    }
    let value = t.area.value
    const fits = (text: string): boolean => layoutStroke({ ...s, text }, aspect(), measurer()).layout.fits
    if (!fits(value)) {
      // Added at the end (typing, or a paste): keep the part that fits. Anywhere else: the letter is refused.
      let keep = t.good
      if (value.startsWith(t.good)) {
        let lo = t.good.length
        let hi = value.length
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          if (fits(value.slice(0, mid))) lo = mid
          else hi = mid - 1
        }
        keep = value.slice(0, lo)
      }
      value = keep
      t.area.value = keep
      t.area.setSelectionRange(keep.length, keep.length)
    }
    t.good = value
    onOp({ t: 'text', id: s.id, text: value })
    place()
  }

  const startTyping = (id: string): void => {
    const host = opts.textHost
    const s = textStroke(id)
    if (!host || !s) return
    finish()
    const area = document.createElement('textarea')
    area.value = s.text ?? ''
    area.spellcheck = false
    area.setAttribute('aria-label', 'Text')
    area.style.cssText = [
      'position:fixed', 'box-sizing:border-box', 'margin:0', 'padding:0', 'border:0', 'resize:none', 'overflow:hidden', 'white-space:pre-wrap', 'overflow-wrap:anywhere',
      `font-family:${TEXT_FONT_FAMILY}`, `font-weight:${TEXT_FONT_WEIGHT}`, `line-height:${TEXT_LINE_HEIGHT}`, `color:${s.color}`, 'background:rgba(0,113,227,0.10)', 'outline:2px dashed #0071e3', 'outline-offset:3px',
      'paint-order:stroke fill', 'caret-color:#0071e3', 'z-index:2147483647', 'pointer-events:auto'
    ].join(';')
    // Keys, clicks and wheel belong to the text, not to the page below.
    for (const type of ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel']) {
      area.addEventListener(type, (e) => {
        e.stopPropagation()
        if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') {
          e.preventDefault()
          finish()
        }
      })
    }
    area.addEventListener('input', (e) => {
      if (!(e as InputEvent).isComposing) accept()
      else place()
    })
    area.addEventListener('compositionend', accept)
    area.addEventListener('blur', finish)
    const observer = new ResizeObserver(place)
    observer.observe(element)
    typing = { id, area, good: area.value, observer }
    scene.editing = id
    host.appendChild(area)
    opts.onTyping?.(true)
    place()
    // Redraws this surface without the text (the box shows it) and tells the others the words.
    onOp({ t: 'text', id, text: area.value })
    window.setTimeout(() => {
      if (typing?.area !== area) return
      area.focus()
      area.setSelectionRange(area.value.length, area.value.length)
    }, 0)
  }

  const down = (e: PointerEvent): void => {
    const { tool, color } = settings()
    if (tool === 'pointer' || e.button !== 0) return
    e.preventDefault()
    element.setPointerCapture(e.pointerId)
    const [x, y] = at(e)
    if (tool === 'pen' || tool === 'highlighter' || tool === 'rect' || tool === 'arrow') {
      const id = `${Date.now().toString(36)}-${(idSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const twoPoints = tool === 'rect' || tool === 'arrow'
      current = { id, tool, start: [x, y], end: [x, y], straight: e.shiftKey && !twoPoints }
      onOp({ t: 'begin', stroke: { id, tool, color, points: twoPoints || current.straight ? [x, y, x, y] : [x, y] } })
    } else if (tool === 'eraser') {
      erasing = true
      erase(x, y)
    } else if (tool === 'laser') {
      onOp({ t: 'laser', x, y })
    } else if (tool === 'zoom') {
      zooming = { start: [x, y], end: [x, y], shown: false }
    } else if (tool === 'text') {
      if (!opts.textHost) return
      finish()
      const hit = textAt(x, y)
      textGesture = hit ? { kind: 'move', id: hit.id, start: [x, y], origin: [...hit.points], moved: false } : { kind: 'create', start: [x, y], end: [x, y], shown: false }
    }
  }

  const move = (e: PointerEvent): void => {
    const { tool } = settings()
    if (textGesture && tool === 'text') {
      const [x, y] = at(e)
      const g = textGesture
      if (g.kind === 'create') {
        g.end = [x, y]
        const a = aspect()
        if (Math.abs(x - g.start[0]) * a >= MIN_TEXT_BOX && Math.abs(y - g.start[1]) >= MIN_TEXT_BOX) {
          const points = [...g.start, x, y]
          if (!g.shown) onOp({ t: 'begin', stroke: { id: TEXT_BOX_ID, tool: 'rect', color: '#0071e3', points } })
          else onOp({ t: 'rect', id: TEXT_BOX_ID, points })
          g.shown = true
        }
        return
      }
      const s = textStroke(g.id)
      if (!s) return
      let dx = x - g.start[0]
      let dy = y - g.start[1]
      if (!g.moved && Math.hypot(dx * aspect(), dy) < 0.006) return
      g.moved = true
      // The text stays on the slide.
      const [bx0, by0, bx1, by1] = textBounds({ ...s, points: g.origin }, aspect(), measurer())
      dx = Math.min(Math.max(dx, -bx0), 1 - bx1)
      dy = Math.min(Math.max(dy, -by0), 1 - by1)
      onOp({ t: 'rect', id: g.id, points: g.origin.map((v, i) => v + (i % 2 === 0 ? dx : dy)) })
      return
    }
    if (zooming && tool === 'zoom') {
      zooming.end = at(e)
      const points = [...zooming.start, ...zooming.end]
      if (!zooming.shown) onOp({ t: 'begin', stroke: { id: ZOOM_BOX_ID, tool: 'rect', color: '#0071e3', points } })
      else onOp({ t: 'rect', id: ZOOM_BOX_ID, points })
      zooming.shown = true
      return
    }
    if (tool === 'laser') {
      const [x, y] = at(e)
      onOp({ t: 'laser', x, y })
      return
    }
    if (erasing && tool === 'eraser') {
      const [x, y] = at(e)
      erase(x, y)
      return
    }
    if (!current) return
    const [sx, sy] = current.start
    // Shift: a square box, an arrow in 45° steps, a straight pen or highlighter line (any angle).
    if (current.tool === 'rect' || current.tool === 'arrow') {
      const [x, y] = at(e)
      const fit = current.tool === 'rect' ? squareCorner : snapLine
      current.end = e.shiftKey ? fit(sx, sy, x, y, aspect()) : [x, y]
      onOp({ t: 'rect', id: current.id, points: [sx, sy, ...current.end] })
      return
    }
    if (e.shiftKey && !current.straight) current.straight = true
    if (current.straight) {
      current.end = at(e)
      onOp({ t: 'rect', id: current.id, points: [sx, sy, ...current.end] })
      return
    }
    // Coalesced events keep fast strokes smooth.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const points = (events.length > 0 ? events : [e]).flatMap((ev) => at(ev))
    onOp({ t: 'extend', id: current.id, points })
  }

  const up = (): void => {
    const g = textGesture
    textGesture = null
    if (g) {
      if (g.kind === 'move') {
        // A click on a text (it did not move): edit it.
        if (!g.moved) startTyping(g.id)
        return
      }
      if (g.shown) onOp({ t: 'erase', ids: [TEXT_BOX_ID] })
      const a = aspect()
      const [x0, y0, x1, y1] = [Math.min(g.start[0], g.end[0]), Math.min(g.start[1], g.end[1]), Math.max(g.start[0], g.end[0]), Math.max(g.start[1], g.end[1])]
      const box = (x1 - x0) * a >= MIN_TEXT_BOX && y1 - y0 >= MIN_TEXT_BOX
      const points = box ? [x0, y0, x1, y1] : [Math.min(g.start[0], 1 - TEXT_CLICK_ROOM.width / a), Math.min(g.start[1], 1 - TEXT_CLICK_ROOM.height)]
      const id = newId()
      onOp({ t: 'begin', stroke: { id, tool: 'text', color: settings().color, points, text: '' } })
      startTyping(id)
      return
    }
    const z = zooming
    zooming = null
    if (z) {
      if (z.shown) onOp({ t: 'erase', ids: [ZOOM_BOX_ID] })
      const a = aspect()
      const big = Math.abs(z.end[0] - z.start[0]) * a >= MIN_ZOOM_BOX && Math.abs(z.end[1] - z.start[1]) >= MIN_ZOOM_BOX
      // A box: enlarge it. A click: show the whole slide again.
      if (big) onOp({ t: 'zoom', rect: [Math.min(z.start[0], z.end[0]), Math.min(z.start[1], z.end[1]), Math.max(z.start[0], z.end[0]), Math.max(z.start[1], z.end[1])] })
      else if (scene.zoom) onOp({ t: 'zoom', rect: null })
      return
    }
    // A click with the box, arrow or straight-line tool leaves nothing behind (an empty mark would make Undo look broken).
    const c = current
    if (c && (c.tool === 'rect' || c.tool === 'arrow' || c.straight)) {
      const a = aspect()
      if (Math.hypot((c.end[0] - c.start[0]) * a, c.end[1] - c.start[1]) < MIN_SHAPE) onOp({ t: 'erase', ids: [c.id] })
    }
    current = null
    erasing = false
  }

  const leave = (): void => {
    if (settings().tool === 'laser') onOp({ t: 'laser-off' })
  }

  element.addEventListener('pointerdown', down)
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerup', up)
  element.addEventListener('pointercancel', up)
  element.addEventListener('pointerleave', leave)
  return () => {
    finish()
    scene.onReplace = null
    element.removeEventListener('pointerdown', down)
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerup', up)
    element.removeEventListener('pointercancel', up)
    element.removeEventListener('pointerleave', leave)
  }
}
