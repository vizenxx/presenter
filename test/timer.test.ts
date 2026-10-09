import { describe, expect, it } from 'vitest'
import * as T from '../src/shared/timer'

describe('timer', () => {
  it('starts running with an end time', () => {
    expect(T.start(T.initialTimer(60), 90, 1000)).toMatchObject({ status: 'running', durationSec: 90, endAt: 91000, alarming: false })
  })
  it('counts down from the end time on tick', () => {
    expect(T.remainingSec(T.tick(T.start(T.initialTimer(), 10, 0), 3500))).toBe(7)
  })
  it('pauses and resumes without losing time', () => {
    let s = T.pause(T.start(T.initialTimer(), 10, 0), 4000)
    expect(s).toMatchObject({ status: 'paused', remainingMs: 6000, endAt: null })
    s = T.resume(s, 100000)
    expect(s.endAt).toBe(106000)
  })
  it('turns done and alarming at zero', () => {
    expect(T.tick(T.start(T.initialTimer(), 5, 0), 5000)).toMatchObject({ status: 'done', remainingMs: 0, alarming: true })
  })
  it('dismiss after done returns to idle with the same duration', () => {
    expect(T.dismiss(T.tick(T.start(T.initialTimer(), 5, 0), 6000))).toMatchObject({ status: 'idle', durationSec: 5, remainingMs: 5000, alarming: false })
  })
  it('toggle starts the default duration when idle', () => {
    expect(T.toggle(T.initialTimer(60), 0, 480)).toMatchObject({ status: 'running', durationSec: 480 })
  })
  it('toggle pauses a running timer and resumes a paused one', () => {
    let s = T.toggle(T.start(T.initialTimer(), 10, 0), 2000, 60)
    expect(s.status).toBe('paused')
    s = T.toggle(s, 5000, 60)
    expect(s).toMatchObject({ status: 'running', endAt: 13000 })
  })
  it('reset returns to idle with a new duration', () => {
    expect(T.reset(T.start(T.initialTimer(), 10, 0), 300)).toMatchObject({ status: 'idle', durationSec: 300, remainingMs: 300000 })
  })
  it('never starts with less than one second', () => {
    expect(T.start(T.initialTimer(), 0, 0).durationSec).toBe(1)
  })
  it('warns when one minute is left (the default), and once for each of the last five seconds', () => {
    const run = (sec: number) => ({ status: 'running' as const, remainingSec: sec })
    expect(T.timerCue(run(61), run(60))).toEqual({ kind: 'warning', beeps: 3 })
    expect(T.timerCue(run(62), run(59))).toEqual({ kind: 'warning', beeps: 3 })
    expect(T.timerCue(run(60), run(59))).toBeNull()
    expect(T.timerCue(run(6), run(5))).toEqual({ kind: 'last-seconds' })
    expect(T.timerCue(run(2), run(1))).toEqual({ kind: 'last-seconds' })
    expect(T.timerCue(run(7), run(6))).toBeNull()
    expect(T.timerCue(run(1), { status: 'done', remainingSec: 0 })).toBeNull()
  })
  it('rings each bell the teacher set, with its own number of beeps', () => {
    const run = (sec: number) => ({ status: 'running' as const, remainingSec: sec })
    const bells = [
      { sec: 300, beeps: 1 },
      { sec: 120, beeps: 2 },
      { sec: 30, beeps: 5 }
    ]
    expect(T.timerCue(run(301), run(300), bells)).toEqual({ kind: 'warning', beeps: 1 })
    expect(T.timerCue(run(121), run(120), bells)).toEqual({ kind: 'warning', beeps: 2 })
    expect(T.timerCue(run(31), run(30), bells)).toEqual({ kind: 'warning', beeps: 5 })
    expect(T.timerCue(run(61), run(60), bells)).toBeNull()
  })
  it('rings the bell nearest the end when one step passes several, and never at 0:00 or with no bells', () => {
    const run = (sec: number) => ({ status: 'running' as const, remainingSec: sec })
    expect(T.timerCue(run(130), run(100), [{ sec: 120, beeps: 2 }, { sec: 110, beeps: 4 }])).toEqual({ kind: 'warning', beeps: 4 })
    expect(T.timerCue(run(61), run(60), [])).toBeNull()
    expect(T.timerCue(run(2), run(1), [{ sec: 0, beeps: 3 }])).toEqual({ kind: 'last-seconds' })
    expect(T.timerCue(run(6), run(5), [])).toEqual({ kind: 'last-seconds' })
  })
  it('puts a sent list into range', () => {
    expect(T.cleanWarnings([{ sec: -5, beeps: 0 }, { sec: 99999, beeps: 20 }, null, 'x'])).toEqual([{ sec: T.MAX_WARN_SEC, beeps: T.MAX_BEEPS }, { sec: 0, beeps: 1 }])
    expect(T.cleanWarnings([{ sec: 30, beeps: 1 }, { sec: 300, beeps: 2 }, { sec: 120, beeps: 3 }]).map((w) => w.sec)).toEqual([300, 120, 30])
    expect(T.cleanWarnings(Array.from({ length: 8 }, () => ({ sec: 60, beeps: 3 })))).toHaveLength(T.MAX_WARNINGS)
    expect(T.cleanWarnings('nonsense')).toEqual(T.DEFAULT_WARNINGS)
    expect(T.cleanWarnings([])).toEqual([])
  })
  it('does not beep on a start, a resume, a reset or a pause', () => {
    const run = (sec: number) => ({ status: 'running' as const, remainingSec: sec })
    expect(T.timerCue(null, run(60))).toBeNull()
    expect(T.timerCue({ status: 'idle', remainingSec: 300 }, run(60))).toBeNull()
    expect(T.timerCue({ status: 'paused', remainingSec: 5 }, run(5))).toBeNull()
    expect(T.timerCue(run(5), { status: 'paused', remainingSec: 5 })).toBeNull()
    expect(T.timerCue(run(4), run(60))).toBeNull()
  })
})

describe('changing the time of a running timer', () => {
  it('adds and takes away time on a running class timer, keeping at least one second', () => {
    const running = T.start(T.initialTimer(), 300, 0)
    expect(T.adjust(running, 60, 10_000)).toMatchObject({ status: 'running', remainingMs: 350_000, endAt: 360_000, durationSec: 300 })
    expect(T.adjust(running, -120, 10_000)).toMatchObject({ remainingMs: 170_000, endAt: 180_000 })
    expect(T.adjust(running, -999, 10_000)).toMatchObject({ status: 'running', remainingMs: 1000, endAt: 11_000 })
  })
  it('changes a paused class timer, gives a finished one more time, and leaves one not started alone', () => {
    const paused = T.pause(T.start(T.initialTimer(), 300, 0), 100_000)
    expect(T.adjust(paused, 30, 500_000)).toMatchObject({ status: 'paused', remainingMs: 230_000, endAt: null })
    const done = T.tick(T.start(T.initialTimer(), 2, 0), 5000)
    expect(done.alarming).toBe(true)
    expect(T.adjust(done, 120, 6000)).toMatchObject({ status: 'running', alarming: false, remainingMs: 120_000, endAt: 126_000 })
    expect(T.adjust(done, -60, 6000)).toBe(done)
    const idle = T.initialTimer(300)
    expect(T.adjust(idle, 60, 0)).toBe(idle)
  })
  it('adds time to My timer: more left when counting down, more counted when counting up', () => {
    const down = { mode: 'down' as const, minutes: 45, startedAt: 0, heldMs: 0, periods: [], clockExtra: null }
    expect(T.adjustSpeaker(down, 60, 10_000).heldMs).toBe(-60_000)
    expect(T.adjustSpeaker(down, -60, 10_000).heldMs).toBe(60_000)
    const up = { mode: 'up' as const, minutes: 45, startedAt: null, heldMs: 30_000, periods: [], clockExtra: null }
    expect(T.adjustSpeaker(up, 60, 0).heldMs).toBe(90_000)
    expect(T.adjustSpeaker(up, -120, 0).heldMs).toBe(0)
    const upRunning = { mode: 'up' as const, minutes: 45, startedAt: 0, heldMs: 0, periods: [], clockExtra: null }
    expect(T.adjustSpeaker(upRunning, -120, 50_000).heldMs).toBe(-50_000)
  })
  it('leaves My timer alone before it starts', () => {
    const fresh = { mode: 'down' as const, minutes: 45, startedAt: null, heldMs: 0, periods: [], clockExtra: null }
    expect(T.adjustSpeaker(fresh, 60, 0)).toBe(fresh)
    expect(T.speakerStarted(fresh)).toBe(false)
    expect(T.speakerStarted({ ...fresh, heldMs: -60_000 })).toBe(true)
  })
})

describe('My timer From–to: class periods by weekday', () => {
  // 2026-10-09 is a Friday (day 5); 2026-10-10 a Saturday.
  const at = (h: number, m: number, sec = 0, date = 9): number => new Date(2026, 9, date, h, m, sec).getTime()
  const periods = [
    { days: [1, 3, 5], fromSec: 9 * 3600, untilSec: 10 * 3600 + 50 * 60 },
    { days: [5], fromSec: 14 * 3600, untilSec: 16 * 3600 }
  ]
  const s = { mode: 'clock' as const, minutes: 45, startedAt: null, heldMs: 0, periods, clockExtra: null }
  it('waits before a period, counts down during it, and shows Over time for 30 minutes after it', () => {
    expect(T.clockNow(s, at(8, 59, 30)).phase).toBe('before')
    expect(T.speakerSeconds(s, at(8, 59, 30))).toBe(110 * 60)
    expect(T.clockNow(s, at(10, 0)).phase).toBe('during')
    expect(T.speakerSeconds(s, at(10, 0))).toBe(50 * 60)
    expect(T.clockNow(s, at(10, 52)).phase).toBe('after')
    expect(T.speakerSeconds(s, at(10, 52))).toBe(-120)
  })
  it('goes on to the next period of the day, then has nothing left', () => {
    expect(T.clockNow(s, at(11, 30))).toMatchObject({ phase: 'before', period: periods[1] })
    expect(T.speakerSeconds(s, at(15, 0))).toBe(3600)
    expect(T.clockNow(s, at(17, 0)).phase).toBe('none')
    expect(T.speakerSeconds(s, at(17, 0))).toBe(0)
  })
  it('uses only the periods of the weekday', () => {
    expect(T.clockNow(s, at(10, 0, 0, 10)).phase).toBe('none')
    expect(T.clockNow(s, at(15, 0, 0, 7)).phase).toBe('none')
    expect(T.clockNow(s, at(10, 0, 0, 7)).phase).toBe('during')
  })
  it('changes only today\'s end with ±', () => {
    const later = T.adjustSpeaker(s, 600, at(10, 0))
    expect(later.periods).toEqual(periods)
    expect(T.speakerSeconds(later, at(10, 0))).toBe(60 * 60)
    expect(T.speakerSeconds(later, at(10, 0, 0, 12))).toBe(50 * 60)
    expect(T.speakerSeconds(T.adjustSpeaker(s, -7 * 3600, at(10, 0)), at(9, 0, 30))).toBe(30)
  })
  it('keeps periods in range and in order of start time', () => {
    expect(T.cleanPeriods([{ days: [5, 5, 9, 1], fromSec: 14 * 3600 + 20, untilSec: 13 * 3600 }, { days: [2], fromSec: 9 * 3600, untilSec: 10 * 3600 }])).toEqual([
      { days: [2], fromSec: 9 * 3600, untilSec: 10 * 3600 },
      { days: [1, 5], fromSec: 14 * 3600, untilSec: 14 * 3600 + 60 }
    ])
    expect(T.cleanPeriods(Array.from({ length: 9 }, () => ({ days: [1], fromSec: 0, untilSec: 60 })))).toHaveLength(T.MAX_PERIODS)
  })
  it('writes 12-hour times with AM and PM', () => {
    expect(T.time12(0)).toBe('12:00 AM')
    expect(T.time12(9 * 3600 + 5 * 60)).toBe('9:05 AM')
    expect(T.time12(12 * 3600)).toBe('12:00 PM')
    expect(T.time12(14 * 3600 + 30 * 60)).toBe('2:30 PM')
    expect(T.range12(9 * 3600, 10 * 3600 + 50 * 60)).toBe('9:00–10:50 AM')
    expect(T.range12(11 * 3600 + 30 * 60, 13 * 3600)).toBe('11:30 AM–1:00 PM')
    expect(T.from12(12, 0, false)).toBe(0)
    expect(T.from12(12, 15, true)).toBe(12 * 3600 + 15 * 60)
    expect(T.from12(2, 30, true)).toBe(14 * 3600 + 30 * 60)
  })
})
