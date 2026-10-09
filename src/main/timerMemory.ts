import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { cleanWarnings, DEFAULT_WARNINGS, type TimerWarning } from '../shared/timer'

/** Remembers the class timer's warning bells. */
const file = (): string => path.join(app.getPath('userData'), 'timer.json')

export function loadWarnings(): TimerWarning[] {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as { warnings?: unknown; warnSec?: unknown }
    if (Array.isArray(saved.warnings)) return cleanWarnings(saved.warnings)
    // Saved by 0.2.0: one warning time with 3 beeps; 0 = none.
    if (typeof saved.warnSec === 'number') return saved.warnSec > 0 ? cleanWarnings([{ sec: saved.warnSec, beeps: 3 }]) : []
  } catch {
    // Nothing saved yet.
  }
  return DEFAULT_WARNINGS.map((w) => ({ ...w }))
}

export function saveWarnings(warnings: TimerWarning[]): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify({ warnings }, null, 2))
  } catch {
    // A convenience; a failed write must not stop a class.
  }
}
