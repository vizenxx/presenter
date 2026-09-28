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
})
