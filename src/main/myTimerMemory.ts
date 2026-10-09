import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { cleanTimes, SPEAKER_MODES } from '../shared/timer'
import type { SpeakerMode } from '../shared/types'

/** Remembers My timer's mode, minutes and clock times (a class period repeats every week). */
const file = (): string => path.join(app.getPath('userData'), 'mytimer.json')

export interface MyTimerSettings {
  mode: SpeakerMode
  minutes: number
  fromSec: number
  untilSec: number
}

export const DEFAULT_MY_TIMER: MyTimerSettings = { mode: 'up', minutes: 45, fromSec: 9 * 3600, untilSec: 10 * 3600 }

export function loadMyTimer(): MyTimerSettings {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<MyTimerSettings>
    const mode = SPEAKER_MODES.includes(saved.mode as SpeakerMode) ? (saved.mode as SpeakerMode) : DEFAULT_MY_TIMER.mode
    const minutes = typeof saved.minutes === 'number' ? Math.min(240, Math.max(1, Math.round(saved.minutes))) : DEFAULT_MY_TIMER.minutes
    const times = cleanTimes(Number(saved.fromSec ?? DEFAULT_MY_TIMER.fromSec), Number(saved.untilSec ?? DEFAULT_MY_TIMER.untilSec))
    return { mode, minutes, ...times }
  } catch {
    return { ...DEFAULT_MY_TIMER }
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
