import { describe, expect, it } from 'vitest'
import { deckKind, deckTitle } from '../src/shared/deckKinds'

describe('deckKind', () => {
  it('sorts files by how they are shown', () => {
    expect(deckKind('C:/a/Week 8.html')).toBe('html')
    expect(deckKind('C:/a/b.HTM')).toBe('html')
    expect(deckKind('C:/a/Lecture 1.pptx')).toBe('slides')
    expect(deckKind('C:/a/old.ppt')).toBe('slides')
    expect(deckKind('C:/a/show.ppsx')).toBe('slides')
    expect(deckKind('C:/a/deck.odp')).toBe('slides')
    expect(deckKind('C:/a/handout.pdf')).toBe('pdf')
  })
  it('rejects other files', () => {
    expect(deckKind('C:/a/notes.docx')).toBeNull()
    expect(deckKind('C:/a/noext')).toBeNull()
  })
})

describe('deckTitle', () => {
  it('drops the folder and the extension', () => {
    expect(deckTitle('C:\\a\\UXD202 Lecture n1.pptx')).toBe('UXD202 Lecture n1')
    expect(deckTitle('C:/a/Week-08.html')).toBe('Week-08')
  })
})
