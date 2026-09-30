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
