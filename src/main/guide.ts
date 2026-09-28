import { app, clipboard, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import aiDoc from '../../docs/ai-integration.md?raw'
import protocolDoc from '../../docs/protocol.md?raw'
import exampleDeck from '../../examples/minimal-deck.html?raw'
import { aiRequestText, type GuideFile } from '../shared/guide'

/** The deck guide's texts, built into the app so the guide works offline and after packaging. */
export const AI_REQUEST = aiRequestText(aiDoc)

const FILES: Record<GuideFile, { name: string; extension: string; text: string }> = {
  'ai-request': { name: 'Presenter AI request.txt', extension: 'txt', text: AI_REQUEST },
  'example-deck': { name: 'Presenter example deck.html', extension: 'html', text: exampleDeck },
  protocol: { name: 'Presenter deck protocol.md', extension: 'md', text: protocolDoc }
}

export function copyText(text: string): void {
  clipboard.writeText(text)
}

/** Save dialog in the teacher's Documents folder; returns the saved path, or null when cancelled. */
export async function saveGuideFile(win: BrowserWindow, which: GuideFile, title: string): Promise<string | null> {
  const file = FILES[which]
  if (!file) return null
  const result = await dialog.showSaveDialog(win, {
    title,
    defaultPath: path.join(app.getPath('documents'), file.name),
    filters: [{ name: file.extension.toUpperCase(), extensions: [file.extension] }]
  })
  if (result.canceled || !result.filePath) return null
  fs.writeFileSync(result.filePath, file.text, 'utf8')
  return result.filePath
}
