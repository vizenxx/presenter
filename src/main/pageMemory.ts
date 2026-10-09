import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { resumeIndex, type SavedPage } from '../shared/resume'

/** Remembers the page each deck file showed last (and when), so a restart in class goes back there. */
const file = (): string => path.join(app.getPath('userData'), 'pages.json')
const keyOf = (deckPath: string): string => path.resolve(deckPath).toLowerCase()
let cache: Record<string, SavedPage> | null = null

function all(): Record<string, SavedPage> {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8')) as Record<string, SavedPage>
  } catch {
    cache = {}
  }
  return cache
}

/** The page to open on: the last one when it was shown less than 3 hours ago, else null (the first page). */
export function resumePage(deckPath: string, now = Date.now()): number | null {
  return resumeIndex(all()[keyOf(deckPath)], now)
}

export function rememberPages(pages: Array<{ path: string; index: number }>, now = Date.now()): void {
  const map = all()
  let changed = false
  for (const p of pages) {
    const key = keyOf(p.path)
    if (map[key]?.index === p.index && now - map[key].at < 60_000) continue
    map[key] = { index: p.index, at: now }
    changed = true
  }
  if (!changed) return
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(map, null, 2))
  } catch {
    // A convenience; a failed write must not stop a class.
  }
}
