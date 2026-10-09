/** A "bytes=a-b" range of a file of this size, or null when the header asks for nothing usable. */
export function byteRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!m || (m[1] === '' && m[2] === '') || size === 0) return null
  let start: number
  let end: number
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(size - 1, Number(m[2]))
  }
  return start <= end && start < size ? { start, end } : null
}
