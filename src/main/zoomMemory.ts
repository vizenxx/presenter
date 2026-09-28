import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Remembers the zoom (字号) per deck file, like a browser remembers it per site. */
const file = (): string => path.join(app.getPath('userData'), 'zoom.json')
const keyOf = (deckPath: string): string => path.resolve(deckPath).toLowerCase()
let cache: Record<string, number> | null = null

function all(): Record<string, number> {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8')) as Record<string, number>
  } catch {
    cache = {}
  }
  return cache
}

export function zoomFor(deckPath: string): number {
  const value = all()[keyOf(deckPath)]
  return typeof value === 'number' && value > 0 ? value : 100
}

export function rememberZoom(deckPath: string, percent: number): void {
  const map = all()
  if (percent === 100) delete map[keyOf(deckPath)]
  else map[keyOf(deckPath)] = percent
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(map, null, 2))
  } catch {
    // Remembering the zoom is a convenience; a failed write must not stop a class.
  }
}
