/**
 * Text marks: a click gives one line of text (it wraps at the slide's edge); a dragged box gives
 * text that wraps inside the box and gets smaller when it would not fit (down to a smallest
 * size; below that the typing is refused). Everything is measured in units of the slide height,
 * so the projector, the console and a saved picture lay a text out the same way at any size.
 */
import type { InkStroke } from './ink'

/** Font sizes as a fraction of the slide height. */
export const TEXT_MAX_FONT = 0.09
export const TEXT_CLICK_FONT = 0.045
export const TEXT_MIN_FONT = 0.02
const LINE_HEIGHT = 1.25
/** A click keeps at least this much room (slide heights) to its right and below. */
export const TEXT_CLICK_ROOM = { width: 0.2, height: 0.08 }
/** Semi-bold reads better on a projector. */
export const TEXT_FONT_WEIGHT = 600
export const TEXT_FONT_FAMILY = '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif'

/** Width of a text at font size 1 (the same unit as the font size). */
export type Measure = (text: string) => number

export interface TextLayout {
  lines: string[]
  /** Font size and the size of the text block, in slide heights. */
  font: number
  width: number
  height: number
  /** False when the text does not fit even at the smallest size. */
  fits: boolean
}

/** Where a text starts and how much room it has (slide heights; x and y are fractions of the slide). */
export interface TextBox {
  x: number
  y: number
  availW: number
  availH: number
  maxFont: number
  /** A click, not a dragged box: the block is as small as its text. */
  click: boolean
}

/** A CJK character stands alone (a line may break after it); other text breaks at spaces. */
const TOKEN = /[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+|\s+/g

/** Greedy line breaking at font size `font`. A word wider than the room is broken by letters. */
export function wrapText(text: string, font: number, availW: number, measure: Measure): string[] {
  const out: string[] = []
  const width = (s: string): number => measure(s) * font
  for (const paragraph of text.split('\n')) {
    let line = ''
    const push = (): void => {
      out.push(line.replace(/\s+$/, ''))
      line = ''
    }
    for (const token of paragraph.match(TOKEN) ?? []) {
      if (/^\s+$/.test(token)) {
        if (line) line += token
        continue
      }
      if (width(line + token) <= availW || !line) {
        if (!line && width(token) > availW) {
          // One word wider than the room: break it by letters.
          for (const ch of token) {
            if (line && width(line + ch) > availW) push()
            line += ch
          }
        } else line += token
        continue
      }
      push()
      line = ''
      if (width(token) > availW) {
        for (const ch of token) {
          if (line && width(line + ch) > availW) push()
          line += ch
        }
      } else line = token
    }
    push()
  }
  return out.length > 0 ? out : ['']
}

/**
 * The largest font size (up to maxFont) at which the text, wrapped in availW, is not taller than
 * availH. When even TEXT_MIN_FONT is too big, `fits` is false and the layout is the smallest one.
 */
export function layoutText(text: string, availW: number, availH: number, maxFont: number, measure: Measure): TextLayout {
  const build = (font: number): TextLayout => {
    const lines = wrapText(text, font, availW, measure)
    const width = Math.max(...lines.map((l) => measure(l) * font))
    const height = lines.length * font * LINE_HEIGHT
    return { lines, font, width, height, fits: height <= availH + 1e-9 }
  }
  const top = build(maxFont)
  if (top.fits) return top
  const bottom = build(TEXT_MIN_FONT)
  if (!bottom.fits) return bottom
  let lo = TEXT_MIN_FONT
  let hi = maxFont
  let best = bottom
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    const trial = build(mid)
    if (trial.fits) {
      best = trial
      lo = mid
    } else hi = mid
  }
  return best
}

/** The room of a text stroke on a slide of the given shape (aspect = width / height). */
export function textBox(stroke: InkStroke, aspect: number): TextBox {
  const p = stroke.points
  if (p.length >= 4) {
    const x = Math.min(p[0], p[2])
    const y = Math.min(p[1], p[3])
    return { x, y, availW: Math.abs(p[2] - p[0]) * aspect, availH: Math.abs(p[3] - p[1]), maxFont: TEXT_MAX_FONT, click: false }
  }
  const x = p[0] ?? 0
  const y = p[1] ?? 0
  return { x, y, availW: Math.max(0.01, (1 - x) * aspect), availH: Math.max(0.01, 1 - y), maxFont: TEXT_CLICK_FONT, click: true }
}

export function layoutStroke(stroke: InkStroke, aspect: number, measure: Measure): { box: TextBox; layout: TextLayout } {
  const box = textBox(stroke, aspect)
  return { box, layout: layoutText(stroke.text ?? '', box.availW, box.availH, box.maxFont, measure) }
}

/** The area a text takes, as fractions of the slide: the whole box, or the text's own block for a click. */
export function textBounds(stroke: InkStroke, aspect: number, measure: Measure): [number, number, number, number] {
  const { box, layout } = layoutStroke(stroke, aspect, measure)
  if (!box.click) return [box.x, box.y, box.x + box.availW / aspect, box.y + box.availH]
  // An empty click text still has a small area, so it can be found and typed into.
  const w = Math.max(layout.width, TEXT_CLICK_FONT * 3)
  const h = Math.max(layout.height, TEXT_CLICK_FONT * LINE_HEIGHT)
  return [box.x, box.y, box.x + w / aspect, box.y + h]
}

/** True when (x, y) is on the text's area, `reach` (slide heights) beyond its edge counted. */
export function hitText(stroke: InkStroke, x: number, y: number, reach: number, aspect: number, measure: Measure): boolean {
  const [x0, y0, x1, y1] = textBounds(stroke, aspect, measure)
  const r = reach
  return x * aspect >= x0 * aspect - r && x * aspect <= x1 * aspect + r && y >= y0 - r && y <= y1 + r
}

// ---------- measuring and drawing on a canvas ----------

let shared: CanvasRenderingContext2D | null = null

/** A measurer on a canvas of this page (Electron); the text is measured large and scaled, so it does not depend on the size drawn. */
export function canvasMeasure(): Measure {
  const REF = 100
  if (!shared) shared = document.createElement('canvas').getContext('2d')
  const ctx = shared as CanvasRenderingContext2D
  const cache = new Map<string, number>()
  ctx.font = `${TEXT_FONT_WEIGHT} ${REF}px ${TEXT_FONT_FAMILY}`
  return (text) => {
    let w = cache.get(text)
    if (w === undefined) {
      ctx.font = `${TEXT_FONT_WEIGHT} ${REF}px ${TEXT_FONT_FAMILY}`
      w = ctx.measureText(text).width / REF
      if (cache.size > 2000) cache.clear()
      cache.set(text, w)
    }
    return w
  }
}

/** A pale text (white, yellow) gets a dark outline, any other colour a light one: it reads on a dark and on a light slide. */
export function textHalo(color: string): string {
  const c = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!c) return 'rgba(0, 0, 0, 0.55)'
  const n = parseInt(c, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.62 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.6)'
}

export function drawText(ctx: CanvasRenderingContext2D, w: number, h: number, stroke: InkStroke, measure: Measure): void {
  if (!stroke.text) return
  const { box, layout } = layoutStroke(stroke, w / Math.max(1, h), measure)
  const fontPx = layout.font * h
  ctx.save()
  ctx.font = `${TEXT_FONT_WEIGHT} ${fontPx}px ${TEXT_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, fontPx * 0.1)
  ctx.strokeStyle = textHalo(stroke.color)
  ctx.fillStyle = stroke.color
  const step = layout.font * LINE_HEIGHT * h
  const pad = (step - fontPx) / 2
  layout.lines.forEach((line, i) => {
    const x = box.x * w
    const y = box.y * h + i * step + pad
    if (line) {
      ctx.strokeText(line, x, y)
      ctx.fillText(line, x, y)
    }
  })
  ctx.restore()
}

/** Line height as a multiple of the font size (the editing box uses the same). */
export const TEXT_LINE_HEIGHT = LINE_HEIGHT
