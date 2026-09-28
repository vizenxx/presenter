/**
 * html   = shown as a web page (UXD202 decks, any HTML)
 * slides = PowerPoint-type files, converted to PDF pages before showing
 * pdf    = shown page by page
 */
export type DeckKind = 'html' | 'slides' | 'pdf'

const KINDS: Record<string, DeckKind> = {
  html: 'html',
  htm: 'html',
  pptx: 'slides',
  ppt: 'slides',
  ppsx: 'slides',
  pps: 'slides',
  pptm: 'slides',
  odp: 'slides',
  key: 'slides',
  pdf: 'pdf'
}

/** Extensions the open dialog offers. */
export const DECK_EXTENSIONS = Object.keys(KINDS)

function extension(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function deckKind(filePath: string): DeckKind | null {
  return KINDS[extension(filePath)] ?? null
}

/** File name without folder and extension. */
export function deckTitle(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}
