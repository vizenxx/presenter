import crypto from 'node:crypto'
import path from 'node:path'

/** One stable, valid host name per deck folder (so each folder is its own origin). */
export function deckHostId(folder: string): string {
  return crypto.createHash('sha1').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0, 16)
}

/** URL of a deck page: `entry` is a path (and query) inside the folder's deck:// host. */
export function deckUrl(folder: string, entry: string, outputId: string): { host: string; url: string } {
  const host = deckHostId(folder)
  const joiner = entry.includes('?') ? '&' : '?'
  return { host, url: `deck://${host}/${entry}${joiner}tabId=${encodeURIComponent(outputId)}` }
}

/** Maps a request path to a file inside the deck folder; null when it would leave the folder. */
export function resolveDeckRequest(folder: string, pathname: string): string | null {
  let rel: string
  try {
    // A backslash is a folder separator on every system here (on a Mac it would otherwise be
    // part of a file name), so "..\" can never step out of the deck folder.
    rel = decodeURIComponent(pathname).replace(/\\/g, '/').replace(/^\/+/, '')
  } catch {
    return null
  }
  const root = path.resolve(folder)
  const full = path.resolve(root, rel)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}
