import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { withMedia } from '../src/main/convert'
import { readPptxSlides } from '../src/main/pptxMeta'
import { byteRange } from '../src/shared/byteRange'

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** One slide: an embedded video at (10 %, 10 %), half the slide; a linked sound inside a group that doubles its children. */
function pptx(): Uint8Array {
  const slide = `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="4" name="clip"/><p:cNvPicPr/><p:nvPr><a:videoFile r:link="rId3"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media r:embed="rId2"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill/><p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm></p:spPr></p:pic>
    <p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="6096000" y="3429000"/><a:ext cx="2000000" cy="2000000"/><a:chOff x="0" y="0"/><a:chExt cx="1000000" cy="1000000"/></a:xfrm></p:grpSpPr>
      <p:pic><p:nvPicPr><p:cNvPr id="6" name="sound"/><p:cNvPicPr/><p:nvPr><a:audioFile r:link="rId4"/></p:nvPr></p:nvPicPr><p:blipFill/><p:spPr><a:xfrm><a:off x="500000" y="0"/><a:ext cx="500000" cy="500000"/></a:xfrm></p:spPr></p:pic>
    </p:grpSp>
  </p:spTree></p:cSld></p:sld>`
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/media1.mp4"/>
    <Relationship Id="rId3" Type="${REL}/video" Target="../media/media1.mp4"/>
    <Relationship Id="rId4" Type="${REL}/audio" Target="bell.wav" TargetMode="External"/></Relationships>`
  return zipSync({
    'ppt/presentation.xml': strToU8(`<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId7"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${REL}/slide" Target="slides/slide1.xml"/></Relationships>`),
    'ppt/slides/slide1.xml': strToU8(slide),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(rels),
    'ppt/media/media1.mp4': new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])
  })
}

describe('videos and sounds in a PPTX', () => {
  it('finds a video and a sound with their places on the slide (also inside a group)', () => {
    const [slide] = readPptxSlides(pptx())
    expect(slide.media).toHaveLength(2)
    const [video, sound] = slide.media ?? []
    expect(video).toMatchObject({ kind: 'video', part: 'ppt/media/media1.mp4', link: null })
    expect(video.x).toBeCloseTo(0.1)
    expect(video.y).toBeCloseTo(0.1)
    expect(video.w).toBeCloseTo(0.5)
    expect(video.h).toBeCloseTo(0.5)
    expect(sound).toMatchObject({ kind: 'audio', part: null, link: 'bell.wav' })
    expect(sound.x).toBeCloseTo(7096000 / 12192000)
    expect(sound.y).toBeCloseTo(0.5)
    expect(sound.w).toBeCloseTo(1000000 / 12192000)
  })
  it('copies the files next to the converted pages; a linked file is taken from beside the PPTX', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presenter-media-'))
    const file = path.join(dir, 'deck.pptx')
    fs.writeFileSync(file, pptx())
    fs.writeFileSync(path.join(dir, 'bell.wav'), new Uint8Array([82, 73, 70, 70]))
    const work = path.join(dir, 'work')
    fs.mkdirSync(work)
    const [slide] = withMedia(file, readPptxSlides(fs.readFileSync(file)), work)
    expect(slide.media?.map((m) => m.file)).toEqual(['media/1.mp4', 'media/2.wav'])
    expect(fs.readFileSync(path.join(work, 'media/1.mp4')).length).toBe(8)
    expect(fs.readFileSync(path.join(work, 'media/2.wav')).length).toBe(4)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('leaves out a file that cannot be found', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presenter-media-'))
    const file = path.join(dir, 'deck.pptx')
    fs.writeFileSync(file, pptx())
    const work = path.join(dir, 'work')
    fs.mkdirSync(work)
    const [slide] = withMedia(file, readPptxSlides(fs.readFileSync(file)), work)
    expect(slide.media?.map((m) => m.kind)).toEqual(['video'])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('byteRange', () => {
  it('reads the ranges a video player asks for', () => {
    expect(byteRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(byteRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(byteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })
  it('refuses ranges that do not fit', () => {
    expect(byteRange('bytes=2000-', 1000)).toBeNull()
    expect(byteRange(null, 1000)).toBeNull()
    expect(byteRange('items=0-1', 1000)).toBeNull()
  })
})
