/** "v0.4.2", "0.4.2" or "0.5.0-beta.1" as [major, minor, patch]; null when it is not a version. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** True when `latest` is a higher version than `current` (anything that is not a version is never newer). */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

export interface ReleaseAsset {
  name?: unknown
  size?: unknown
  browser_download_url?: unknown
}

/** The zip for this computer: …-win.zip, …-mac-arm64.zip or …-mac-x64.zip; its address must start with `base`. */
export function pickAsset(assets: ReleaseAsset[], platform: string, arch: string, base: string): { url: string; mb: number } | null {
  const want = platform === 'win32' ? '-win.zip' : platform === 'darwin' ? (arch === 'arm64' ? '-mac-arm64.zip' : '-mac-x64.zip') : null
  if (!want) return null
  const a = assets.find((x) => typeof x.name === 'string' && x.name.endsWith(want) && typeof x.browser_download_url === 'string')
  if (!a) return null
  const url = a.browser_download_url as string
  return url.startsWith(base) ? { url, mb: typeof a.size === 'number' ? Math.round(a.size / 1048576) : 0 } : null
}
