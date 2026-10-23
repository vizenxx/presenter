import { describe, expect, it } from 'vitest'
import { addLeaf, computeRects, contains, dividers, evenOut, leaves, MIN_SHARE, preset, ratioAt, removeLeaf, setRatio, swapLeaves, type TileNode } from '../src/shared/tiles'

const R = { x: 0, y: 0, width: 1920, height: 1080 }

describe('addLeaf (automatic tiling)', () => {
  it('the first content fills the room', () => {
    expect(addLeaf(null, 'a', R, 6)).toEqual({ id: 'a' })
  })
  it('a wide room is split side by side, the new content on the right', () => {
    const t = addLeaf({ id: 'a' }, 'b', R, 6)
    expect(t).toEqual({ dir: 'row', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } })
  })
  it('the largest content is split again, along its longer side', () => {
    let t = addLeaf({ id: 'a' }, 'b', R, 6)
    t = addLeaf(t, 'c', R, 6) // a and b are equal; the last largest (b) splits: 957 x 1080 is taller than wide
    expect(leaves(t)).toEqual(['a', 'b', 'c'])
    const rects = computeRects(t, R, 6)
    expect(rects.get('b')!.height).toBeLessThan(600)
    expect(rects.get('c')!.height).toBeLessThan(600)
    expect(rects.get('a')!.height).toBe(1080)
  })
  it('a content that is already there is not added twice', () => {
    const t = addLeaf({ id: 'a' }, 'b', R, 6)
    expect(addLeaf(t, 'b', R, 6)).toBe(t)
  })
})

describe('computeRects', () => {
  it('keeps the gap between neighbours and uses the whole room', () => {
    const t: TileNode = { dir: 'row', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } }
    const m = computeRects(t, R, 6)
    const a = m.get('a')!
    const b = m.get('b')!
    expect(a.x).toBe(0)
    expect(b.x - (a.x + a.width)).toBe(6)
    expect(b.x + b.width).toBe(1920)
    expect(a.height).toBe(1080)
  })
  it('a column split stacks the parts', () => {
    const m = computeRects({ dir: 'col', ratio: 0.25, a: { id: 'a' }, b: { id: 'b' } }, R, 0)
    expect(m.get('a')!.height).toBe(270)
    expect(m.get('b')!.y).toBe(270)
    expect(m.get('b')!.height).toBe(810)
  })
})

describe('removeLeaf', () => {
  it('the neighbour takes the room', () => {
    const t = addLeaf({ id: 'a' }, 'b', R, 6)
    expect(removeLeaf(t, 'a')).toEqual({ id: 'b' })
    expect(removeLeaf(t, 'b')).toEqual({ id: 'a' })
  })
  it('nothing is left after the last one', () => {
    expect(removeLeaf({ id: 'a' }, 'a')).toBeNull()
  })
  it('a deeper tree keeps the other parts', () => {
    const t = preset(['a', 'b', 'c'], 'side') as TileNode
    expect(leaves(removeLeaf(t, 'b'))).toEqual(['a', 'c'])
  })
})

describe('dividers and ratios', () => {
  const t = preset(['a', 'b', 'c'], 'main') as TileNode
  it('there is one divider for each split, with the way to it', () => {
    const d = dividers(t, R, 8)
    expect(d).toHaveLength(2)
    expect(d[0].path).toEqual([])
    expect(d[1].path).toEqual(['b'])
    expect(d[0].dir).toBe('row')
    expect(d[1].dir).toBe('col')
  })
  it('a pointer position becomes the ratio of its divider, kept away from the edges', () => {
    const d = dividers(t, R, 8)[0]
    expect(ratioAt(d, 960 + 4, 500, 8)).toBeCloseTo(0.5, 2)
    expect(ratioAt(d, 0, 0, 8)).toBe(MIN_SHARE)
    expect(ratioAt(d, 5000, 0, 8)).toBe(1 - MIN_SHARE)
  })
  it('setRatio changes only the split it names', () => {
    const next = setRatio(t, ['b'], 0.3) as Extract<TileNode, { dir: string }>
    expect(next.ratio).toBe(0.6)
    expect((next.b as Extract<TileNode, { dir: string }>).ratio).toBe(0.3)
  })
  it('evenOut gives every content the same room', () => {
    const odd = setRatio(preset(['a', 'b', 'c'], 'side') as TileNode, [], 0.9)
    const m = computeRects(evenOut(odd), R, 0)
    const widths = [...m.values()].map((r) => r.width)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2)
  })
})

describe('preset', () => {
  const ids = ['a', 'b', 'c', 'd']
  it('every arrangement holds every content once', () => {
    for (const kind of ['side', 'stack', 'grid', 'main'] as const) expect(leaves(preset(ids, kind)).sort()).toEqual(ids)
  })
  it('side by side gives equal widths; a grid of four is two by two', () => {
    const side = computeRects(preset(ids, 'side') as TileNode, R, 0)
    expect([...side.values()].every((r) => Math.abs(r.width - 480) <= 1 && r.height === 1080)).toBe(true)
    const grid = computeRects(preset(ids, 'grid') as TileNode, R, 0)
    expect([...grid.values()].every((r) => Math.abs(r.width - 960) <= 1 && Math.abs(r.height - 540) <= 1)).toBe(true)
  })
  it('main puts the first content on the left, larger than the rest', () => {
    const m = computeRects(preset(['a', 'b', 'c'], 'main') as TileNode, R, 0)
    expect(m.get('a')!.width).toBeGreaterThan(m.get('b')!.width)
    expect(m.get('a')!.height).toBe(1080)
  })
  it('one content is just a leaf; none is nothing', () => {
    expect(preset(['a'], 'grid')).toEqual({ id: 'a' })
    expect(preset([], 'grid')).toBeNull()
  })
})

describe('swapLeaves', () => {
  it('two contents trade places', () => {
    const t = preset(['a', 'b', 'c'], 'side') as TileNode
    expect(leaves(swapLeaves(t, 'a', 'c'))).toEqual(['c', 'b', 'a'])
    expect(contains(swapLeaves(t, 'a', 'c'), 'a')).toBe(true)
  })
})
