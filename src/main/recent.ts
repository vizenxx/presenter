import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { RECENT_MAX } from '../shared/recentList'
import type { DeckRef } from '../shared/types'

const file = (): string => path.join(app.getPath('userData'), 'recent.json')

export function loadRecent(): DeckRef[] {
  try {
    const list = JSON.parse(fs.readFileSync(file(), 'utf8')) as DeckRef[]
    return list.filter((d) => d && typeof d.path === 'string' && fs.existsSync(d.path)).slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

export function saveRecent(list: DeckRef[]): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(list, null, 2))
  } catch {
    // The recent list is a convenience; a failed write must not stop a class.
  }
}
