/** Inner SVG markup (24x24 viewBox, stroke = currentColor) shared by the console toolbar and the projector palette. */
export const INK_ICONS = {
  pointer: '<path d="M5 3l6.5 17 2.4-7.1L21 10.5z"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  highlighter: '<path d="M9 11.5l-4.5 4.5v3.5H8l4.5-4.5"/><path d="M9 11.5l6.5-6.5 3.5 3.5-6.5 6.5z"/><path d="M4 21.5h8"/>',
  rect: '<rect x="3.5" y="5" width="17" height="14" rx="2" stroke-dasharray="3.5 2.5"/>',
  arrow: '<path d="M5 19L19 5"/><path d="M10.5 5H19v8.5"/>',
  text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  laser: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="12" cy="12" r="8" opacity=".4"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M10.5 7.5v6M7.5 10.5h6"/>',
  eraser: '<path d="M8 20h12"/><path d="M5.5 15.5l8.8-8.8a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12.5 18H8z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 017.5 3H18v15H7.5A2.5 2.5 0 005 20.5z"/><path d="M5 20.5A2.5 2.5 0 007.5 23H18v-5"/><path d="M9 7.5h6"/>',
  window: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/>',
  board: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  blank: '<rect x="3" y="5" width="18" height="14" rx="2.5" fill="currentColor"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5"/><path d="M9.5 3h5"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2A4.6 4.6 0 0120.5 19"/>',
  bell: '<path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  console: '<rect x="5" y="5.5" width="14" height="10" rx="1.8"/><path d="M2.5 19.5h19"/>',
  raise: '<rect x="3" y="7" width="13" height="13" rx="2"/><path d="M14 4h6v6"/><path d="M20 4l-9 9"/>',
  swap: '<path d="M4 8h15"/><path d="M15 4l4 4-4 4"/><path d="M20 16H5"/><path d="M9 12l-4 4 4 4"/>',
  clear: '<path d="M4 7h16"/><path d="M9.5 7V4h5v3"/><path d="M6.5 7l1 13h9l1-13"/>'
} as const

export type InkIconName = keyof typeof INK_ICONS

export function inkSvg(name: InkIconName, size = 20): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${INK_ICONS[name]}</svg>`
}
