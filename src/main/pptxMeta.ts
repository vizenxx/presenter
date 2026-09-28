import { strFromU8, unzipSync } from 'fflate'

/** What the console needs per slide: the title (slide list) and the speaker notes (备注). */
export interface SlideInfo {
  title: string
  notes: string
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
    slides.push({ title, notes })
  }
  return slides
}
