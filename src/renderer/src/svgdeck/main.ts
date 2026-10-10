/**
 * Built-in viewer for LibreOffice's animated page set (deck.svg, made when a PowerPoint file is
 * converted). LibreOffice's own slide show engine, inside that file, plays the click animations and
 * slide transitions; this page drives it and speaks the same sync protocol as the PDF viewer
 * (SLIDE_STATE / PING / GOTO / MEDIA on UXD202_SLIDES_SYNC), plus click steps:
 * - SLIDE_STATE.steps = { count, done }: the click steps of the shown slide and how many have played.
 * - STEP { dir: 1 | -1 }: play the next step, or take the last one back.
 * - GOTO to the next slide plays its transition and shows it before its steps; GOTO to the slide
 *   before shows it with all its steps (as when going back in PowerPoint); other jumps show the
 *   slide before its steps. The next-slide preview (preview=1) always shows a slide with all its steps.
 */
import { mediaLayer, type SlideMedia } from '../deckMedia'

interface SlideMeta {
  title: string
  notes?: string
  media?: SlideMedia[]
}

/** The parts of LibreOffice's engine that are used (globals in the page set's own window). */
interface Engine {
  aSlideShow?: {
    displaySlide(index: number, skipTransition: boolean): void
    nextEffect(): boolean
    rewindEffect(): void
    skipAllEffects(): boolean
    nCurrentEffect: number
    aNextEffectEventArray: { size(): number } | null
  }
  theMetaDoc?: { nNumberOfSlides: number }
  nCurSlide?: number
}

const OOO = 'http://xml.openoffice.org/svg/export'
const params = new URLSearchParams(location.search)
const tabId = params.get('tabId') ?? ''
const preview = params.get('preview') === '1'
const fileUrl = `/${params.get('file') ?? ''}`
const metaName = params.get('meta')
const channel = new BroadcastChannel('UXD202_SLIDES_SYNC')
const frame = document.getElementById('deck') as HTMLIFrameElement
const message = document.getElementById('message') as HTMLDivElement
const media = mediaLayer(document.getElementById('media') as HTMLDivElement, () => report())

let engine: Engine | null = null
let slides: SlideMeta[] = []
/** Click steps per slide, counted in the page set (the engine learns them one by one as they play). */
let clickCounts: number[] = []
/** The slide whose videos are laid out, and the last state reported. */
let mediaSlide = -1
let lastKey = ''

function show(): NonNullable<Engine['aSlideShow']> | null {
  return engine?.aSlideShow ?? null
}

function current(): number {
  return engine?.nCurSlide ?? 0
}

function total(): number {
  return engine?.theMetaDoc?.nNumberOfSlides ?? 0
}

function steps(): { count: number; done: number } {
  const count = clickCounts[current()] ?? 0
  return { count, done: Math.min(count, show()?.nCurrentEffect ?? 0) }
}

function report(): void {
  if (!engine) return
  const i = current()
  channel.postMessage({
    type: 'SLIDE_STATE',
    tabId,
    currentSlide: i,
    totalSlides: total(),
    currentTitle: slides[i]?.title ?? '',
    metadata: slides.map(({ title, notes }) => ({ title, notes })),
    media: { kinds: (slides[i]?.media ?? []).map((m) => m.kind), playing: media.playing() },
    steps: steps(),
    milestones: [],
    ownTimer: false
  })
}

/** Reports every change, also those the engine makes by itself (slides that move on after a time). */
function watch(): void {
  if (!engine) return
  const i = current()
  if (i !== mediaSlide) {
    mediaSlide = i
    media.show(slides[i]?.media)
  }
  const s = steps()
  const key = `${i}|${s.done}|${s.count}`
  if (key !== lastKey) {
    lastKey = key
    report()
  }
}

function goto(index: number): void {
  const s = show()
  if (!s || total() === 0) return
  const target = Math.min(Math.max(0, Math.round(index)), total() - 1)
  const from = current()
  if (preview) {
    if (target !== from || steps().done < steps().count) {
      s.displaySlide(target, true)
      s.skipAllEffects()
    }
  } else if (target === from + 1) s.displaySlide(target, false)
  else if (target === from - 1) {
    s.displaySlide(target, true)
    s.skipAllEffects()
  } else if (target !== from) s.displaySlide(target, true)
  watch()
  report()
}

function step(dir: number): void {
  const s = show()
  if (!s) return
  // The engine's own nextEffect never changes the slide; a click while a step still plays finishes
  // it (as in PowerPoint). Taking a step back only while one has played: else the engine goes to the slide before.
  if (dir > 0) s.nextEffect()
  else if (steps().done > 0) s.rewindEffect()
  watch()
  report()
}

/** The slide inside the page set: it keeps its shape and sits in the middle of the window. */
function placeMediaLayer(): void {
  const root = frame.contentDocument?.documentElement as unknown as SVGSVGElement | undefined
  const vb = root?.viewBox?.baseVal
  if (!vb || vb.width === 0 || vb.height === 0) return
  const scale = Math.min(window.innerWidth / vb.width, window.innerHeight / vb.height)
  const width = vb.width * scale
  const height = vb.height * scale
  media.place({ left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height })
}

/**
 * The click steps of each slide: the groups of its main sequence that start on a click
 * (begin="next"). Effects "with previous" or "after previous" belong to the group before them.
 */
function countClicks(doc: Document, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const slideId = doc.getElementById(`ooo:meta_slide_${i}`)?.getAttributeNS(OOO, 'slide') ?? ''
    const animations = doc.getElementById(`${slideId}-animations`)
    const sequence = [...(animations?.getElementsByTagName('*') ?? [])].find((e) => e.getAttribute('presentation:node-type') === 'main-sequence')
    if (!sequence) return 0
    return [...sequence.children].filter((child) => /\bnext\b/.test(child.getAttribute('smil:begin') ?? '')).length
  })
}

/** Slide names from the page set itself, when meta.json has none (PPT, ODP). */
function namesFromPageSet(doc: Document, count: number): SlideMeta[] {
  return Array.from({ length: count }, (_, i) => {
    const name = doc.getElementById(`ooo:meta_slide_${i}`)?.getAttributeNS(OOO, 'display-name') ?? ''
    return { title: name && !/^Slide \d+$/.test(name) ? name : `Slide ${i + 1}` }
  })
}

function fail(text: string): void {
  message.textContent = text
  message.hidden = false
}

async function start(): Promise<void> {
  let meta: SlideMeta[] = []
  if (metaName) {
    try {
      meta = ((await (await fetch(`/${metaName}`)).json()) as { slides?: SlideMeta[] }).slides ?? []
    } catch {
      // Titles are a convenience; the slides still show.
    }
  }
  frame.src = fileUrl
  await new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }))
  // The engine starts on the page set's own load; wait until it shows its first slide.
  const win = frame.contentWindow as unknown as Engine | null
  const t0 = Date.now()
  while (!(win?.aSlideShow && win.theMetaDoc && typeof win.nCurSlide === 'number')) {
    if (Date.now() - t0 > 15_000) {
      fail('This file cannot be shown.')
      return
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  engine = win
  const count = total()
  clickCounts = countClicks(frame.contentDocument as Document, count)
  slides = meta.length === count ? meta.map((s, i) => ({ title: s.title || `Slide ${i + 1}`, notes: s.notes, media: s.media })) : namesFromPageSet(frame.contentDocument as Document, count)
  placeMediaLayer()
  if (preview) goto(0)
  watch()
  report()
  setInterval(watch, 200)
}

channel.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data
  if (!msg || (msg.targetTabId && msg.targetTabId !== tabId)) return
  if (msg.type === 'PING') report()
  else if (msg.type === 'GOTO' && typeof msg.slideIndex === 'number') goto(msg.slideIndex)
  else if (msg.type === 'STEP' && typeof msg.dir === 'number') step(msg.dir)
  else if (msg.type === 'MEDIA' && typeof msg.index === 'number') media.toggle(msg.index)
})

window.addEventListener('resize', placeMediaLayer)

void start()
