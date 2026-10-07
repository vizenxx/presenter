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
    expect(T.timerCue(run(61), run(60))).toBe('warning')
    expect(T.timerCue(run(62), run(59))).toBe('warning')
    expect(T.timerCue(run(60), run(59))).toBeNull()
    expect(T.timerCue(run(6), run(5))).toBe('last-seconds')
    expect(T.timerCue(run(2), run(1))).toBe('last-seconds')
    expect(T.timerCue(run(7), run(6))).toBeNull()
    expect(T.timerCue(run(1), { status: 'done', remainingSec: 0 })).toBeNull()
  })
  it('warns at the time the teacher set, or never when it is 0', () => {
    const run = (sec: number) => ({ status: 'running' as const, remainingSec: sec })
    expect(T.timerCue(run(121), run(120), 120)).toBe('warning')
    expect(T.timerCue(run(61), run(60), 120)).toBeNull()
    expect(T.timerCue(run(31), run(30), 30)).toBe('warning')
    expect(T.timerCue(run(61), run(60), 0)).toBeNull()
    expect(T.timerCue(run(6), run(5), 0)).toBe('last-seconds')
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
