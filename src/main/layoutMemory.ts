import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Remembers whether the console is turned left to right (the two sides swapped). */
const file = (): string => path.join(app.getPath('userData'), 'layout.json')

export function loadFlipped(): boolean {
  try {
    return (JSON.parse(fs.readFileSync(file(), 'utf8')) as { flipped?: unknown }).flipped === true
  } catch {
    return false
  }
}

export function saveFlipped(flipped: boolean): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify({ flipped }, null, 2))
  } catch {
    // The side is a convenience; a failed write must not stop a class.
  }
}
