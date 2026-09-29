import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A short record of the first minute of each start: userData/startup-log.txt, replaced at
 * every start. If the console ever stays on "Starting…", it shows which step did not happen.
 */
const t0 = Date.now()
let file: string | null = null

export function startupLog(step: string): void {
  if (Date.now() - t0 > 60_000) return
  try {
    if (!file) {
      file = path.join(app.getPath('userData'), 'startup-log.txt')
      fs.writeFileSync(file, `${new Date(t0).toISOString()} Presenter ${app.getVersion()} starts\n`)
    }
    fs.appendFileSync(file, `+${Date.now() - t0} ms  ${step}\n`)
  } catch {
    // The log must never stop the app.
  }
}
