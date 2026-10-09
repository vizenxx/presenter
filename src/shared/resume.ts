/**
 * Where a deck opens again: the page it showed last, when that was less than 3 hours ago (a
 * restart or a crash in the same class); otherwise the first page (the next lesson starts there).
 */
export const RESUME_MS = 3 * 60 * 60 * 1000

export interface SavedPage {
  index: number
  at: number
}

export function resumeIndex(saved: SavedPage | undefined, now: number): number | null {
  if (!saved || !Number.isInteger(saved.index) || saved.index <= 0) return null
  return now - saved.at >= 0 && now - saved.at < RESUME_MS ? saved.index : null
}
