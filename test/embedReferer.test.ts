import { describe, expect, it } from 'vitest'
import { APP_REFERER, embedReferer } from '../src/shared/embedReferer'

describe('embedReferer', () => {
  it('names the app when a deck page sends no Referer', () => {
    expect(embedReferer(undefined)).toBe(APP_REFERER)
    expect(embedReferer('')).toBe(APP_REFERER)
  })
  it('replaces a deck:// or file:// Referer', () => {
    expect(embedReferer('deck://abc/')).toBe(APP_REFERER)
    expect(embedReferer('file:///C:/deck.html')).toBe(APP_REFERER)
  })
  it('keeps a web Referer', () => {
    expect(embedReferer('https://www.youtube-nocookie.com/embed/x')).toBeNull()
    expect(embedReferer('http://localhost:5173/')).toBeNull()
  })
})
