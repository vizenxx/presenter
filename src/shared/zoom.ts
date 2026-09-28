import type { KeyMods } from './keys'

export type ZoomDirection = 'in' | 'out' | 'reset'

/** Chrome's page-zoom steps, in percent. */
export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300]

export function stepZoom(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') return 100
  if (direction === 'in') return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0]
}

/** Browser shortcuts: Ctrl + / Ctrl − / Ctrl 0. */
export function zoomKey(key: string, mods: KeyMods = {}): ZoomDirection | null {
  if (!mods.control && !mods.meta) return null
  if (key === '=' || key === '+') return 'in'
  if (key === '-' || key === '_') return 'out'
  if (key === '0') return 'reset'
  return null
}
