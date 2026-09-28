import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { deckHostId, deckUrl, resolveDeckRequest } from '../src/main/deckPaths'

const folder = path.resolve('C:/decks/week 8')

describe('deck paths', () => {
  it('maps a deck folder and entry page to a deck:// url on the folder host', () => {
    const r = deckUrl(folder, 'Week%208.html', 'projector')
    expect(r.host).toMatch(/^[0-9a-f]{16}$/)
    expect(r.url).toBe(`deck://${r.host}/Week%208.html?tabId=projector`)
  })
  it('adds the screen id to an entry that already has a query', () => {
    const r = deckUrl(folder, '__presenter__/pdfdeck.html?file=deck.pdf', 'next')
    expect(r.url).toBe(`deck://${r.host}/__presenter__/pdfdeck.html?file=deck.pdf&tabId=next`)
  })
  it('gives the same host to the same folder in any letter case', () => {
    expect(deckHostId('C:/Decks/A')).toBe(deckHostId('c:/decks/a'))
  })
  it('resolves files and sub-folders inside the deck folder', () => {
    expect(resolveDeckRequest(folder, '/Week%208.html')).toBe(path.join(folder, 'Week 8.html'))
    expect(resolveDeckRequest(folder, '/assets/img%201.png')).toBe(path.join(folder, 'assets', 'img 1.png'))
  })
  it('rejects paths that leave the deck folder', () => {
    expect(resolveDeckRequest(folder, '/%2e%2e/secret.txt')).toBeNull()
    expect(resolveDeckRequest(folder, '/..%5C..%5Cwindows%5Cwin.ini')).toBeNull()
  })
})
