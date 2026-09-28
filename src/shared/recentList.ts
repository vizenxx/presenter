import type { DeckRef } from './types'

export const RECENT_MAX = 10

export function mergeRecent(list: DeckRef[], deck: DeckRef): DeckRef[] {
  const key = deck.path.toLowerCase()
  return [deck, ...list.filter((d) => d.path.toLowerCase() !== key)].slice(0, RECENT_MAX)
}
