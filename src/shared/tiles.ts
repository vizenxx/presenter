/**
 * Several contents on one projector: a binary split tree, as in tiling window managers (i3, bspwm) and
 * the editor grid of VS Code. A leaf is one content; a split puts two subtrees side by side ('row': a is
 * left, b is right) or one above the other ('col': a is on top, b is below). The ratio is the share of
 * the first part. Pure functions: the main process lays the views out with them, and the console draws
 * and drags the dividers with the same ones.
 */
export type TileNode = TileLeaf | TileSplit
export interface TileLeaf {
  id: string
}
export interface TileSplit {
  dir: 'row' | 'col'
  ratio: number
  a: TileNode
  b: TileNode
}
export interface TileRect {
  x: number
  y: number
  width: number
  height: number
}
/** The way from the root to a split: 'a' or 'b' at each step. */
export type TilePath = Array<'a' | 'b'>
export type TilePreset = 'side' | 'stack' | 'grid' | 'main'

/** The least share a part may have (the divider cannot be pulled further). */
export const MIN_SHARE = 0.12

export const isSplit = (n: TileNode): n is TileSplit => 'dir' in n

export function leaves(node: TileNode | null): string[] {
  if (!node) return []
  return isSplit(node) ? [...leaves(node.a), ...leaves(node.b)] : [node.id]
}

export function contains(node: TileNode | null, id: string): boolean {
  return leaves(node).includes(id)
}

/** The room of each content in `rect`, with `gap` pixels between neighbours (the dividers). */
export function computeRects(node: TileNode, rect: TileRect, gap: number, out: Map<string, TileRect> = new Map()): Map<string, TileRect> {
  if (!isSplit(node)) {
    out.set(node.id, rect)
    return out
  }
  if (node.dir === 'row') {
    const room = Math.max(0, rect.width - gap)
    const wa = Math.round(room * node.ratio)
    computeRects(node.a, { ...rect, width: wa }, gap, out)
    computeRects(node.b, { ...rect, x: rect.x + wa + gap, width: room - wa }, gap, out)
  } else {
    const room = Math.max(0, rect.height - gap)
    const ha = Math.round(room * node.ratio)
    computeRects(node.a, { ...rect, height: ha }, gap, out)
    computeRects(node.b, { ...rect, y: rect.y + ha + gap, height: room - ha }, gap, out)
  }
  return out
}

export interface TileDivider {
  path: TilePath
  dir: 'row' | 'col'
  /** The gap between the two parts. */
  rect: TileRect
  /** The room the split divides (its two parts and the gap): a pointer position becomes a ratio against it. */
  span: TileRect
}

export function dividers(node: TileNode, rect: TileRect, gap: number, path: TilePath = [], out: TileDivider[] = []): TileDivider[] {
  if (!isSplit(node)) return out
  if (node.dir === 'row') {
    const room = Math.max(0, rect.width - gap)
    const wa = Math.round(room * node.ratio)
    out.push({ path, dir: 'row', rect: { x: rect.x + wa, y: rect.y, width: gap, height: rect.height }, span: rect })
    dividers(node.a, { ...rect, width: wa }, gap, [...path, 'a'], out)
    dividers(node.b, { ...rect, x: rect.x + wa + gap, width: room - wa }, gap, [...path, 'b'], out)
  } else {
    const room = Math.max(0, rect.height - gap)
    const ha = Math.round(room * node.ratio)
    out.push({ path, dir: 'col', rect: { x: rect.x, y: rect.y + ha, width: rect.width, height: gap }, span: rect })
    dividers(node.a, { ...rect, height: ha }, gap, [...path, 'a'], out)
    dividers(node.b, { ...rect, y: rect.y + ha + gap, height: room - ha }, gap, [...path, 'b'], out)
  }
  return out
}

/** The ratio a pointer at (x, y) means for a divider (clamped so that no part gets too small). */
export function ratioAt(d: TileDivider, x: number, y: number, gap: number): number {
  const along = d.dir === 'row' ? x - d.span.x - gap / 2 : y - d.span.y - gap / 2
  const room = Math.max(1, (d.dir === 'row' ? d.span.width : d.span.height) - gap)
  return clampShare(along / room)
}

export function clampShare(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, ratio))
}

/**
 * A new content joins: the largest content in `rect` is split along its longer side and the new one takes
 * the second half (automatic tiling, as bspwm and Hyprland do). The first content simply becomes a leaf.
 */
export function addLeaf(node: TileNode | null, id: string, rect: TileRect, gap: number): TileNode {
  if (!node) return { id }
  if (contains(node, id)) return node
  const rects = computeRects(node, rect, gap)
  let target = ''
  let best = -1
  for (const [leaf, r] of rects) {
    const area = r.width * r.height
    if (area >= best) {
      best = area
      target = leaf
    }
  }
  const room = rects.get(target) as TileRect
  const dir = room.width >= room.height ? 'row' : 'col'
  const grow = (n: TileNode): TileNode => {
    if (!isSplit(n)) return n.id === target ? { dir, ratio: 0.5, a: n, b: { id } } : n
    return { ...n, a: grow(n.a), b: grow(n.b) }
  }
  return grow(node)
}

/** A content leaves; its neighbour takes the room. Null when nothing is left. */
export function removeLeaf(node: TileNode | null, id: string): TileNode | null {
  if (!node) return null
  if (!isSplit(node)) return node.id === id ? null : node
  const a = removeLeaf(node.a, id)
  const b = removeLeaf(node.b, id)
  if (!a) return b
  if (!b) return a
  return { ...node, a, b }
}

/** The tree with one split's ratio changed (path from the root). */
export function setRatio(node: TileNode, path: TilePath, ratio: number): TileNode {
  if (!isSplit(node)) return node
  if (path.length === 0) return { ...node, ratio: clampShare(ratio) }
  const [head, ...rest] = path
  return head === 'a' ? { ...node, a: setRatio(node.a, rest, ratio) } : { ...node, b: setRatio(node.b, rest, ratio) }
}

/** Every split gets the share its parts' content counts ask for: equal room for every content. */
export function evenOut(node: TileNode): TileNode {
  if (!isSplit(node)) return node
  const a = evenOut(node.a)
  const b = evenOut(node.b)
  const na = leaves(a).length
  const nb = leaves(b).length
  return { ...node, ratio: na / (na + nb), a, b }
}

/** Two contents trade places. */
export function swapLeaves(node: TileNode, one: string, other: string): TileNode {
  if (!isSplit(node)) return node.id === one ? { id: other } : node.id === other ? { id: one } : node
  return { ...node, a: swapLeaves(node.a, one, other), b: swapLeaves(node.b, one, other) }
}

function balanced(ids: string[], dir: 'row' | 'col'): TileNode {
  if (ids.length === 1) return { id: ids[0] }
  const k = Math.floor(ids.length / 2)
  return { dir, ratio: k / ids.length, a: balanced(ids.slice(0, k), dir), b: balanced(ids.slice(k), dir) }
}

/** A ready-made arrangement of these contents, in this order. */
export function preset(ids: string[], kind: TilePreset): TileNode | null {
  if (ids.length === 0) return null
  if (ids.length === 1) return { id: ids[0] }
  switch (kind) {
    case 'side':
      return balanced(ids, 'row')
    case 'stack':
      return balanced(ids, 'col')
    case 'main':
      // The first content takes the left 60 %; the others share the right side, one above the other.
      return { dir: 'row', ratio: 0.6, a: { id: ids[0] }, b: balanced(ids.slice(1), 'col') }
    case 'grid': {
      const rows = Math.ceil(Math.sqrt(ids.length))
      const per = Math.ceil(ids.length / rows)
      const lines: string[][] = []
      for (let i = 0; i < ids.length; i += per) lines.push(ids.slice(i, i + per))
      const items = lines.map((line) => balanced(line, 'row'))
      const stackRows = (list: TileNode[]): TileNode => {
        if (list.length === 1) return list[0]
        const k = Math.floor(list.length / 2)
        return { dir: 'col', ratio: k / list.length, a: stackRows(list.slice(0, k)), b: stackRows(list.slice(k)) }
      }
      return stackRows(items)
    }
  }
}
