import type { KeyIntent, NavAction } from './types'

export interface KeyMods {
  control?: boolean
  alt?: boolean
  meta?: boolean
  shift?: boolean
}

export type CommandKey = 'project' | 'stop-project'

/** A black or white projector (PowerPoint's B and W keys). */
export type BlankKind = 'black' | 'white'

/** PowerPoint convention, also sent by many clickers' "blank screen" button: B or . = black, W or , = white. */
export function blankKey(key: string, mods: KeyMods = {}): BlankKind | null {
  if (mods.control || mods.alt || mods.meta) return null
  if (key === 'b' || key === 'B' || key === '.') return 'black'
  if (key === 'w' || key === 'W' || key === ',') return 'white'
  return null
}

/**
 * PowerPoint convention (and most clickers' show button): F5 starts projecting, Esc stops it.
 * Mac keyboards need fn for F5, so ⌘ Return also starts (as in PowerPoint for Mac).
 */
export function commandKey(key: string, mods: KeyMods = {}): CommandKey | null {
  if (key === 'Enter' && mods.meta && !mods.control && !mods.alt) return 'project'
  if (mods.control || mods.alt || mods.meta) return null
  if (key === 'F5') return 'project'
  if (key === 'Escape') return 'stop-project'
  return null
}

/** Keys a presenter clicker or keyboard uses to turn pages. */
export function keyIntent(key: string, mods: KeyMods = {}): KeyIntent | null {
  if (mods.control || mods.alt || mods.meta) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'prev'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    default:
      return null
  }
}

export function intentToAction(intent: KeyIntent): NavAction {
  switch (intent) {
    case 'next':
      return { type: 'step', delta: 1 }
    case 'prev':
      return { type: 'step', delta: -1 }
    case 'first':
      return { type: 'first' }
    case 'last':
      return { type: 'last' }
  }
}
