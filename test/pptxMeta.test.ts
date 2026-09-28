import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readPptxSlides } from '../src/main/pptxMeta'

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

const shape = (ph: string, ...paras: string[]): string =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${paras
    .map((t) => `<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p>`)
    .join('')}</p:txBody></p:sp>`

const slide = (shapes: string, hidden = false): string =>
  `<?xml version="1.0"?><p:sld ${NS}${hidden ? ' show="0"' : ''}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`

const notes = (text: string[]): string =>
  `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>${shape('<p:ph type="sldImg"/>')}${shape('<p:ph type="body" idx="1"/>', ...text)}${shape('<p:ph type="sldNum" idx="5"/>', '3')}</p:spTree></p:cSld></p:notes>`

const rels = (items: Array<[string, string, string]>): string =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`)
    .join('')}</Relationships>`

/** A minimal PPTX: slide order in presentation.xml differs from file names; slide 3 is hidden. */
function fixture(): Uint8Array {
  return zipSync({
    'ppt/presentation.xml': strToU8(`<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(rels([['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'slide', 'slides/slide2.xml'], ['rId4', 'slide', 'slides/slide3.xml']])),
    'ppt/slides/slide1.xml': strToU8(slide(shape('<p:ph type="title"/>', 'Second &amp; Last') + shape('<p:ph idx="1"/>', 'body text'))),
    'ppt/slides/slide2.xml': strToU8(slide(shape('<p:ph type="ctrTitle"/>', 'Opening') + shape('<p:ph type="subTitle" idx="1"/>', 'Week 1'))),
    'ppt/slides/slide3.xml': strToU8(slide(shape('<p:ph type="title"/>', 'Hidden one'), true)),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout2.xml'], ['rId2', 'notesSlide', '../notesSlides/notesSlide7.xml']])),
    'ppt/slides/_rels/slide2.xml.rels': strToU8(rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']])),
    'ppt/notesSlides/notesSlide7.xml': strToU8(notes(['Ask the class first.', 'Then show the answer.']))
  })
}

describe('readPptxSlides', () => {
  it('follows the presentation order and skips hidden slides', () => {
    const slides = readPptxSlides(fixture())
    expect(slides.map((s) => s.title)).toEqual(['Opening', 'Second & Last'])
  })
  it('reads speaker notes paragraph by paragraph, without the slide number', () => {
    const slides = readPptxSlides(fixture())
    expect(slides[1].notes).toBe('Ask the class first.\nThen show the answer.')
    expect(slides[0].notes).toBe('')
  })
  it('falls back to the first text on a slide without a title placeholder', () => {
    const data = zipSync({
      'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`),
      'ppt/_rels/presentation.xml.rels': strToU8(rels([['rId2', 'slide', 'slides/slide1.xml']])),
      'ppt/slides/slide1.xml': strToU8(slide(shape('', 'Free text box')))
    })
    expect(readPptxSlides(data)).toEqual([{ title: 'Free text box', notes: '' }])
  })
})
