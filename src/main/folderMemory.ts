import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Remembers the folder of the deck opened last, so Open deck starts there next time (also after a restart). */
const file = (): string => path.join(app.getPath('userData'), 'folder.json')

export function loadFolder(): string | null {
  try {
    const folder = (JSON.parse(fs.readFileSync(file(), 'utf8')) as { folder?: unknown }).folder
    return typeof folder === 'string' && fs.existsSync(folder) ? folder : null
  } catch {
    return null
  }
}

export function saveFolder(folder: string): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify({ folder }, null, 2))
  } catch {
    // A convenience; a failed write must not stop a class.
  }
}
