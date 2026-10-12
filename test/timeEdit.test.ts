import { describe, expect, it } from 'vitest'
import { timeParts, withPart } from '../src/shared/format'

describe('timeParts', () => {
  it('shows minutes that run on (mm:ss) unless hours are asked for', () => {
    expect(timeParts(754, false)).toEqual({ h: 0, m: 12, s: 34, hasHours: false })
    expect(timeParts(7384, false)).toEqual({ h: 0, m: 123, s: 4, hasHours: false })
    expect(timeParts(7384, true)).toEqual({ h: 2, m: 3, s: 4, hasHours: true })
    expect(timeParts(3599, true).hasHours).toBe(false)
  })
})

describe('withPart: only the typed part changes, the rest is what it is now', () => {
  it('replaces the minutes and keeps the seconds of this moment', () => {
    expect(withPart(12 * 60 + 34, false, 'm', 5, 180)).toBe(5 * 60 + 34)
    // The clock ran on while typing: the seconds are those of the commit.
    expect(withPart(12 * 60 + 31, false, 'm', 5, 180)).toBe(5 * 60 + 31)
  })

  it('replaces the seconds and keeps the minutes', () => {
    expect(withPart(12 * 60 + 34, false, 's', 0, 180)).toBe(12 * 60)
    expect(withPart(12 * 60 + 34, false, 's', 99, 180)).toBe(12 * 60 + 59)
  })

  it('stops minutes at the maximum, and at 59 once hours show', () => {
    expect(withPart(60, false, 'm', 999, 180)).toBe(180 * 60)
    expect(withPart(2 * 3600 + 5, true, 'm', 99, 599)).toBe(2 * 3600 + 59 * 60 + 5)
  })

  it('moves to h:mm:ss when hours are typed, and across 60 minutes when hours are allowed', () => {
    expect(withPart(30 * 60, true, 'h', 1, 599)).toBe(3600 + 30 * 60)
    expect(withPart(30 * 60, true, 'm', 90, 599)).toBe(90 * 60)
    expect(withPart(30 * 60, true, 'h', 99, 599)).toBe(9 * 3600 + 30 * 60)
  })
})
