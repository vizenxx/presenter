import { net, protocol, type Session } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
  '.pdf': 'application/pdf'
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
      const response = await net.fetch(pathToFileURL(file).toString())
      const type = TYPES[path.extname(file).toLowerCase()]
      if (!type || !response.ok) return response
      return new Response(response.body, { status: response.status, headers: { 'content-type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
