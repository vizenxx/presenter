/** Inner SVG markup (24x24 viewBox, stroke = currentColor) shared by the console toolbar and the projector palette. */
export const INK_ICONS = {
  pointer: '<path d="M5 3l6.5 17 2.4-7.1L21 10.5z"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  highlighter: '<path d="M9 11.5l-4.5 4.5v3.5H8l4.5-4.5"/><path d="M9 11.5l6.5-6.5 3.5 3.5-6.5 6.5z"/><path d="M4 21.5h8"/>',
  rect: '<rect x="3.5" y="5" width="17" height="14" rx="2" stroke-dasharray="3.5 2.5"/>',
  laser: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="12" cy="12" r="8" opacity=".4"/>',
  eraser: '<path d="M8 20h12"/><path d="M5.5 15.5l8.8-8.8a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12.5 18H8z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  clear: '<path d="M4 7h16"/><path d="M9.5 7V4h5v3"/><path d="M6.5 7l1 13h9l1-13"/>'
} as const

export type InkIconName = keyof typeof INK_ICONS

export function inkSvg(name: InkIconName, size = 20): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${INK_ICONS[name]}</svg>`
}
