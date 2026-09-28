import { screen, type Display } from 'electron'
import { pickDisplayIds } from '../shared/displays'

function pick(): { console: Display; projector: Display | null } {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const ids = pickDisplayIds(all, primary.id)
  return {
    console: all.find((d) => d.id === ids.consoleId) ?? primary,
    projector: all.find((d) => d.id === ids.projectorId) ?? null
  }
}

export const consoleDisplay = (): Display => pick().console
export const projectorDisplay = (): Display | null => pick().projector
