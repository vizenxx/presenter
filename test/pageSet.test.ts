import { describe, expect, it } from 'vitest'
import { finishPageSet, repairSharedBitmaps } from '../src/main/pageSet'

const engine = '<script type="text/ecmascript"><![CDATA[ function SlideShow() {} function stop(m) { alert( m ) } ]]></script>'
const page = (body: string): string => `<svg><defs><g id="ooo:meta_slides" ooo:number-of-slides="2"/></defs>${body}${engine}</svg>`
const box = (x: number, y: number, w: number, h: number): string => `<rect class="BoundingBox" stroke="none" fill="none" x="${x}" y="${y}" width="${w}" height="${h}"/>`

describe('LibreOffice page set fixes', () => {
  it('refuses a file without slides or without the slide show engine', () => {
    expect(finishPageSet('<svg></svg>')).toBeNull()
    expect(finishPageSet('<svg><g ooo:number-of-slides="0"/><script>function SlideShow(){}</script></svg>')).toBeNull()
  })

  it('turns alert boxes into console messages, only in the engine', () => {
    const out = finishPageSet(page('<text>alert( shown as text )</text>')) as string
    expect(out).toContain('console.error( m )')
    expect(out).toContain('<text>alert( shown as text )</text>')
  })

  it('keeps a video picture but not its temporary file, autoplay or controls', () => {
    const out = finishPageSet(page('<video width="10" height="5" autoplay="autoplay" controls="controls" loop="loop" preload="auto" poster="data:image/png;base64,AA"><source src="file:///C:/Temp/1E6A.tmp" type="video/mp4"/></video>')) as string
    expect(out).toContain('<video width="10" height="5" preload="auto" poster="data:image/png;base64,AA">')
    expect(out).not.toContain('file:///')
  })

  it('gives a font without a second choice one (sans-serif), outside the engine only', () => {
    const quiet = '<script type="text/ecmascript"><![CDATA[ function SlideShow() {} var a = \'font-family="Engine Font"\' ]]></script>'
    const svg = `<svg><defs><g id="ooo:meta_slides" ooo:number-of-slides="1"/></defs>${quiet}<text font-family="Helvetica Neue">a</text><text font-family="Arial, sans-serif">b</text><font font-family="Arial embedded"/></svg>`
    const out = finishPageSet(svg) as string
    expect(out).toContain('<text font-family="Helvetica Neue, sans-serif">a</text>')
    expect(out).toContain('<text font-family="Arial, sans-serif">b</text>')
    expect(out).toContain('<font font-family="Arial embedded"/>')
    expect(out).toContain('font-family="Engine Font"\'')
  })

  it('adds the shared copy of a picture used again, once, and places each use in its box', () => {
    const logo = '<image x="23235" y="-351" width="2165" height="3078" preserveAspectRatio="none" xlink:href="data:image/png;base64,LOGO"/>'
    const svg = [
      '<svg version="1.2">',
      `<g class="Graphic"><g>${box(23235, -351, 2165, 3078)}${logo}</g></g>`,
      `<g class="Graphic"><g>${box(23235, -351, 2165, 3078)}\n<use transform="translate(0, 0)" xlink:href="#bitmap(1155201799)"/></g></g>`,
      `<g class="Graphic"><g>${box(100, 200, 1082.5, 1539)}\n<use transform="translate(-11222, -5954) scale(0.5, 0.5)" xlink:href="#bitmap(1155201799)"/></g></g>`,
      '</svg>'
    ].join('\n')
    const out = repairSharedBitmaps(svg)
    expect(out.split('data:image/png;base64,LOGO').length - 1).toBe(2)
    expect(out).toContain('<svg version="1.2"><defs class="SharedPictures"><image id="bitmap(1155201799)" x="0" y="0" width="2165" height="3078"')
    expect(out).toContain('<use transform="translate(23235, -351) scale(1, 1)" xlink:href="#bitmap(1155201799)"/>')
    expect(out).toContain('<use transform="translate(100, 200) scale(0.5, 0.5)" xlink:href="#bitmap(1155201799)"/>')
  })

  it('tells pictures of one size apart by their link (an online video), inside a group or a link', () => {
    const thumb = (video: string, data: string): string => `<g>${box(423, 9679, 7440, 4185)}<a xlink:href="http://www.youtube.com/watch?v=${video}"><image x="423" y="9679" width="7440" height="4185" preserveAspectRatio="none" xlink:href="data:${data}"/></a></g>`
    const svg = [
      '<svg>',
      thumb('AAA', 'ONE'),
      thumb('BBB', 'TWO'),
      `<g>${box(423, 9679, 7440, 4185)} <a xlink:href="http://www.youtube.com/watch?v=BBB"> <use transform="translate(0, 0)" xlink:href="#bitmap(2448334097)"/></a></g>`,
      `<g>${box(10, 20, 7440, 4185)}<g style="opacity: 0.5"><use transform="translate(0, 0)" xlink:href="#bitmap(2448334097)"/></g></g>`,
      '</svg>'
    ].join(' ')
    const out = repairSharedBitmaps(svg)
    expect(out).toContain('<image id="bitmap(2448334097)" x="0" y="0" width="7440" height="4185" preserveAspectRatio="none" xlink:href="data:TWO"/>')
    expect(out).toContain('<a xlink:href="http://www.youtube.com/watch?v=BBB"> <use transform="translate(423, 9679) scale(1, 1)" xlink:href="#bitmap(2448334097)"/>')
    expect(out).toContain('<g style="opacity: 0.5"><use transform="translate(10, 20) scale(1, 1)" xlink:href="#bitmap(2448334097)"/>')
  })

  it('leaves a reference the file defines, and one it cannot be sure of', () => {
    const defined = `<svg><defs><g id="bitmap(7)"><image x="0" y="0" width="5" height="5" xlink:href="data:A"/></g></defs><g>${box(1, 1, 5, 5)}<use transform="translate(1, 1)" xlink:href="#bitmap(7)"/></g></svg>`
    expect(repairSharedBitmaps(defined)).toBe(defined)
    const unknown = `<svg><g>${box(1, 1, 9, 9)}<use transform="translate(0, 0)" xlink:href="#bitmap(8)"/></g></svg>`
    expect(repairSharedBitmaps(unknown)).toBe(unknown)
    const twoOfThatSize = `<svg><image x="0" y="0" width="9" height="9" xlink:href="data:A"/><image x="5" y="5" width="9" height="9" xlink:href="data:B"/><g>${box(1, 1, 9, 9)}<use transform="translate(0, 0)" xlink:href="#bitmap(9)"/></g></svg>`
    expect(repairSharedBitmaps(twoOfThatSize)).toBe(twoOfThatSize)
  })
})
