import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_WARN_SEC, MAX_WARN_SEC } from '../shared/timer'

/** Remembers when the class timer warns (seconds left before the end; 0 = no warning). */
const file = (): string => path.join(app.getPath('userData'), 'timer.json')

export function clampWarn(seconds: number): number {
  return Number.isFinite(seconds) ? Math.min(MAX_WARN_SEC, Math.max(0, Math.round(seconds))) : DEFAULT_WARN_SEC
}

export function loadWarn(): number {
  try {
    const value = (JSON.parse(fs.readFileSync(file(), 'utf8')) as { warnSec?: unknown }).warnSec
    return typeof value === 'number' ? clampWarn(value) : DEFAULT_WARN_SEC
  } catch {
    return DEFAULT_WARN_SEC
  }
}

export function saveWarn(seconds: number): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify({ warnSec: seconds }, null, 2))
  } catch {
    // A convenience; a failed write must not stop a class.
  }
}
