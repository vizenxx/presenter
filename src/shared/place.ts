export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Moves a window rectangle (and, when it is bigger than the area, shrinks it) so that it lies
 * wholly inside the area. A rectangle that already fits is returned unchanged.
 */
export function keepInside(box: Box, area: Box): Box {
  const width = Math.min(box.width, area.width)
  const height = Math.min(box.height, area.height)
  const x = Math.min(Math.max(box.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(box.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}
