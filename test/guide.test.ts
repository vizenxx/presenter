import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { aiRequestText } from '../src/shared/guide'

describe('aiRequestText', () => {
  it('takes the paste-ready block out of docs/ai-integration.md', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ai-integration.md'), 'utf8')
    const text = aiRequestText(doc)
    expect(text.startsWith('Build the deck so it works with the "Presenter" classroom app')).toBe(true)
    expect(text).toContain('PresenterBridge.connect({')
    expect(text).not.toContain('````')
  })
  it('returns an empty string when the block is missing', () => {
    expect(aiRequestText('# nothing here')).toBe('')
  })
})
