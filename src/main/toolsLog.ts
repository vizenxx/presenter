import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A short record of what the floating tools did (userData/tools-log.txt): when they came up or went,
 * which window was in front, when the ink pad took or let go of the mouse, and each time a tool was
 * chosen with the state at that moment. The last 200 lines of the earlier run are kept. If a drawing
 * tool ever does not draw, this file shows which state it was in; it never stops the app.
 */
let file: string | null = null

function open(): string | null {
  if (file) return file
  try {
    const target = path.join(app.getPath('userData'), 'tools-log.txt')
    let old: string[] = []
    try {
      old = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean)
    } catch {
      // No earlier run.
    }
    fs.writeFileSync(target, `${old.slice(-200).join('\n')}${old.length ? '\n' : ''}${new Date().toISOString()} ---- Presenter ${app.getVersion()} starts\n`)
    file = target
  } catch {
    file = null
  }
  return file
}

export function toolsLog(line: string): void {
  try {
    const target = open()
    if (target) fs.appendFileSync(target, `${new Date().toISOString().slice(11, 23)} ${line}\n`)
  } catch {
    // The log must never stop the app.
  }
}
