import type { NavAction } from './types'

export interface NavOutput {
  id: string
  index: number
  total: number | null
  linked: boolean
}

export function clampIndex(index: number, total: number | null): number {
  const last = total === null ? Infinity : Math.max(0, total - 1)
  return Math.min(Math.max(0, index), last)
}

/**
 * The page-turn rule: the selected screen always moves; when it is linked,
 * every other linked screen moves by the same delta. Returns the new logical
 * index for each screen that moves (empty = nothing moves).
 */
export function planMove(outputs: NavOutput[], selectedId: string, action: NavAction): Map<string, number> {
  const moves = new Map<string, number>()
  const selected = outputs.find((o) => o.id === selectedId)
  if (!selected) return moves
  const last = selected.total === null ? null : Math.max(0, selected.total - 1)

  let delta: number
  switch (action.type) {
    case 'step': {
      const target = selected.index + action.delta
      if (action.delta > 0 && last !== null && target > last) return moves
      if (action.delta < 0 && target < 0) return moves
      delta = action.delta
      break
    }
    case 'goto':
      delta = clampIndex(action.index, selected.total) - selected.index
      break
    case 'first':
      delta = -selected.index
      break
    case 'last':
      if (last === null) return moves
      delta = last - selected.index
      break
  }
  if (delta === 0) return moves

  const movers = selected.linked ? outputs.filter((o) => o.linked) : [selected]
  for (const o of movers) moves.set(o.id, o.index + delta)
  return moves
}
