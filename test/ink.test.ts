import { describe, expect, it } from 'vitest'
import { hitStroke, InkScene, type InkStroke } from '../src/shared/ink'

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
