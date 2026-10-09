import type { SpeakerTimerView } from './types'

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export interface TimerState {
  status: TimerStatus
  durationSec: number
  remainingMs: number
  /** Wall-clock end time while running; null otherwise. */
  endAt: number | null
  alarming: boolean
}

export function initialTimer(durationSec = 60): TimerState {
  return { status: 'idle', durationSec, remainingMs: durationSec * 1000, endAt: null, alarming: false }
}

export function start(_s: TimerState, durationSec: number, now: number): TimerState {
  const d = Math.max(1, Math.round(durationSec))
  return { status: 'running', durationSec: d, remainingMs: d * 1000, endAt: now + d * 1000, alarming: false }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.endAt === null) return s
  return { ...s, status: 'paused', remainingMs: Math.max(0, s.endAt - now), endAt: null }
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s
  return { ...s, status: 'running', endAt: now + s.remainingMs }
}

export function reset(s: TimerState, durationSec = s.durationSec): TimerState {
  return initialTimer(Math.max(1, Math.round(durationSec)))
}

export function toggle(s: TimerState, now: number, defaultSec: number): TimerState {
  switch (s.status) {
    case 'running':
      return pause(s, now)
    case 'paused':
      return resume(s, now)
    case 'idle':
      return start(s, defaultSec, now)
    case 'done':
      return reset(s)
  }
}

export function tick(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.endAt === null) return s
  const remainingMs = Math.max(0, s.endAt - now)
  if (remainingMs === 0) return { ...s, status: 'done', remainingMs: 0, endAt: null, alarming: true }
  return { ...s, remainingMs }
}

export function dismiss(s: TimerState): TimerState {
  return s.status === 'done' ? reset(s) : { ...s, alarming: false }
}

export function remainingSec(s: TimerState): number {
  return Math.ceil(s.remainingMs / 1000)
}

/** One warning bell: when this many seconds are left, beep this many times. */
export interface TimerWarning {
  sec: number
  beeps: number
}

/** A sound before the end: a warning bell's beeps, or one beep for each of the last five seconds. */
export type TimerCue = { kind: 'warning'; beeps: number } | { kind: 'last-seconds' } | null

/** Until the teacher sets others: one bell, 3 beeps with one minute left. */
export const DEFAULT_WARNINGS: TimerWarning[] = [{ sec: 60, beeps: 3 }]
export const MAX_WARNINGS = 5
export const MAX_WARN_SEC = 60 * 60
export const MAX_BEEPS = 9

/** A list as the console may send it, put into range: at most 5 bells, 0 s – 60 min, 1–9 beeps. */
export function cleanWarnings(list: unknown): TimerWarning[] {
  if (!Array.isArray(list)) return DEFAULT_WARNINGS.map((w) => ({ ...w }))
  const whole = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
  }
  return list
    .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
    .slice(0, MAX_WARNINGS)
    .map((w) => ({ sec: whole(w['sec'], 0, MAX_WARN_SEC, 60), beeps: whole(w['beeps'], 1, MAX_BEEPS, 3) }))
}

/**
 * The cue for a change of the shown time. A start, a resume or a reset never beeps. A bell rings
 * when its time is passed; when one step passes several bells, the one nearest the end rings.
 * A bell at 0:00 never rings. The last five seconds always beep once a second.
 */
export function timerCue(before: { status: TimerStatus; remainingSec: number } | null, now: { status: TimerStatus; remainingSec: number }, warnings: TimerWarning[] = DEFAULT_WARNINGS): TimerCue {
  if (!before || before.status !== 'running' || now.status !== 'running') return null
  if (now.remainingSec >= before.remainingSec) return null
  if (now.remainingSec >= 1 && now.remainingSec <= 5) return { kind: 'last-seconds' }
  const passed = warnings.filter((w) => w.sec > 0 && before.remainingSec > w.sec && now.remainingSec <= w.sec)
  if (passed.length === 0) return null
  const nearest = passed.reduce((a, b) => (b.sec < a.sec || (b.sec === a.sec && b.beeps > a.beeps) ? b : a))
  return { kind: 'warning', beeps: nearest.beeps }
}

/**
 * Adds time to the class timer (a negative amount takes time away). A running or paused timer
 * keeps at least one second, so taking away too much makes it ring a second later. A timer that
 * has rung runs again for the added time. A timer that has not started does not change.
 */
export function adjust(s: TimerState, deltaSec: number, now: number): TimerState {
  const delta = Math.round(deltaSec) * 1000
  if (delta === 0) return s
  switch (s.status) {
    case 'running': {
      const left = Math.max(1000, (s.endAt ?? now) - now + delta)
      return { ...s, remainingMs: left, endAt: now + left }
    }
    case 'paused':
      return { ...s, remainingMs: Math.max(1000, s.remainingMs + delta) }
    case 'done':
      return delta > 0 ? { ...s, status: 'running', alarming: false, remainingMs: delta, endAt: now + delta } : s
    case 'idle':
      return s
  }
}

/** True when My timer has started (running, or paused with time on it). */
export function speakerStarted(s: SpeakerTimerView): boolean {
  return s.startedAt !== null || s.heldMs !== 0
}

/**
 * Adds time to My timer (a negative amount takes time away). Count down: more time left (it may
 * go above the minutes set). Count up: more time counted (never below zero). Not started: no change.
 */
export function adjustSpeaker(s: SpeakerTimerView, deltaSec: number, now: number): SpeakerTimerView {
  const delta = Math.round(deltaSec) * 1000
  if (delta === 0 || !speakerStarted(s)) return s
  const runningMs = s.startedAt !== null ? now - s.startedAt : 0
  // Counting up never goes below zero: the held part may cancel the running part, no more.
  const lowest = runningMs > 0 ? -runningMs : 0
  const heldMs = s.mode === 'down' ? s.heldMs - delta : Math.max(lowest, s.heldMs + delta)
  return { ...s, heldMs }
}
