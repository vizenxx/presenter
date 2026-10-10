import { describe, expect, it } from 'vitest'
import { hitStroke, InkScene, type InkStroke } from '../src/shared/ink'
import { hitText, layoutStroke, layoutText, TEXT_CLICK_FONT, TEXT_MAX_FONT, TEXT_MIN_FONT, textBounds, wrapText } from '../src/shared/inkText'

/** Every letter is half a font size wide. */
const mono = (s: string): number => s.length * 0.5
const ASPECT = 16 / 9

const text = (value: string, points: number[]): InkStroke => ({ id: 't1', tool: 'text', color: '#ef4444', points, text: value })

describe('wrapText', () => {
  it('breaks at spaces and keeps what fits on a line', () => {
    // 10 letters of room at font 0.1 = width 0.5 → 10 letters per line.
    expect(wrapText('hello big world', 0.1, 0.5, mono)).toEqual(['hello big', 'world'])
  })

  it('breaks a word wider than the room by letters', () => {
    expect(wrapText('abcdefghijkl', 0.1, 0.5, mono)).toEqual(['abcdefghij', 'kl'])
  })

  it('breaks Chinese text after any character', () => {
    expect(wrapText('一二三四五六七八九十一二', 0.1, 0.5, mono)).toEqual(['一二三四五六七八九十', '一二'])
  })

  it('keeps explicit new lines and empty text', () => {
    expect(wrapText('a\n\nb', 0.1, 0.5, mono)).toEqual(['a', '', 'b'])
    expect(wrapText('', 0.1, 0.5, mono)).toEqual([''])
  })
})

describe('layoutText', () => {
  it('uses the largest size for a little text', () => {
    const l = layoutText('Hi', 1.5, 0.5, TEXT_MAX_FONT, mono)
    expect(l.font).toBe(TEXT_MAX_FONT)
    expect(l.fits).toBe(true)
  })

  it('gets smaller until the text fits the box', () => {
    const l = layoutText('word '.repeat(40), 0.8, 0.3, TEXT_MAX_FONT, mono)
    expect(l.fits).toBe(true)
    expect(l.font).toBeLessThan(TEXT_MAX_FONT)
    expect(l.font).toBeGreaterThanOrEqual(TEXT_MIN_FONT)
    expect(l.height).toBeLessThanOrEqual(0.3 + 1e-9)
    // And it is the largest such size: a little bigger would not fit.
    const bigger = layoutText('word '.repeat(40), 0.8, 0.3, l.font * 1.05, mono)
    expect(bigger.font === l.font || !bigger.fits || bigger.font <= l.font * 1.05).toBe(true)
  })

  it('says when the text does not fit even at the smallest size', () => {
    const l = layoutText('word '.repeat(400), 0.8, 0.1, TEXT_MAX_FONT, mono)
    expect(l.fits).toBe(false)
    expect(l.font).toBe(TEXT_MIN_FONT)
  })
})

describe('text strokes', () => {
  it('a click has room to the slide edge and the click size; a box has its own size', () => {
    const click = layoutStroke(text('Hello', [0.2, 0.3]), ASPECT, mono)
    expect(click.box.click).toBe(true)
    expect(click.box.availW).toBeCloseTo((1 - 0.2) * ASPECT)
    expect(click.layout.font).toBe(TEXT_CLICK_FONT)
    const box = layoutStroke(text('Hello', [0.6, 0.7, 0.2, 0.2]), ASPECT, mono)
    expect(box.box.click).toBe(false)
    expect([box.box.x, box.box.y]).toEqual([0.2, 0.2])
    expect(box.box.availW).toBeCloseTo(0.4 * ASPECT)
    expect(box.box.availH).toBeCloseTo(0.5)
  })

  it('finds a text by its box, or by its own block when it is a click', () => {
    const box = text('x', [0.2, 0.2, 0.6, 0.5])
    expect(hitText(box, 0.4, 0.35, 0.004, ASPECT, mono)).toBe(true)
    expect(hitText(box, 0.7, 0.35, 0.004, ASPECT, mono)).toBe(false)
    const click = text('Hello', [0.1, 0.1])
    const [x0, y0, x1, y1] = textBounds(click, ASPECT, mono)
    expect(hitText(click, (x0 + x1) / 2, (y0 + y1) / 2, 0.004, ASPECT, mono)).toBe(true)
    expect(hitText(click, x1 + 0.2, y0, 0.004, ASPECT, mono)).toBe(false)
    // An empty click text can still be found (a small area).
    expect(hitText(text('', [0.1, 0.1]), 0.11, 0.12, 0.004, ASPECT, mono)).toBe(true)
  })

  it('the eraser finds a text (with a measurer) and ignores it without one', () => {
    const s = text('Hello', [0.1, 0.1])
    expect(hitStroke(s, 0.12, 0.12, 0.015, ASPECT, mono)).toBe(true)
    expect(hitStroke(s, 0.12, 0.12, 0.015, ASPECT)).toBe(false)
  })
})

describe('scene', () => {
  it('sets the words, moves the text with rect, and removes it with erase', () => {
    const scene = new InkScene()
    scene.apply({ t: 'begin', stroke: text('', [0.1, 0.1]) })
    scene.apply({ t: 'text', id: 't1', text: 'Hello' })
    scene.apply({ t: 'rect', id: 't1', points: [0.3, 0.4] })
    expect(scene.strokes[0]).toMatchObject({ text: 'Hello', points: [0.3, 0.4] })
    scene.apply({ t: 'undo' })
    expect(scene.strokes).toEqual([])
  })

  it('keeps the words of a snapshot and tells the editor that the marks were replaced', () => {
    const scene = new InkScene()
    let replaced = 0
    scene.onReplace = () => replaced++
    scene.replace([text('Kept', [0.1, 0.1])])
    expect(scene.strokes[0].text).toBe('Kept')
    expect(replaced).toBe(1)
  })
})
