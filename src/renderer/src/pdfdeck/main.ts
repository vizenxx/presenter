/**
 * Built-in page viewer for PDF files and converted PowerPoint decks. It speaks the
 * same sync protocol as UXD202 decks (SLIDE_STATE / PING / GOTO on
 * UXD202_SLIDES_SYNC), so the main process drives it like any synced deck.
 * It has no timer of its own (ownTimer: false), so the projector shows the overlay timer.
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface SlideMedia {
  kind: 'video' | 'audio'
  x: number
  y: number
  w: number
  h: number
  file: string
}

interface SlideMeta {
  title: string
  notes?: string
  media?: SlideMedia[]
}

const params = new URLSearchParams(location.search)
const tabId = params.get('tabId') ?? ''
// Deck files live at the root of this deck's host; the viewer lives under /__presenter__/.
const fileUrl = `/${params.get('file') ?? ''}`
const metaName = params.get('meta')
const channel = new BroadcastChannel('UXD202_SLIDES_SYNC')
const canvas = document.getElementById('page') as HTMLCanvasElement
const message = document.getElementById('message') as HTMLDivElement
const mediaLayer = document.getElementById('media') as HTMLDivElement
/** The current slide's videos and sounds (players), in slide order. */
let players: HTMLMediaElement[] = []

let doc: pdfjs.PDFDocumentProxy | null = null
let current = 0
let slides: SlideMeta[] = []
let renderSeq = 0

function report(): void {
  if (!doc) return
  channel.postMessage({
    type: 'SLIDE_STATE',
    tabId,
    currentSlide: current,
    totalSlides: doc.numPages,
    currentTitle: slides[current]?.title ?? '',
    metadata: slides.map(({ title, notes }) => ({ title, notes })),
    media: { kinds: (slides[current]?.media ?? []).map((m) => m.kind), playing: playingIndex() },
    milestones: [],
    ownTimer: false
  })
}

/** Fit the page into the window; draw off-screen first so a page turn never flashes blank. */
async function render(): Promise<void> {
  if (!doc) return
  const seq = ++renderSeq
  const page = await doc.getPage(current + 1)
  if (seq !== renderSeq) return
  const base = page.getViewport({ scale: 1 })
  const fit = Math.min(window.innerWidth / base.width, window.innerHeight / base.height)
  const ratio = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: fit * ratio })
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.floor(viewport.width))
  off.height = Math.max(1, Math.floor(viewport.height))
  await page.render({ canvas: off, viewport }).promise
  if (seq !== renderSeq) return
  canvas.width = off.width
  canvas.height = off.height
  canvas.style.width = `${off.width / ratio}px`
  canvas.style.height = `${off.height / ratio}px`
  canvas.getContext('2d')?.drawImage(off, 0, 0)
  placeMediaLayer()
}

/** The media layer lies exactly on the drawn page. */
function placeMediaLayer(): void {
  const r = canvas.getBoundingClientRect()
  Object.assign(mediaLayer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
}
// Also whenever the drawn page changes size (a render that another render replaced never places it).
new ResizeObserver(() => placeMediaLayer()).observe(canvas)

function playingIndex(): number | null {
  const i = players.findIndex((p) => !p.paused && !p.ended)
  return i < 0 ? null : i
}

/** The current slide's videos and sounds: a ▶ on each; a click (or the console) plays or pauses it in place. */
function showMedia(): void {
  for (const p of players) p.pause()
  players = []
  mediaLayer.replaceChildren()
  for (const m of slides[current]?.media ?? []) {
    const box = document.createElement('div')
    box.className = `media ${m.kind}`
    Object.assign(box.style, { left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` })
    const player = document.createElement(m.kind === 'audio' ? 'audio' : 'video') as HTMLMediaElement
    player.src = `/${m.file}`
    player.preload = 'metadata'
    if (player instanceof HTMLVideoElement) player.playsInline = true
    const play = document.createElement('div')
    play.className = 'play'
    const sync = (): void => {
      box.classList.toggle('playing', !player.paused && !player.ended)
      if (!player.paused) box.classList.add('started')
      report()
    }
    player.addEventListener('play', sync)
    player.addEventListener('pause', sync)
    player.addEventListener('ended', sync)
    player.addEventListener('error', () => {
      const note = document.createElement('div')
      note.className = 'note'
      note.textContent = `This ${m.kind === 'audio' ? 'sound' : 'video'} cannot play here (${m.file.split('.').pop()?.toUpperCase()}).`
      box.append(note)
    })
    box.addEventListener('click', () => toggleMedia(players.indexOf(player)))
    box.append(player, play)
    mediaLayer.append(box)
    players.push(player)
  }
}

/** Play or pause one video or sound of the slide (the others pause). */
function toggleMedia(index: number): void {
  const player = players[index]
  if (!player) return
  if (!player.paused && !player.ended) {
    player.pause()
    return
  }
  for (const p of players) if (p !== player) p.pause()
  if (player.ended) player.currentTime = 0
  void player.play().catch(() => undefined)
}

function goto(index: number): void {
  if (!doc) return
  const next = Math.min(Math.max(0, Math.round(index)), doc.numPages - 1)
  const changed = next !== current
  current = next
  void render()
  if (changed || players.length === 0) showMedia()
  report()
}

/** Page titles for a plain PDF: its first line of text. */
async function textTitles(d: pdfjs.PDFDocumentProxy): Promise<SlideMeta[]> {
  const out: SlideMeta[] = []
  for (let i = 1; i <= d.numPages; i++) {
    const content = await (await d.getPage(i)).getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    out.push({ title: line.slice(0, 80) || `Page ${i}` })
  }
  return out
}

async function start(): Promise<void> {
  try {
    doc = await pdfjs.getDocument({ url: fileUrl }).promise
  } catch {
    message.textContent = 'This file cannot be opened.'
    message.hidden = false
    return
  }
  const pages = doc.numPages
  if (metaName) {
    try {
      const meta = (await (await fetch(`/${metaName}`)).json()) as { slides?: SlideMeta[] }
      if (meta.slides && meta.slides.length === pages) slides = meta.slides.map((s, i) => ({ title: s.title || `Slide ${i + 1}`, notes: s.notes, media: s.media }))
    } catch {
      // Titles are a convenience; the pages still show.
    }
  }
  const needTitles = slides.length !== pages
  if (needTitles) slides = Array.from({ length: pages }, (_, i) => ({ title: `Page ${i + 1}` }))
  await render()
  showMedia()
  report()
  if (needTitles) {
    slides = await textTitles(doc)
    report()
  }
}

channel.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data
  if (!msg || (msg.targetTabId && msg.targetTabId !== tabId)) return
  if (msg.type === 'PING') report()
  else if (msg.type === 'GOTO' && typeof msg.slideIndex === 'number') goto(msg.slideIndex)
  else if (msg.type === 'MEDIA' && typeof msg.index === 'number') toggleMedia(msg.index)
})

let resizeTimer = 0
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => void render(), 60)
})

void start()
