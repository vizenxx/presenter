import type { KeyMods } from './keys'

export type ZoomDirection = 'in' | 'out' | 'reset'

/** Text size moves in steps of 5 %, from 50 % to 300 %. */
export const ZOOM_STEP = 5
export const ZOOM_MIN = 50
export const ZOOM_MAX = 300

/** One step in or out; a value between steps goes to the next step in that direction. */
export function stepZoom(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') return 100
  const next = direction === 'in' ? Math.floor(current / ZOOM_STEP) * ZOOM_STEP + ZOOM_STEP : Math.ceil(current / ZOOM_STEP) * ZOOM_STEP - ZOOM_STEP
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
}

/** Browser shortcuts: Ctrl + / Ctrl − / Ctrl 0. */
export function zoomKey(key: string, mods: KeyMods = {}): ZoomDirection | null {
  if (!mods.control && !mods.meta) return null
  if (key === '=' || key === '+') return 'in'
  if (key === '-' || key === '_') return 'out'
  if (key === '0') return 'reset'
  return null
}
