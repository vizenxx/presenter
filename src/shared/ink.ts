/**
 * Marks on the projected slide (pen, highlighter, box, laser, eraser).
 * Coordinates are fractions of the slide area (0..1), so the projector and the
 * console draw the same picture at any size. Every surface keeps an InkScene and
 * applies the same small operations; nothing is sent as pixels.
 */

export type InkTool = 'pointer' | 'pen' | 'highlighter' | 'rect' | 'laser' | 'eraser'
export const INK_TOOLS: InkTool[] = ['pointer', 'pen', 'highlighter', 'rect', 'laser', 'eraser']
export type StrokeTool = 'pen' | 'highlighter' | 'rect'

/** red, yellow, green, blue, white, black */
export const INK_COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#111111']

export interface InkStroke {
  id: string
  tool: StrokeTool
  color: string
  /** Flat x,y pairs; a box has exactly two corners. */
  points: number[]
}

export interface InkLaser {
  x: number
  y: number
}

export type InkOp =
  | { t: 'begin'; stroke: InkStroke }
  | { t: 'extend'; id: string; points: number[] }
  | { t: 'rect'; id: string; points: number[] }
  | { t: 'erase'; ids: string[] }
  | { t: 'undo' }
  | { t: 'clear' }
  | { t: 'laser'; x: number; y: number }
  | { t: 'laser-off' }

export interface InkSettings {
  tool: InkTool
  color: string
}

/** Line width as a fraction of the slide height. */
export const STROKE_WIDTH: Record<StrokeTool, number> = { pen: 0.005, highlighter: 0.026, rect: 0.0045 }
const LASER_RADIUS = 0.009

export class InkScene {
  strokes: InkStroke[] = []
  laser: InkLaser | null = null

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
    }
  }

  private find(id: string): InkStroke | undefined {
    for (let i = this.strokes.length - 1; i >= 0; i--) if (this.strokes[i].id === id) return this.strokes[i]
    return undefined
  }
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
export function hitStroke(stroke: InkStroke, x: number, y: number, radius: number, aspect: number): boolean {
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
  for (const stroke of scene.strokes) drawStroke(ctx, width, height, stroke)
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
}

const ERASER_RADIUS = 0.015
let idSeq = 0

export function attachInkInput(opts: InkInputOptions): () => void {
  const { element, settings, scene, onOp } = opts
  let current: { id: string; tool: StrokeTool; start: [number, number] } | null = null
  let erasing = false

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
    const ids = scene.strokes.filter((s) => hitStroke(s, x, y, ERASER_RADIUS, aspect())).map((s) => s.id)
    if (ids.length > 0) onOp({ t: 'erase', ids })
  }

  const down = (e: PointerEvent): void => {
    const { tool, color } = settings()
    if (tool === 'pointer' || e.button !== 0) return
    e.preventDefault()
    element.setPointerCapture(e.pointerId)
    const [x, y] = at(e)
    if (tool === 'pen' || tool === 'highlighter' || tool === 'rect') {
      const id = `${Date.now().toString(36)}-${(idSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      current = { id, tool, start: [x, y] }
      onOp({ t: 'begin', stroke: { id, tool, color, points: tool === 'rect' ? [x, y, x, y] : [x, y] } })
    } else if (tool === 'eraser') {
      erasing = true
      erase(x, y)
    } else if (tool === 'laser') {
      onOp({ t: 'laser', x, y })
    }
  }

  const move = (e: PointerEvent): void => {
    const { tool } = settings()
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
    if (current.tool === 'rect') {
      const [x, y] = at(e)
      onOp({ t: 'rect', id: current.id, points: [current.start[0], current.start[1], x, y] })
      return
    }
    // Coalesced events keep fast strokes smooth.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const points = (events.length > 0 ? events : [e]).flatMap((ev) => at(ev))
    onOp({ t: 'extend', id: current.id, points })
  }

  const up = (): void => {
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
    element.removeEventListener('pointerdown', down)
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerup', up)
    element.removeEventListener('pointercancel', up)
    element.removeEventListener('pointerleave', leave)
  }
}
