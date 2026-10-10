import { describe, expect, it } from 'vitest'
import { clampIndex, planMove, stepFirst, type NavOutput } from '../src/shared/nav'

const outs = (...o: Array<Partial<NavOutput> & { id: string }>): NavOutput[] =>
  o.map((x) => ({ index: 0, total: 10, linked: true, ...x }))

describe('clampIndex', () => {
  it('keeps the index inside the deck', () => {
    expect(clampIndex(-3, 10)).toBe(0)
    expect(clampIndex(12, 10)).toBe(9)
    expect(clampIndex(4, 10)).toBe(4)
  })
  it('has no upper bound when the total is unknown', () => {
    expect(clampIndex(40, null)).toBe(40)
    expect(clampIndex(-1, null)).toBe(0)
  })
})

describe('planMove', () => {
  it('moves every linked screen when the selected screen is linked', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3 }, { id: 'extra', linked: false })
    expect([...planMove(o, 'projector', { type: 'step', delta: 1 })]).toEqual([['projector', 3], ['next', 4]])
  })
  it('moves only the selected screen when it is not linked', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3, linked: false })
    expect([...planMove(o, 'next', { type: 'step', delta: 1 })]).toEqual([['next', 4]])
  })
  it('leaves linked screens alone when an unlinked screen is selected', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3 }, { id: 'extra', index: 5, linked: false })
    expect([...planMove(o, 'extra', { type: 'step', delta: -1 })]).toEqual([['extra', 4]])
  })
  it('blocks a step past the last page of the selected deck', () => {
    const o = outs({ id: 'projector', index: 9 }, { id: 'next', index: 10 })
    expect(planMove(o, 'projector', { type: 'step', delta: 1 }).size).toBe(0)
  })
  it('blocks a step before the first page', () => {
    const o = outs({ id: 'projector', index: 0 }, { id: 'next', index: 1 })
    expect(planMove(o, 'projector', { type: 'step', delta: -1 }).size).toBe(0)
  })
  it('keeps the offset of a linked screen that runs past its deck end', () => {
    const o = outs({ id: 'projector', index: 8 }, { id: 'next', index: 9 })
    expect([...planMove(o, 'projector', { type: 'step', delta: 1 })]).toEqual([['projector', 9], ['next', 10]])
  })
  it('goto clamps the target and moves the group by the same delta', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3 })
    expect([...planMove(o, 'projector', { type: 'goto', index: 20 })]).toEqual([['projector', 9], ['next', 10]])
  })
  it('first and last use the selected deck range', () => {
    const o = outs({ id: 'projector', index: 4 }, { id: 'next', index: 5 })
    expect([...planMove(o, 'projector', { type: 'first' })]).toEqual([['projector', 0], ['next', 1]])
    expect([...planMove(o, 'projector', { type: 'last' })]).toEqual([['projector', 9], ['next', 10]])
  })
  it('allows steps without limit when the total is unknown', () => {
    const o = outs({ id: 'projector', index: 50, total: null })
    expect([...planMove(o, 'projector', { type: 'step', delta: 1 })]).toEqual([['projector', 51]])
    expect(planMove(o, 'projector', { type: 'last' }).size).toBe(0)
  })
  it('returns nothing for an unknown selected screen', () => {
    expect(planMove(outs({ id: 'projector' }), 'nope', { type: 'step', delta: 1 }).size).toBe(0)
  })
})

describe('click steps before the page turn', () => {
  const next = { type: 'step', delta: 1 } as const
  const back = { type: 'step', delta: -1 } as const

  it('plays the next step while steps are left, then turns the page', () => {
    expect(stepFirst(next, { count: 3, done: 0 })).toBe(1)
    expect(stepFirst(next, { count: 3, done: 2 })).toBe(1)
    expect(stepFirst(next, { count: 3, done: 3 })).toBeNull()
  })

  it('takes the last step back while one has played, then turns back', () => {
    expect(stepFirst(back, { count: 3, done: 2 })).toBe(-1)
    expect(stepFirst(back, { count: 3, done: 0 })).toBeNull()
  })

  it('leaves jumps and slides without steps to the page turn', () => {
    expect(stepFirst(next, null)).toBeNull()
    expect(stepFirst({ type: 'goto', index: 4 }, { count: 3, done: 0 })).toBeNull()
    expect(stepFirst({ type: 'first' }, { count: 3, done: 3 })).toBeNull()
    expect(stepFirst({ type: 'step', delta: 5 }, { count: 3, done: 0 })).toBeNull()
  })
})
