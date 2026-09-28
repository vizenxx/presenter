import { describe, expect, it } from 'vitest'
import { parseNameList, pickWinner, rollPath, rollWeight, ROLL_MS } from '../src/shared/roller'

/** Deterministic random sequence for tests. */
const seq = (...values: number[]): (() => number) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('parseNameList', () => {
  it('reads "ID Name" lines, tabs and extra spaces included', () => {
    expect(parseNameList('1001 ANN LEE\n1002\tBO   CHEN\n\n')).toEqual([
      { id: '1001', name: 'ANN LEE' },
      { id: '1002', name: 'BO CHEN' }
    ])
  })
  it('keeps a whole line as the name when it has no ID', () => {
    expect(parseNameList('Cai Dorji\r\nDema Wangmo')).toEqual([
      { id: '', name: 'Cai Dorji' },
      { id: '', name: 'Dema Wangmo' }
    ])
  })
})

describe('rollWeight (same rule as Lucky Roller)', () => {
  it('gives everyone not yet picked the same chance', () => {
    expect(rollWeight(0, true)).toBe(1)
    expect(rollWeight(0, false)).toBe(1)
  })
  it('keeps picked people at a small chance when Super Lucky is on', () => {
    expect(rollWeight(1, true)).toBeCloseTo(0.05)
    expect(rollWeight(2, true)).toBeCloseTo(0.025)
  })
  it('removes picked people when Super Lucky is off', () => {
    expect(rollWeight(1, false)).toBe(0)
  })
})

describe('pickWinner', () => {
  it('walks the weights with the random number', () => {
    expect(pickWinner([0, 0, 0], true, seq(0))).toBe(0)
    expect(pickWinner([0, 0, 0], true, seq(0.99))).toBe(2)
  })
  it('skips picked people when Super Lucky is off', () => {
    expect(pickWinner([1, 0, 1], false, seq(0))).toBe(1)
  })
  it('returns null when nobody can be picked', () => {
    expect(pickWinner([1, 2], false, seq(0.5))).toBeNull()
    expect(pickWinner([], true, seq(0.5))).toBeNull()
  })
})

describe('rollPath', () => {
  it('ends on the winner, slows down, and fits the roll time', () => {
    const path = rollPath(18, 7, seq(0.1, 0.5, 0.9, 0.3, 0.7))
    expect(path[path.length - 1].index).toBe(7)
    for (let i = 1; i < path.length; i++) expect(path[i].at).toBeGreaterThan(path[i - 1].at)
    const first = path[1].at - path[0].at
    const last = path[path.length - 1].at - path[path.length - 2].at
    expect(last).toBeGreaterThan(first * 3)
    expect(path[path.length - 1].at).toBeLessThanOrEqual(ROLL_MS)
  })
  it('never highlights the same person twice in a row', () => {
    const path = rollPath(5, 2, seq(0))
    for (let i = 1; i < path.length; i++) expect(path[i].index).not.toBe(path[i - 1].index)
  })
  it('handles one person and an empty list', () => {
    expect(rollPath(1, 0)).toEqual([{ index: 0, at: 0 }])
    expect(rollPath(0, 0)).toEqual([])
  })
})
