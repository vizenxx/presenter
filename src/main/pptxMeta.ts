import { strFromU8, unzipSync } from 'fflate'

/** What the console needs per slide: the title (slide list) and the speaker notes (备注); and its videos and sounds. */
export interface SlideInfo {
  title: string
  notes: string
  media?: SlideMedia[]
}

/** A video or a sound on a slide: where it is (fractions of the slide) and where its file is. */
export interface SlideMedia {
  kind: 'video' | 'audio'
  x: number
  y: number
  w: number
  h: number
  /** The file inside the PPTX (ppt/media/…), or null when it is linked from outside. */
  part: string | null
  /** A linked file outside the PPTX, as the PPTX writes it (a path or a file: URL), or null. */
  link: string | null
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A shape's or group's frame (EMU): position and size, and for a group the frame of its children. */
function frameOf(xml: string): { box: Box; child: Box | null } | null {
  const xfrm = /<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(xml)
  if (!xfrm) return null
  const pair = (tag: string, a: string, b: string): [number, number] | null => {
    const m = new RegExp(`<a:${tag}\\b[^>]*\\b${a}="(-?\\d+)"[^>]*\\b${b}="(-?\\d+)"`).exec(xfrm[1])
    return m ? [Number(m[1]), Number(m[2])] : null
  }
  const off = pair('off', 'x', 'y')
  const ext = pair('ext', 'cx', 'cy')
  if (!off || !ext) return null
  const chOff = pair('chOff', 'x', 'y')
  const chExt = pair('chExt', 'cx', 'cy')
  return { box: { x: off[0], y: off[1], w: ext[0], h: ext[1] }, child: chOff && chExt ? { x: chOff[0], y: chOff[1], w: chExt[0], h: chExt[1] } : null }
}

/** A relationship by id: its target and whether it points outside the package. */
function relationship(rels: string, id: string): { target: string; external: boolean } | null {
  for (const rel of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    if (!rel.includes(`Id="${id}"`)) continue
    const target = /\bTarget="([^"]+)"/.exec(rel)?.[1]
    if (!target) return null
    return { target: decode(target), external: /\bTargetMode="External"/.test(rel) }
  }
  return null
}

/**
 * The videos and sounds of one slide, in fractions of the slide. Pictures inside groups are
 * placed through the groups' frames. An embedded file (PowerPoint 2010+ p14:media) wins over a link.
 */
export function slideMedia(xml: string, rels: string, slideDir: string, size: { cx: number; cy: number }): SlideMedia[] {
  const out: SlideMedia[] = []
  const groups: Array<{ box: Box; child: Box | null } | null> = []
  for (const m of xml.matchAll(/<p:grpSp>|<\/p:grpSp>|<p:grpSpPr\b[^>]*>[\s\S]*?<\/p:grpSpPr>|<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g)) {
    const token = m[0]
    if (token === '<p:grpSp>') groups.push(null)
    else if (token === '</p:grpSp>') groups.pop()
    else if (token.startsWith('<p:grpSpPr')) {
      if (groups.length > 0) groups[groups.length - 1] = frameOf(token)
    } else {
      const video = /<a:videoFile\b[^>]*\br:link="([^"]+)"/.exec(token)
      const audio = /<a:audioFile\b[^>]*\br:link="([^"]+)"/.exec(token)
      if (!video && !audio) continue
      const embed = /<p14:media\b[^>]*\br:embed="([^"]+)"/.exec(token)
      const frame = frameOf(/<p:spPr\b[^>]*>[\s\S]*?<\/p:spPr>/.exec(token)?.[0] ?? '')
      if (!frame) continue
      let box = frame.box
      // Inner groups first: each maps its children's frame onto its own frame.
      for (let g = groups.length - 1; g >= 0; g--) {
        const group = groups[g]
        if (!group || !group.child || group.child.w === 0 || group.child.h === 0) continue
        const sx = group.box.w / group.child.w
        const sy = group.box.h / group.child.h
        box = { x: group.box.x + (box.x - group.child.x) * sx, y: group.box.y + (box.y - group.child.y) * sy, w: box.w * sx, h: box.h * sy }
      }
      const embedded = embed ? relationship(rels, embed[1]) : null
      const linked = relationship(rels, (video ?? audio)?.[1] ?? '')
      const file = embedded && !embedded.external ? embedded : linked
      if (!file) continue
      const clamp = (v: number): number => Math.min(1, Math.max(0, v))
      out.push({
        kind: video ? 'video' : 'audio',
        x: clamp(box.x / size.cx),
        y: clamp(box.y / size.cy),
        w: clamp(box.w / size.cx),
        h: clamp(box.h / size.cy),
        part: file.external ? null : resolvePart(slideDir, file.target),
        link: file.external ? file.target : null
      })
    }
  }
  return out
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? _
    return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  })
}

/** Non-empty paragraph texts: each <a:p> joins its <a:t> runs. */
function paragraphs(xml: string): string[] {
  const out: string[] = []
  for (const p of xml.match(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g) ?? []) {
    const text = (p.match(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>/g) ?? []).map((t) => decode(t.replace(/<\/?a:t(?:\s[^>]*)?>/g, ''))).join('')
    if (text.trim()) out.push(text.trim())
  }
  return out
}

/** Text shapes (<p:sp> cannot nest, so a lazy match is exact). */
function shapes(xml: string): string[] {
  return xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []
}

/** Placeholder type of a shape; a placeholder without a type is a body placeholder. */
function placeholderType(shape: string): string | null {
  const ph = /<p:ph\b([^>]*)>/.exec(shape)
  if (!ph) return null
  return /\btype="([^"]+)"/.exec(ph[1])?.[1] ?? 'body'
}

function relationshipTarget(rels: string, match: (rel: string) => boolean): string | null {
  for (const rel of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    if (match(rel)) return /\bTarget="([^"]+)"/.exec(rel)?.[1] ?? null
  }
  return null
}

/** Resolves a relationship target against the folder of the part that points to it. */
function resolvePart(fromDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const out: string[] = []
  for (const part of (fromDir + target).split('/')) {
    if (part === '..') out.pop()
    else if (part && part !== '.') out.push(part)
  }
  return out.join('/')
}

/**
 * Titles and speaker notes of the slides a show (and a PDF export) contains:
 * presentation order, hidden slides left out.
 */
export function readPptxSlides(data: Uint8Array): SlideInfo[] {
  const files = unzipSync(data, { filter: (f) => f.name.startsWith('ppt/') && (f.name.endsWith('.xml') || f.name.endsWith('.rels')) })
  const text = (name: string): string => (files[name] ? strFromU8(files[name]) : '')
  const presentation = text('ppt/presentation.xml')
  const presentationRels = text('ppt/_rels/presentation.xml.rels')
  const slideIds = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => m[1])
  const sizeTag = /<p:sldSz\b[^>]*>/.exec(presentation)?.[0] ?? ''
  const size = { cx: Number(/\bcx="(\d+)"/.exec(sizeTag)?.[1] ?? 12192000), cy: Number(/\bcy="(\d+)"/.exec(sizeTag)?.[1] ?? 6858000) }

  const slides: SlideInfo[] = []
  for (const rid of slideIds) {
    const target = relationshipTarget(presentationRels, (rel) => rel.includes(`Id="${rid}"`))
    if (!target) continue
    const slidePath = resolvePart('ppt/', target)
    const xml = text(slidePath)
    if (!xml || /<p:sld\b[^>]*\bshow="0"/.test(xml)) continue

    const slideShapes = shapes(xml)
    const titleShapes = slideShapes.filter((s) => {
      const type = placeholderType(s)
      return type === 'title' || type === 'ctrTitle'
    })
    const title = (titleShapes.length > 0 ? titleShapes.flatMap(paragraphs).join(' ') : paragraphs(xml)[0] ?? '').slice(0, 120)

    const slideDir = slidePath.slice(0, slidePath.lastIndexOf('/') + 1)
    const slideRels = text(`${slideDir}_rels/${slidePath.slice(slideDir.length)}.rels`)
    const notesTarget = relationshipTarget(slideRels, (rel) => /\/notesSlide"/.test(rel))
    let notes = ''
    if (notesTarget) {
      const notesXml = text(resolvePart(slideDir, notesTarget))
      notes = shapes(notesXml)
        .filter((s) => placeholderType(s) === 'body')
        .flatMap(paragraphs)
        .join('\n')
    }
    const media = slideMedia(xml, slideRels, slideDir, size)
    slides.push(media.length > 0 ? { title, notes, media } : { title, notes })
  }
  return slides
}
