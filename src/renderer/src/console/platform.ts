/** True on a Mac (Electron reports "Macintosh" there on Intel and Apple silicon alike). */
export const IS_MAC = navigator.userAgent.includes('Macintosh')

/** Shortcut names as the keyboard shows them. */
export const KEYS = {
  mod: IS_MAC ? '⌘' : 'Ctrl',
  project: IS_MAC ? '⌘↩' : 'F5'
}
