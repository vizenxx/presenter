export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** A signed clock for the speaker's own timer: "05:07", "1:02:03", "−00:42" when over time. */
export function clock(totalSec: number): string {
  const sign = totalSec < 0 ? '−' : ''
  const s = Math.floor(Math.abs(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s % 60)}` : `${sign}${pad(m)}:${pad(s % 60)}`
}

/** The parts a time is shown in. With hours, 1 h or more shows h:mm:ss; otherwise minutes run on (mm:ss). */
export interface TimeParts {
  h: number
  m: number
  s: number
  hasHours: boolean
}

export function timeParts(totalSec: number, hours: boolean): TimeParts {
  const total = Math.max(0, Math.floor(totalSec))
  if (hours && total >= 3600) return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, hasHours: true }
  return { h: 0, m: Math.floor(total / 60), s: total % 60, hasHours: false }
}

/**
 * The time after one part (hours, minutes or seconds) is typed over, the other parts being what
 * they are NOW (the clock keeps running while you type; only the part you change is yours).
 * Seconds stop at 59; minutes at 59 when hours show, else at maxMinutes; hours at 9.
 */
export function withPart(nowSec: number, hours: boolean, part: 'h' | 'm' | 's', value: number, maxMinutes: number): number {
  const p = timeParts(nowSec, hours)
  const v = Math.max(0, Math.round(value))
  const h = part === 'h' ? Math.min(9, v) : p.h
  const withHours = p.hasHours || part === 'h'
  const m = part === 'm' ? Math.min(withHours ? 59 : maxMinutes, v) : p.m
  const s = part === 's' ? Math.min(59, v) : p.s
  return withHours ? h * 3600 + m * 60 + s : m * 60 + s
}
