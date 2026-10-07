import { describe, expect, it } from 'vitest'
import { hitStroke, inkKeyAction, InkScene, snapLine, squareCorner, type InkStroke } from '../src/shared/ink'

const pen = (id: string, points: number[]): InkStroke => ({ id, tool: 'pen', color: '#ef4444', points })

describe('InkScene', () => {
  it('builds a stroke from begin and extend', () => {
    const scene = new InkScene()
    scene.apply({ t: 'begin', stroke: pen('a', [0.1, 0.1]) })
    scene.apply({ t: 'extend', id: 'a', points: [0.2, 0.2, 0.3, 0.3] })
    expect(scene.strokes).toEqual([pen('a', [0.1, 0.1, 0.2, 0.2, 0.3, 0.3])])
  })
  it('does not share the point array with the sender', () => {
    const scene = new InkScene()
    const stroke = pen('a', [0.1, 0.1])
    scene.apply({ t: 'begin', stroke })
    scene.apply({ t: 'extend', id: 'a', points: [0.5, 0.5] })
    expect(stroke.points).toEqual([0.1, 0.1])
  })
  it('moves the free corner of a box', () => {
    const scene = new InkScene()
    scene.apply({ t: 'begin', stroke: { id: 'b', tool: 'rect', color: '#fff', points: [0.1, 0.1, 0.1, 0.1] } })
    scene.apply({ t: 'rect', id: 'b', points: [0.1, 0.1, 0.6, 0.4] })
    expect(scene.strokes[0].points).toEqual([0.1, 0.1, 0.6, 0.4])
  })
  it('erases, undoes the last stroke, and clears', () => {
    const scene = new InkScene()
    scene.apply({ t: 'begin', stroke: pen('a', [0, 0]) })
    scene.apply({ t: 'begin', stroke: pen('b', [0, 0]) })
    scene.apply({ t: 'begin', stroke: pen('c', [0, 0]) })
    scene.apply({ t: 'erase', ids: ['b'] })
    expect(scene.strokes.map((s) => s.id)).toEqual(['a', 'c'])
    scene.apply({ t: 'undo' })
    expect(scene.strokes.map((s) => s.id)).toEqual(['a'])
    scene.apply({ t: 'laser', x: 0.5, y: 0.5 })
    scene.apply({ t: 'clear' })
    expect(scene.strokes).toEqual([])
    expect(scene.laser).toBeNull()
  })
  it('shows and hides the laser dot', () => {
    const scene = new InkScene()
    scene.apply({ t: 'laser', x: 0.2, y: 0.8 })
    expect(scene.laser).toEqual({ x: 0.2, y: 0.8 })
    scene.apply({ t: 'laser-off' })
    expect(scene.laser).toBeNull()
  })
  it('ignores extends for unknown strokes', () => {
    const scene = new InkScene()
    scene.apply({ t: 'extend', id: 'nope', points: [0.1, 0.1] })
    expect(scene.strokes).toEqual([])
  })
})

describe('hitStroke (eraser)', () => {
  it('hits a pen line near its path and misses far away', () => {
    const line = pen('a', [0.1, 0.5, 0.9, 0.5])
    expect(hitStroke(line, 0.5, 0.51, 0.02, 16 / 9)).toBe(true)
    expect(hitStroke(line, 0.5, 0.7, 0.02, 16 / 9)).toBe(false)
  })
  it('hits a single dot', () => {
    expect(hitStroke(pen('a', [0.3, 0.3]), 0.305, 0.3, 0.02, 1)).toBe(true)
  })
  it('hits a box on its edge, not in its empty middle', () => {
    const box: InkStroke = { id: 'b', tool: 'rect', color: '#fff', points: [0.2, 0.2, 0.8, 0.8] }
    expect(hitStroke(box, 0.2, 0.5, 0.02, 1)).toBe(true)
    expect(hitStroke(box, 0.5, 0.5, 0.02, 1)).toBe(false)
  })
})

describe('Shift shapes', () => {
  const near = (a: number[], b: number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))
  it('makes a box square on the real slide shape', () => {
    // 16:9 slide: 0.1 of the height is 0.1 / (16/9) of the width.
    near(squareCorner(0.5, 0.5, 0.6, 0.7, 16 / 9), [0.5 + 0.2 / (16 / 9), 0.7])
    // Dragged far left: the square grows with the longer side until it meets the top edge.
    near(squareCorner(0.5, 0.5, 0.2, 0.45, 16 / 9), [0.5 - 0.5 / (16 / 9), 0])
  })
  it('keeps a square box on the slide', () => {
    const [x, y] = squareCorner(0.9, 0.5, 1, 1, 1)
    expect(x).toBeLessThanOrEqual(1)
    near([x, y], [1, 0.6])
  })
  it('turns an arrow to the nearest 45° step and keeps it on the slide', () => {
    // The arrow keeps the dragged length and only turns.
    near(snapLine(0.5, 0.5, 0.8, 0.52, 1), [0.5 + Math.hypot(0.3, 0.02), 0.5])
    const diagonal = Math.hypot(0.21, 0.19) * Math.SQRT1_2
    near(snapLine(0.5, 0.5, 0.71, 0.69, 1), [0.5 + diagonal, 0.5 + diagonal])
    const [x, y] = snapLine(0.9, 0.5, 1.4, 0.5, 1)
    near([x, y], [1, 0.5])
  })
  it('lets the eraser find an arrow along its shaft', () => {
    const arrow: InkStroke = { id: 'a', tool: 'arrow', color: '#fff', points: [0.1, 0.1, 0.9, 0.1] }
    expect(hitStroke(arrow, 0.5, 0.105, 0.01, 1)).toBe(true)
    expect(hitStroke(arrow, 0.5, 0.3, 0.01, 1)).toBe(false)
  })
})

describe('marking keys', () => {
  it('undoes with Ctrl+Z or ⌘Z', () => {
    expect(inkKeyAction('z', { control: true }, false, 'pen')).toEqual({ type: 'undo' })
    expect(inkKeyAction('Z', { meta: true }, true, 'pointer')).toEqual({ type: 'undo' })
  })
  it('leaves a drawing tool with Esc, and does nothing with Esc on the pointer', () => {
    expect(inkKeyAction('Escape', {}, false, 'arrow')).toEqual({ type: 'pointer' })
    expect(inkKeyAction('Escape', {}, false, 'pointer')).toBeNull()
  })
  it('picks a tool by letter, and the pointer when the letter is pressed again', () => {
    expect(inkKeyAction('a', {}, false, 'pointer')).toEqual({ type: 'tool', tool: 'arrow' })
    expect(inkKeyAction('p', {}, false, 'pen')).toEqual({ type: 'pointer' })
    expect(inkKeyAction('p', { control: true }, false, 'pointer')).toBeNull()
  })
  it('clears with Delete, and with the Mac delete key', () => {
    expect(inkKeyAction('Delete', {}, false, 'pen')).toEqual({ type: 'clear' })
    expect(inkKeyAction('Backspace', {}, true, 'pen')).toEqual({ type: 'clear' })
    expect(inkKeyAction('Backspace', {}, false, 'pen')).toBeNull()
  })
})
