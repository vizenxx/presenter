import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Lang } from '../shared/lang'

interface Settings {
  language: Lang
}

const file = (): string => path.join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Settings>
    return { language: saved.language === 'zh' ? 'zh' : 'en' }
  } catch {
    return { language: 'en' }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(settings, null, 2))
  } catch {
    // Settings are a convenience; the app keeps working with the choice in memory.
  }
}
