import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertSlides, installedConverters, prepareDeck, type Converter, type DeckMeta } from '../src/main/convert'

/**
 * Real conversions with the installed PowerPoint / LibreOffice. Slow and machine-bound,
 * so they run only when asked: PRESENTER_CONVERT_IT=libreoffice (or powerpoint).
 * PowerPoint runs invisibly, but do not run it while a class is on the projector.
 */
const wanted = process.env['PRESENTER_CONVERT_IT'] as Converter | undefined
// Tests run from the project folder; the sample deck sits next to it on the maintainer's computer.
const SAMPLE = process.env['PRESENTER_SAMPLE_PPTX'] ?? path.resolve('../2026-Autumn/UXD202/Original Slides/UXD202 Lecture n7.pptx')

async function pdfPages(file: string): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise
  return doc.numPages
}

describe.skipIf(!wanted)('real conversion', () => {
  it(`converts a PPTX with ${wanted} and keeps titles aligned with pages`, async () => {
    expect(installedConverters()).toContain(wanted)
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'presenter-convert-'))
    const t0 = Date.now()
    const folder = await convertSlides(path.resolve(SAMPLE), { cacheRoot, converters: [wanted as Converter] })
    const firstMs = Date.now() - t0
    const meta = JSON.parse(fs.readFileSync(path.join(folder, 'meta.json'), 'utf8')) as DeckMeta
    const pages = await pdfPages(path.join(folder, 'deck.pdf'))
    console.log(`${wanted}: ${pages} pages, ${meta.slides.length} titles, ${firstMs} ms`)
    expect(pages).toBeGreaterThan(0)
    expect(meta.slides.length).toBe(pages)

    const t1 = Date.now()
    const prepared = await prepareDeck(SAMPLE, { cacheRoot, converters: [wanted as Converter] })
    expect(prepared.folder).toBe(folder)
    expect(Date.now() - t1).toBeLessThan(1000)
    expect(prepared.entry).toBe('__presenter__/pdfdeck.html?file=deck.pdf&meta=meta.json')
  }, 240_000)
})
