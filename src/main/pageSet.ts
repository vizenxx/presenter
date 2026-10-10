/**
 * Fixes for LibreOffice's animated page set (the SVG with its slide show engine), made once after
 * converting. Returns null when the file is not a usable page set.
 * - The engine reports problems with alert boxes, which would stop the slide show on the
 *   projector; they go to the console instead.
 * - A video or sound on a slide points to a temporary file of the conversion (gone by now) and
 *   would start by itself with its own controls: only its picture stays; Presenter plays the file
 *   it took out of the PPTX (media/…) on top, when the teacher asks.
 * - A picture used more than once (a logo on several slide layouts, one photo on several slides)
 *   is written in full once; the other places refer to a shared copy that LibreOffice never
 *   writes, so they showed nothing. The shared copy is added.
 * - A font named without a second choice gets one (sans-serif), for computers without that font.
 */
export function finishPageSet(svg: string): string | null {
  if (!/ooo:number-of-slides="[1-9]/.test(svg) || !svg.includes('function SlideShow(')) return null
  const start = svg.indexOf('<script')
  const end = svg.lastIndexOf('</script>')
  if (start < 0 || end < start) return null
  // A font this computer does not have: without a second choice the browser shows a serif font;
  // LibreOffice's still pages show a sans-serif one, as most slide fonts are. (Not in the engine's code.)
  const fonts = (part: string): string => part.replace(/font-family="([^",]+)"/g, (all: string, name: string) => (/ embedded$/.test(name) ? all : `font-family="${name}, sans-serif"`))
  let out = fonts(svg.slice(0, start)) + svg.slice(start, end).replace(/\balert\(/g, 'console.error(') + fonts(svg.slice(end))
  out = out
    .replace(/<source\s[^>]*src="file:[^"]*"[^>]*\/>/g, '')
    .replace(/<(?:video|audio)[^>]*>/g, (tag) => tag.replace(/ (?:autoplay|controls|loop)="[^"]*"/g, ''))
  return repairSharedBitmaps(out)
}

const USE =
  /(<rect class="BoundingBox" stroke="none" fill="none" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"\/>(?:\s*<(?:g|a)\b[^>]*>)*\s*)<use(?: transform="([^"]*)")? xlink:href="#(bitmap\([^)"]*\))"\/>/g

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

/** The link a picture or a reference sits in (an online video's picture links to the video). */
function linkBefore(text: string): string | null {
  const open = text.lastIndexOf('<a ')
  if (open < 0 || text.indexOf('</a>', open) >= 0) return null
  return /xlink:href="([^"]*)"/.exec(text.slice(open))?.[1] ?? null
}

/**
 * A reference to a shared picture that the file does not define. Its size is known (the box it
 * fills, divided by its scale), so the picture is one written in full at that size. When several
 * different pictures have that size, the one in the same link (the same online video), then the
 * one at the same place, decides. That picture is added once as the shared copy, and each
 * reference places it in its box.
 */
export function repairSharedBitmaps(svg: string): string {
  const defined = new Set([...svg.matchAll(/\bid="(bitmap\([^"]*\))"/g)].map((m) => m[1]))
  const images = [...svg.matchAll(/<image\b[^>]*\/>/g)].map((m) => ({ tag: m[0], link: linkBefore(svg.slice(Math.max(0, (m.index ?? 0) - 400), m.index)) }))
  const copies = new Map<string, { tag: string; width: number; height: number }>()
  const out = svg.replace(USE, (all: string, rect: string, x: string, y: string, w: string, h: string, transform: string | undefined, id: string) => {
    if (defined.has(id)) return all
    let copy = copies.get(id)
    if (!copy) {
      const scale = /scale\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/.exec(transform ?? '')
      const width = Number(w) / (scale ? Number(scale[1]) : 1)
      const height = Number(h) / (scale ? Number(scale[2]) : 1)
      const link = linkBefore(rect)
      const sized = images.filter((i) => Math.abs(Number(attr(i.tag, 'width')) - width) <= 2 && Math.abs(Number(attr(i.tag, 'height')) - height) <= 2)
      const sameLink = link ? sized.filter((i) => i.link === link) : []
      const samePlace = sized.filter((i) => attr(i.tag, 'x') === x && attr(i.tag, 'y') === y)
      const one = (list: typeof images): string | null => {
        const pictures = new Set(list.map((i) => attr(i.tag, 'xlink:href')))
        return list.length > 0 && pictures.size === 1 ? list[0].tag : null
      }
      // Different pictures and nothing to tell them apart: the place stays empty, as before.
      const source = one(sized) ?? one(sameLink) ?? one(samePlace)
      if (!source) return all
      const w0 = Number(attr(source, 'width'))
      const h0 = Number(attr(source, 'height'))
      const aspect = attr(source, 'preserveAspectRatio') ?? 'none'
      copy = { tag: `<image id="${id}" x="0" y="0" width="${w0}" height="${h0}" preserveAspectRatio="${aspect}" xlink:href="${attr(source, 'xlink:href')}"/>`, width: w0, height: h0 }
      copies.set(id, copy)
    }
    return `${rect}<use transform="translate(${x}, ${y}) scale(${Number(w) / copy.width}, ${Number(h) / copy.height})" xlink:href="#${id}"/>`
  })
  if (copies.size === 0) return svg
  const root = out.indexOf('<svg')
  const at = root < 0 ? -1 : out.indexOf('>', root) + 1
  if (at <= 0) return svg
  return `${out.slice(0, at)}<defs class="SharedPictures">${[...copies.values()].map((c) => c.tag).join('')}</defs>${out.slice(at)}`
}
