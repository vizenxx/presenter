import { app, nativeTheme } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { UiTheme } from '../shared/types'

/** Remembers the console's light or dark look. Nothing saved = follow the computer's setting. */
const file = (): string => path.join(app.getPath('userData'), 'theme.json')

export function loadTheme(): UiTheme | null {
  try {
    const value = (JSON.parse(fs.readFileSync(file(), 'utf8')) as { theme?: unknown }).theme
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function saveTheme(theme: UiTheme): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify({ theme }, null, 2))
  } catch {
    // The look is a convenience; a failed write must not stop a class.
  }
}

/** The window colour behind the page (seen for a moment while it loads). Matches --color-page. */
export function themeBackground(theme: UiTheme | null): string {
  const dark = theme ? theme === 'dark' : nativeTheme.shouldUseDarkColors
  return dark ? '#000000' : '#f5f5f7'
}
