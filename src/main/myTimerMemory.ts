import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { cleanPeriods, cleanSpeakerSec, DEFAULT_PERIODS, SPEAKER_MODES } from '../shared/timer'
import type { ClockPeriod, SpeakerMode } from '../shared/types'

/** Remembers My timer's mode, minutes and sessions (they repeat every week). */
const file = (): string => path.join(app.getPath('userData'), 'mytimer.json')

export interface MyTimerSettings {
  mode: SpeakerMode
  minutes: number
  /** With the minutes, the length of the count down. */
  seconds: number
  periods: ClockPeriod[]
}

export function defaultMyTimer(): MyTimerSettings {
  return { mode: 'up', minutes: 45, seconds: 0, periods: cleanPeriods(DEFAULT_PERIODS) }
}

export function loadMyTimer(): MyTimerSettings {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<MyTimerSettings> & { fromSec?: unknown; untilSec?: unknown }
    const fallback = defaultMyTimer()
    const mode = SPEAKER_MODES.includes(saved.mode as SpeakerMode) ? (saved.mode as SpeakerMode) : fallback.mode
    const total = typeof saved.minutes === 'number' ? cleanSpeakerSec(Math.round(saved.minutes) * 60 + (typeof saved.seconds === 'number' ? saved.seconds : 0), 1) : fallback.minutes * 60
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    // Saved before weekdays existed: one pair of times, Monday to Friday.
    const periods = Array.isArray(saved.periods)
      ? cleanPeriods(saved.periods)
      : typeof saved.fromSec === 'number'
        ? cleanPeriods([{ days: [1, 2, 3, 4, 5], fromSec: saved.fromSec, untilSec: saved.untilSec }])
        : fallback.periods
    return { mode, minutes, seconds, periods }
  } catch {
    return defaultMyTimer()
  }
}

export function saveMyTimer(settings: MyTimerSettings): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(settings, null, 2))
  } catch {
    // A convenience; a failed write must not stop a class.
  }
}
