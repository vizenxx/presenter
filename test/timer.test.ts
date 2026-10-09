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
    const down = { mode: 'down' as const, minutes: 45, startedAt: 0, heldMs: 0 }
    expect(T.adjustSpeaker(down, 60, 10_000).heldMs).toBe(-60_000)
    expect(T.adjustSpeaker(down, -60, 10_000).heldMs).toBe(60_000)
    const up = { mode: 'up' as const, minutes: 45, startedAt: null, heldMs: 30_000 }
    expect(T.adjustSpeaker(up, 60, 0).heldMs).toBe(90_000)
    expect(T.adjustSpeaker(up, -120, 0).heldMs).toBe(0)
    const upRunning = { mode: 'up' as const, minutes: 45, startedAt: 0, heldMs: 0 }
    expect(T.adjustSpeaker(upRunning, -120, 50_000).heldMs).toBe(-50_000)
  })
  it('leaves My timer alone before it starts', () => {
    const fresh = { mode: 'down' as const, minutes: 45, startedAt: null, heldMs: 0 }
    expect(T.adjustSpeaker(fresh, 60, 0)).toBe(fresh)
    expect(T.speakerStarted(fresh)).toBe(false)
    expect(T.speakerStarted({ ...fresh, heldMs: -60_000 })).toBe(true)
  })
})
