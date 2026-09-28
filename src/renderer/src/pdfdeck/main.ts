/**
 * Built-in page viewer for PDF files and converted PowerPoint decks. It speaks the
 * same sync protocol as UXD202 decks (SLIDE_STATE / PING / GOTO on
 * UXD202_SLIDES_SYNC), so the main process drives it like any synced deck.
 * It has no timer of its own (ownTimer: false), so the projector shows the overlay timer.
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface SlideMeta {
  title: string
  notes?: string
}

const params = new URLSearchParams(location.search)
const tabId = params.get('tabId') ?? ''
// Deck files live at the root of this deck's host; the viewer lives under /__presenter__/.
const fileUrl = `/${params.get('file') ?? ''}`
const metaName = params.get('meta')
const channel = new BroadcastChannel('UXD202_SLIDES_SYNC')
const canvas = document.getElementById('page') as HTMLCanvasElement
const message = document.getElementById('message') as HTMLDivElement

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
    metadata: slides,
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
}

function goto(index: number): void {
  if (!doc) return
  current = Math.min(Math.max(0, Math.round(index)), doc.numPages - 1)
  void render()
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
      if (meta.slides && meta.slides.length === pages) slides = meta.slides.map((s, i) => ({ title: s.title || `Slide ${i + 1}`, notes: s.notes }))
    } catch {
      // Titles are a convenience; the pages still show.
    }
  }
  const needTitles = slides.length !== pages
  if (needTitles) slides = Array.from({ length: pages }, (_, i) => ({ title: `Page ${i + 1}` }))
  await render()
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
})

let resizeTimer = 0
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => void render(), 60)
})

void start()
