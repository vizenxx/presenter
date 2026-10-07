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

/** A warning sound before the end: three beeps with one minute left, one beep for each of the last five seconds. */
export type TimerCue = 'one-minute' | 'last-seconds' | null

/** The cue for a change of the shown time. A start, a resume or a reset never beeps. */
export function timerCue(before: { status: TimerStatus; remainingSec: number } | null, now: { status: TimerStatus; remainingSec: number }): TimerCue {
  if (!before || before.status !== 'running' || now.status !== 'running') return null
  if (now.remainingSec >= before.remainingSec) return null
  if (now.remainingSec >= 1 && now.remainingSec <= 5) return 'last-seconds'
  if (before.remainingSec > 60 && now.remainingSec <= 60) return 'one-minute'
  return null
}
