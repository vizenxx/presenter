import { net, protocol, type Session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { byteRange } from '../shared/byteRange'
import { resolveDeckRequest } from './deckPaths'

export const DECK_SCHEME = 'deck'
/** Paths under this prefix serve the app's own pages (the PDF/PPT viewer) on every deck host. */
export const VIEWER_PREFIX = '/__presenter__'
const folders = new Map<string, string>()
let viewerRoot: string | null = null

/** Module scripts and workers need an exact JavaScript type. */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
}


/** Must run before app 'ready'. */
export function registerDeckScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: DECK_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
  ])
}

export function registerDeckFolder(host: string, folder: string): void {
  folders.set(host, folder)
}

/** Folder of the built renderer pages (out/renderer). */
export function setViewerRoot(folder: string): void {
  viewerRoot = folder
}

export function installDeckProtocol(ses: Session): void {
  if (ses.protocol.isProtocolHandled(DECK_SCHEME)) return
  ses.protocol.handle(DECK_SCHEME, async (request) => {
    const url = new URL(request.url)
    const viewer = url.pathname.startsWith(`${VIEWER_PREFIX}/`)
    const folder = viewer ? viewerRoot : folders.get(url.hostname)
    if (!folder || (viewer && !folders.has(url.hostname))) return new Response('Unknown deck', { status: 404 })
    const file = resolveDeckRequest(folder, viewer ? url.pathname.slice(VIEWER_PREFIX.length) : url.pathname)
    if (!file) return new Response('Forbidden', { status: 403 })
    try {
      // Videos and sounds ask for parts of the file (to start fast and to seek).
      const type = TYPES[path.extname(file).toLowerCase()]
      if (type && /^(video|audio)\//.test(type)) {
        const size = fs.statSync(file).size
        const range = byteRange(request.headers.get('range'), size)
        if (range) {
          const length = range.end - range.start + 1
          const chunk = Buffer.alloc(length)
          const fd = fs.openSync(file, 'r')
          try {
            fs.readSync(fd, chunk, 0, length, range.start)
          } finally {
            fs.closeSync(fd)
          }
          return new Response(chunk, { status: 206, headers: { 'content-type': type, 'content-length': String(length), 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'accept-ranges': 'bytes' } })
        }
        return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
      }
      const response = await net.fetch(pathToFileURL(file).toString())
      if (!type || !response.ok) return response
      return new Response(response.body, { status: response.status, headers: { 'content-type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
