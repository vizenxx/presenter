import type { ClockPeriod, SpeakerMode, SpeakerTimerView } from './types'

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

/** A list as the console may send it, put into range (at most 5 bells, 0 s – 60 min, 1–9 beeps) and in the order the bells ring. */
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
    .sort((a, b) => b.sec - a.sec)
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

/** True when My timer has started (running, or paused with time on it). Clock times are always set. */
export function speakerStarted(s: SpeakerTimerView): boolean {
  return s.mode === 'clock' || s.startedAt !== null || s.heldMs !== 0
}

export const DAY_SEC = 24 * 60 * 60
/** Class periods for My timer From–to: up to 6. Over time shows for 30 minutes after a period's end. */
export const MAX_PERIODS = 6
export const OVER_TIME_SHOWN_SEC = 30 * 60
/** Weekdays in the order the pop-up shows them (JavaScript numbers: 0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DEFAULT_PERIODS: ClockPeriod[] = [{ days: [1, 2, 3, 4, 5], fromSec: 9 * 3600, untilSec: 10 * 3600 }]

/** Seconds after local midnight at this moment. */
export function secondsOfDay(now: number): number {
  const d = new Date(now)
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000
}

/**
 * Where My timer From–to stands now, from today's periods: during one (counting down to its end),
 * after one (Over time, for 30 minutes after its end), before the next one today, or none.
 * key names today's period, for a change of today's end with ±.
 */
export interface ClockNow {
  phase: 'before' | 'during' | 'after' | 'none'
  period: ClockPeriod | null
  key: string | null
  /** The period's end today (seconds after midnight), with today's ± change. */
  endSec: number
}

export function clockNow(s: SpeakerTimerView, now: number): ClockNow {
  const d = new Date(now)
  const sec = secondsOfDay(now)
  const date = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  const today = s.periods
    .map((period, i) => ({ period, key: `${date}#${i}` }))
    .filter((x) => x.period.days.includes(d.getDay()))
    .map((x) => ({ ...x, endSec: x.period.untilSec + (s.clockExtra && s.clockExtra.key === x.key ? s.clockExtra.sec : 0) }))
    .sort((a, b) => a.period.fromSec - b.period.fromSec)
  const during = today.find((x) => x.period.fromSec <= sec && sec < x.endSec)
  if (during) return { phase: 'during', ...during }
  const ended = today.filter((x) => x.endSec <= sec && sec - x.endSec < OVER_TIME_SHOWN_SEC).sort((a, b) => b.endSec - a.endSec)[0]
  if (ended) return { phase: 'after', ...ended }
  const next = today.find((x) => x.period.fromSec > sec)
  if (next) return { phase: 'before', ...next }
  return { phase: 'none', period: null, key: null, endSec: 0 }
}

/**
 * Seconds My timer shows: time so far (count up), time left (count down, below zero when over),
 * or From–to: the period's length before it starts, then the time left until its end (below zero after it).
 */
export function speakerSeconds(s: SpeakerTimerView, now: number): number {
  if (s.mode === 'clock') {
    const c = clockNow(s, now)
    if (c.phase === 'none' || !c.period) return 0
    return c.phase === 'before' ? c.endSec - c.period.fromSec : c.endSec - secondsOfDay(now)
  }
  const elapsed = (s.heldMs + (s.startedAt !== null ? now - s.startedAt : 0)) / 1000
  return s.mode === 'up' ? elapsed : s.minutes * 60 - elapsed
}

/**
 * Periods as the console may send them, put into range: at most 6; days 0–6 without repeats;
 * whole minutes in one day, the end at least one minute after the start; in order of start time.
 */
export function cleanPeriods(list: unknown): ClockPeriod[] {
  if (!Array.isArray(list)) return DEFAULT_PERIODS.map((p) => ({ ...p, days: [...p.days] }))
  const minute = (v: unknown): number => {
    const n = Number(v)
    return Math.round((Number.isFinite(n) ? n : 0) / 60) * 60
  }
  return list
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .slice(0, MAX_PERIODS)
    .map((p) => {
      const days = Array.isArray(p['days']) ? [...new Set(p['days'].map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : []
      const fromSec = Math.min(DAY_SEC - 60, Math.max(0, minute(p['fromSec'])))
      const untilSec = Math.min(DAY_SEC - 60, Math.max(fromSec + 60, minute(p['untilSec'])))
      return { days, fromSec, untilSec: Math.max(untilSec, fromSec + 60) }
    })
    .sort((a, b) => a.fromSec - b.fromSec)
}

/** 12-hour clock: "9:05 AM" for seconds after midnight. */
export function time12(sec: number): string {
  const total = Math.floor(sec / 60)
  const h = Math.floor(total / 60) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${String(total % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "9:00–10:50 AM", or "11:30 AM–1:00 PM" when the two times are in different halves of the day. */
export function range12(fromSec: number, untilSec: number): string {
  const [a, b] = [time12(fromSec), time12(untilSec)]
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

/** Seconds after midnight from a 12-hour time (hour 1–12, AM or PM). */
export function from12(hour: number, minute: number, pm: boolean): number {
  return ((hour % 12) + (pm ? 12 : 0)) * 3600 + minute * 60
}

export const SPEAKER_MODES: SpeakerMode[] = ['up', 'down', 'clock']

/**
 * Adds time to My timer (a negative amount takes time away). Count down: more time left (it may
 * go above the minutes set). Count up: more time counted (never below zero). From–to: today's
 * period ends later or earlier (today only; the weekly times stay). Not started: no change.
 */
export function adjustSpeaker(s: SpeakerTimerView, deltaSec: number, now: number): SpeakerTimerView {
  const delta = Math.round(deltaSec) * 1000
  if (delta === 0 || !speakerStarted(s)) return s
  if (s.mode === 'clock') {
    const c = clockNow(s, now)
    if (!c.period || !c.key) return s
    const before = s.clockExtra && s.clockExtra.key === c.key ? s.clockExtra.sec : 0
    // The end stays at least one minute after the start.
    const sec = Math.max(c.period.fromSec + 60 - c.period.untilSec, before + Math.round(deltaSec))
    return { ...s, clockExtra: { key: c.key, sec } }
  }
  const runningMs = s.startedAt !== null ? now - s.startedAt : 0
  // Counting up never goes below zero: the held part may cancel the running part, no more.
  const lowest = runningMs > 0 ? -runningMs : 0
  const heldMs = s.mode === 'down' ? s.heldMs - delta : Math.max(lowest, s.heldMs + delta)
  return { ...s, heldMs }
}
