import { describe, expect, it } from 'vitest'
import { isNewer, parseVersion, pickAsset } from '../src/shared/version'

describe('parseVersion', () => {
  it('reads release tags and plain versions', () => {
    expect(parseVersion('v0.4.2')).toEqual([0, 4, 2])
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0])
    expect(parseVersion('0.5.0-beta.1')).toEqual([0, 5, 0])
  })
  it('refuses anything else', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('0.4')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })
})

describe('isNewer', () => {
  it('compares number by number, not as text', () => {
    expect(isNewer('v0.4.3', '0.4.2')).toBe(true)
    expect(isNewer('0.10.0', '0.9.9')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  })
  it('is false for the same or an older version', () => {
    expect(isNewer('v0.4.2', '0.4.2')).toBe(false)
    expect(isNewer('0.4.1', '0.4.2')).toBe(false)
  })
  it('is false when either side is not a version', () => {
    expect(isNewer('nightly', '0.4.2')).toBe(false)
    expect(isNewer('0.4.3', 'dev')).toBe(false)
  })
})

describe('pickAsset', () => {
  const base = 'https://github.com/vizenxx/presenter/releases/download/'
  const assets = ['win', 'mac-arm64', 'mac-x64'].map((k) => ({ name: `Presenter-0.4.3-${k}.zip`, size: 5 * 1048576, browser_download_url: `${base}v0.4.3/Presenter-0.4.3-${k}.zip` }))
  it('takes the zip for this computer', () => {
    expect(pickAsset(assets, 'win32', 'x64', base)?.url.endsWith('-win.zip')).toBe(true)
    expect(pickAsset(assets, 'darwin', 'arm64', base)?.url.endsWith('-mac-arm64.zip')).toBe(true)
    expect(pickAsset(assets, 'darwin', 'x64', base)?.mb).toBe(5)
  })
  it('refuses another system and addresses outside the repository', () => {
    expect(pickAsset(assets, 'linux', 'x64', base)).toBeNull()
    expect(pickAsset([{ name: 'Presenter-0.4.3-win.zip', browser_download_url: 'https://evil.example/x-win.zip' }], 'win32', 'x64', base)).toBeNull()
  })
})
