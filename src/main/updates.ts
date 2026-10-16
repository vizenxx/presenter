import { app, net, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { isNewer, pickAsset, type ReleaseAsset } from '../shared/version'
import type { LinkKind, UpdateView } from '../shared/types'

const REPO = 'vizenxx/presenter'
const REPO_URL = `https://github.com/${REPO}`
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
const TIMEOUT_MS = 10_000

/** Whether to look for a newer version when Presenter starts. Off unless the teacher turns it on. */
const file = (): string => path.join(app.getPath('userData'), 'update.json')

export function loadAutoCheck(): boolean {
  try {
    return (JSON.parse(fs.readFileSync(file(), 'utf8')) as { auto?: unknown }).auto === true
  } catch {
    return false
  }
}

function saveAutoCheck(auto: boolean): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify({ auto }, null, 2))
  } catch {
    // A convenience; a failed write must not stop a class.
  }
}

/**
 * Looks at the newest release on GitHub: one request that sends nothing about the teacher or the computer.
 * It runs only when the teacher clicks "Check for updates", or at start when that is turned on.
 */
export class Updater {
  private view: UpdateView = { status: 'idle', latest: null, newer: false, downloadMb: 0, checkedAt: null, error: null, auto: loadAutoCheck() }
  private downloadUrl: string | null = null
  private latestUrl: string | null = null

  constructor(private readonly changed: () => void) {}

  get(): UpdateView {
    return this.view
  }

  setAuto(auto: boolean): void {
    this.view = { ...this.view, auto }
    saveAutoCheck(auto)
    this.changed()
  }

  async check(): Promise<void> {
    if (this.view.status === 'checking') return
    this.view = { ...this.view, status: 'checking', error: null }
    this.changed()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      const res = await net.fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Presenter/${app.getVersion()}` }, signal: controller.signal }).finally(() => clearTimeout(timer))
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; assets?: unknown }
      const tag = typeof body.tag_name === 'string' ? body.tag_name : ''
      if (!/^v?\d+\.\d+\.\d+/.test(tag)) throw new Error('GitHub sent no version')
      const latest = tag.replace(/^v/, '')
      const newer = isNewer(latest, app.getVersion())
      const asset = pickAsset(Array.isArray(body.assets) ? (body.assets as ReleaseAsset[]) : [], process.platform, process.arch, `${REPO_URL}/releases/download/`)
      this.downloadUrl = newer ? (asset?.url ?? null) : null
      this.latestUrl = typeof body.html_url === 'string' && body.html_url.startsWith(`${REPO_URL}/`) ? body.html_url : `${REPO_URL}/releases/latest`
      this.view = { ...this.view, status: 'ok', latest, newer, downloadMb: asset?.mb ?? 0, checkedAt: Date.now(), error: null }
    } catch (e) {
      const text = e instanceof Error && e.name !== 'AbortError' ? e.message : 'no answer (is the computer online?)'
      this.view = { ...this.view, status: 'error', error: text }
    }
    this.changed()
  }

  /** Opens one of the fixed GitHub pages (or the zip for this computer) in the browser. */
  open(kind: LinkKind): void {
    const url =
      kind === 'github' ? REPO_URL : kind === 'releases' ? `${REPO_URL}/releases` : kind === 'issues' ? `${REPO_URL}/issues` : kind === 'latest' ? (this.latestUrl ?? `${REPO_URL}/releases/latest`) : kind === 'download' ? this.downloadUrl : null
    if (url) void shell.openExternal(url)
  }
}
