import { describe, expect, it } from 'vitest'
import { pickDisplayIds } from '../src/shared/displays'
import { clock, mmss } from '../src/shared/format'
import { mergeRecent } from '../src/shared/recentList'

describe('mmss', () => {
  it('formats minutes and seconds', () => {
    expect(mmss(0)).toBe('00:00')
    expect(mmss(65)).toBe('01:05')
    expect(mmss(754)).toBe('12:34')
    expect(mmss(-4)).toBe('00:00')
  })
})

describe('mergeRecent', () => {
  it('puts the newest deck first without duplicates', () => {
    const a = { path: 'C:/a.html', name: 'a' }
    const b = { path: 'C:/b.html', name: 'b' }
    expect(mergeRecent([a, b], { path: 'c:/B.html', name: 'b' }).map((d) => d.name)).toEqual(['b', 'a'])
  })
  it('keeps at most ten decks', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ path: `C:/${i}.html`, name: `${i}` }))
    expect(mergeRecent(many, { path: 'C:/new.html', name: 'new' })).toHaveLength(10)
  })
})

describe('pickDisplayIds', () => {
  it('uses one display for everything when only one exists', () => {
    expect(pickDisplayIds([{ id: 1 }], 1)).toEqual({ consoleId: 1, projectorId: null })
  })
  it('puts the console on the internal laptop display', () => {
    expect(pickDisplayIds([{ id: 7, internal: false }, { id: 3, internal: true }], 7)).toEqual({ consoleId: 3, projectorId: 7 })
  })
  it('falls back to the primary display for the console', () => {
    expect(pickDisplayIds([{ id: 1 }, { id: 2 }], 1)).toEqual({ consoleId: 1, projectorId: 2 })
  })
})

describe('clock (speaker timer)', () => {
  it('shows minutes and seconds, hours when needed, and a minus sign when over time', () => {
    expect(clock(307)).toBe('05:07')
    expect(clock(3723)).toBe('1:02:03')
    expect(clock(-42.5)).toBe('−00:42')
    expect(clock(0)).toBe('00:00')
  })
})

describe('speakerSeconds (my timer)', () => {
  it('counts up, counts down, and goes below zero when over time', async () => {
    const { speakerSeconds } = await import('../src/renderer/src/console/SpeakerTimer')
    const t0 = 1_000_000
    expect(speakerSeconds({ mode: 'up', minutes: 10, startedAt: t0, heldMs: 5000 }, t0 + 60_000)).toBe(65)
    expect(speakerSeconds({ mode: 'down', minutes: 1, startedAt: null, heldMs: 30_000 }, t0)).toBe(30)
    expect(speakerSeconds({ mode: 'down', minutes: 1, startedAt: t0, heldMs: 0 }, t0 + 90_000)).toBe(-30)
  })
})
