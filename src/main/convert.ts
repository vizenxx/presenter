import { execFile, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deckKind, deckTitle, type DeckKind } from '../shared/deckKinds'
import type { DeckErrorCode } from '../shared/lang'
import { unzipSync } from 'fflate'
import { readPptxSlides, type SlideInfo } from './pptxMeta'
import { finishPageSet } from './pageSet'

/** Where a deck is served from and which page opens it. */
export interface PreparedDeck {
  kind: DeckKind
  /** Folder served on the deck's own deck:// host. */
  folder: string
  /** Path (and query) inside that host. */
  entry: string
}

/** LibreOffice (inside Presenter, else installed) first; then PowerPoint (Windows) or Keynote (macOS). */
export type Converter = 'powerpoint' | 'keynote' | 'libreoffice'

/**
 * How a converted deck is shown. svg: LibreOffice's page set with its slide show engine, so click
 * animations and slide transitions play (deck.svg). pdf: still pages, each in its final state (deck.pdf).
 */
export type DeckView = 'svg' | 'pdf'

export interface ConvertOptions {
  /** Folder for converted decks (a cache: one sub-folder per file version). */
  cacheRoot: string
  /** Converters to try, in order; default: every one found (LibreOffice first). */
  converters?: Converter[]
  /** 'pdf': still pages even when LibreOffice could make the animated page set. */
  view?: 'pdf'
}

/** Deck text the viewer reads next to the pages. */
export interface DeckMeta {
  source: string
  converter: Converter
  view: DeckView
  slides: DeckSlide[]
}

/** A slide in meta.json: title, notes, and its videos and sounds as files next to deck.pdf (media/…). */
export interface DeckSlide {
  title: string
  notes: string
  media?: Array<{ kind: 'video' | 'audio'; x: number; y: number; w: number; h: number; file: string }>
}

/** A problem the teacher can act on; the console shows it in the chosen language. */
export class DeckError extends Error {
  constructor(
    readonly code: DeckErrorCode,
    readonly detail = ''
  ) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

/** The built-in page viewer, served from the app on every deck host. */
export const VIEWER_ENTRY = '__presenter__/pdfdeck.html'
/** The built-in viewer for LibreOffice's animated page set (click steps play). */
export const STEPS_VIEWER_ENTRY = '__presenter__/svgdeck.html'
/** Bump when the conversion output changes, so old cache entries are not reused. */
const CONVERT_VERSION = 3
const CONVERT_TIMEOUT_MS = 180_000
const ZIP_SLIDES = /\.(pptx|pptm|ppsx)$/i

export async function prepareDeck(filePath: string, opts: ConvertOptions): Promise<PreparedDeck> {
  const full = path.resolve(filePath)
  const kind = deckKind(full)
  if (!kind) throw new DeckError('unsupported')
  if (!fs.existsSync(full)) throw new DeckError('missing')
  if (kind === 'html') return { kind, folder: path.dirname(full), entry: encodeURIComponent(path.basename(full)) }
  if (kind === 'pdf') return { kind, folder: path.dirname(full), entry: `${VIEWER_ENTRY}?file=${encodeURIComponent(path.basename(full))}` }
  const { folder, view } = await convertSlides(full, opts)
  return { kind, folder, entry: view === 'svg' ? `${STEPS_VIEWER_ENTRY}?file=deck.svg&meta=meta.json` : `${VIEWER_ENTRY}?file=deck.pdf&meta=meta.json` }
}

/**
 * Converts a PowerPoint-type file to deck.svg (animated) or deck.pdf, plus meta.json, in a cache
 * folder; returns that folder and how it is shown.
 */
export async function convertSlides(full: string, opts: ConvertOptions): Promise<{ folder: string; view: DeckView }> {
  const stat = fs.statSync(full)
  const key = crypto.createHash('sha1').update(`${CONVERT_VERSION}|${opts.view ?? ''}|${full.toLowerCase()}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 20)
  const folder = path.join(opts.cacheRoot, key)
  const cached = readMeta(folder)
  if (cached && fs.existsSync(path.join(folder, `deck.${cached.view}`))) return { folder, view: cached.view }

  const converters = opts.converters ?? installedConverters()
  if (converters.length === 0) throw new DeckError('no-converter')

  const work = `${folder}.work-${process.pid}-${Date.now()}`
  fs.mkdirSync(work, { recursive: true })
  const failures: string[] = []
  try {
    for (const converter of converters) {
      try {
        let view: DeckView = 'pdf'
        // LibreOffice's animated page set first; if it cannot be made, still pages.
        if (converter === 'libreoffice' && opts.view !== 'pdf') {
          try {
            await convertWithLibreOffice(full, work, opts.cacheRoot, 'svg')
            if (finishSvg(path.join(work, 'deck.svg'))) view = 'svg'
          } catch (error) {
            failures.push(`libreoffice (animated pages): ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        if (view === 'pdf') {
          const pdf = path.join(work, 'deck.pdf')
          if (converter === 'powerpoint') await convertWithPowerPoint(full, pdf, work)
          else if (converter === 'keynote') await convertWithKeynote(full, pdf, work)
          else await convertWithLibreOffice(full, work, opts.cacheRoot, 'pdf')
          if (!fs.existsSync(pdf) || fs.statSync(pdf).size === 0) throw new Error('no PDF produced')
        }
        const slides = ZIP_SLIDES.test(full) ? withMedia(full, safeSlides(full), work) : []
        const meta: DeckMeta = { source: full, converter, view, slides }
        fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(meta, null, 2))
        fs.rmSync(folder, { recursive: true, force: true })
        fs.renameSync(work, folder)
        return { folder, view }
      } catch (error) {
        failures.push(`${converter}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
  // macOS: the teacher said no (or not yet) to "Presenter wants to control Keynote".
  if (failures.some((f) => f.includes('-1743'))) throw new DeckError('automation-denied', failures.join('; '))
  throw new DeckError('convert-failed', failures.join('; '))
}

function readMeta(folder: string): DeckMeta | null {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(folder, 'meta.json'), 'utf8')) as DeckMeta
    return meta.view === 'svg' || meta.view === 'pdf' ? meta : null
  } catch {
    return null
  }
}

/** Checks LibreOffice's animated page set and applies the fixes it needs (pageSet.ts). */
function finishSvg(file: string): boolean {
  if (!fs.existsSync(file)) return false
  const fixed = finishPageSet(fs.readFileSync(file, 'utf8'))
  if (fixed === null) return false
  fs.writeFileSync(file, fixed)
  return true
}

/**
 * Copies each slide's videos and sounds next to the converted pages (media/…), so the viewer can
 * play them where they stand on the slide. A linked file is taken from where the PPTX points
 * (relative paths from the PPTX's folder); a file that cannot be found is left out.
 */
export function withMedia(full: string, slides: SlideInfo[], work: string): DeckSlide[] {
  const parts = new Set(slides.flatMap((s) => (s.media ?? []).map((m) => m.part).filter((p): p is string => !!p)))
  let files: Record<string, Uint8Array> = {}
  if (parts.size > 0) {
    try {
      files = unzipSync(fs.readFileSync(full), { filter: (f) => parts.has(f.name) })
    } catch {
      files = {}
    }
  }
  const mediaDir = path.join(work, 'media')
  let n = 0
  return slides.map(({ title, notes, media }) => {
    const kept: NonNullable<DeckSlide['media']> = []
    for (const m of media ?? []) {
      let source: Uint8Array | null = null
      let ext = ''
      if (m.part && files[m.part]) {
        source = files[m.part]
        ext = path.extname(m.part)
      } else if (m.link) {
        try {
          const linked = /^file:/i.test(m.link) ? fileURLToPath(m.link) : path.resolve(path.dirname(full), m.link)
          if (fs.existsSync(linked)) {
            source = fs.readFileSync(linked)
            ext = path.extname(linked)
          }
        } catch {
          source = null
        }
      }
      if (!source) continue
      fs.mkdirSync(mediaDir, { recursive: true })
      const name = `media/${++n}${ext.toLowerCase()}`
      fs.writeFileSync(path.join(work, name), source)
      kept.push({ kind: m.kind, x: m.x, y: m.y, w: m.w, h: m.h, file: name })
    }
    return kept.length > 0 ? { title, notes, media: kept } : { title, notes }
  })
}

function safeSlides(full: string): SlideInfo[] {
  try {
    return readPptxSlides(fs.readFileSync(full))
  } catch {
    return []
  }
}

// ---------- converters ----------

/**
 * LibreOffice first: it ships inside Presenter, and only its page set plays click animations.
 * PowerPoint or Keynote stay as a second way (still pages) if it fails.
 */
export function installedConverters(): Converter[] {
  const found: Converter[] = []
  if (libreOfficePath()) found.push('libreoffice')
  if (hasPowerPoint()) found.push('powerpoint')
  if (hasKeynote()) found.push('keynote')
  return found
}

/** Keynote comes with every Mac (it can be deleted); it opens PPT, PPTX and Keynote files. */
function hasKeynote(): boolean {
  if (process.platform !== 'darwin') return false
  const places = ['/Applications/Keynote.app', path.join(os.homedir(), 'Applications', 'Keynote.app')]
  if (places.some((p) => fs.existsSync(p))) return true
  try {
    return execFileSync('mdfind', ["kMDItemCFBundleIdentifier == 'com.apple.iWork.Keynote'"], { timeout: 3000 }).toString().trim() !== ''
  } catch {
    return false
  }
}

/** The PowerPoint COM class is registered only when PowerPoint is installed. */
function hasPowerPoint(): boolean {
  if (process.platform !== 'win32') return false
  try {
    execFileSync('reg', ['query', 'HKCR\\PowerPoint.Application\\CLSID'], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

/**
 * The LibreOffice inside Presenter (resources/libreoffice; vendor/ when run from the source;
 * PRESENTER_LIBREOFFICE for tests), else an installed one.
 */
export function libreOfficePath(): string | null {
  const exe = process.platform === 'win32' ? ['program', 'soffice.com'] : process.platform === 'darwin' ? ['LibreOffice.app', 'Contents', 'MacOS', 'soffice'] : null
  if (exe) {
    const roots = [
      process.env['PRESENTER_LIBREOFFICE'],
      process.resourcesPath ? path.join(process.resourcesPath, 'libreoffice') : undefined,
      path.join(__dirname, '..', '..', 'vendor', `libreoffice-${process.platform}-${process.arch}`)
    ]
    for (const root of roots) {
      if (root && fs.existsSync(path.join(root, ...exe))) return path.join(root, ...exe)
    }
  }
  if (process.platform === 'darwin') {
    const app = 'LibreOffice.app/Contents/MacOS/soffice'
    return [path.join('/Applications', app), path.join(os.homedir(), 'Applications', app)].find((p) => fs.existsSync(p)) ?? null
  }
  if (process.platform !== 'win32') return ['/usr/bin/soffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice'].find((p) => fs.existsSync(p)) ?? null
  const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)']
  for (const root of roots) {
    if (!root) continue
    const candidate = path.join(root, 'LibreOffice', 'program', 'soffice.com')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function run(file: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd, timeout: CONVERT_TIMEOUT_MS, windowsHide: true }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`${error.message} ${String(stderr).trim()}`.trim()))
      else resolve()
    })
  })
}

/**
 * PowerPoint through COM, invisible: opened read-only without a window. It quits
 * PowerPoint only when this script started it, so a teacher's open PowerPoint stays.
 */
const POWERPOINT_SCRIPT = `param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$app = New-Object -ComObject PowerPoint.Application
$pres = $null
try {
  $pres = $app.Presentations.Open($In, -1, 0, 0)
  # PDF, print quality, no frames, handout order, slides only, hidden slides left out.
  $pres.ExportAsFixedFormat($Out, 2, 2, 0, 1, 1, 0)
} finally {
  if ($pres) { $pres.Close() }
  if (-not $wasRunning -and $app.Presentations.Count -eq 0) { $app.Quit() }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
`

async function convertWithPowerPoint(input: string, pdf: string, work: string): Promise<void> {
  const script = path.join(work, 'ppt-to-pdf.ps1')
  // UTF-8 with BOM so Windows PowerShell 5 reads non-ASCII paths in the script correctly.
  fs.writeFileSync(script, '\ufeff' + POWERPOINT_SCRIPT, 'utf8')
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-In', input, '-Out', pdf], work)
  fs.rmSync(script, { force: true })
}

/**
 * Keynote through AppleScript. The first time, macOS asks "Presenter wants to control Keynote".
 * Keynote opens a window while it converts; it quits afterwards only if this script started it.
 * Skipped (hidden) slides are left out, as in PowerPoint.
 */
const KEYNOTE_SCRIPT = `on run argv
  set inPath to item 1 of argv
  set outPath to item 2 of argv
  set wasRunning to application id "com.apple.iWork.Keynote" is running
  tell application id "com.apple.iWork.Keynote"
    set theDoc to open (POSIX file inPath)
    try
      export theDoc to (POSIX file outPath) as PDF with properties {PDF image quality:Best, skipped slides:false}
    on error errMsg number errNum
      close theDoc saving no
      if not wasRunning then quit
      error errMsg number errNum
    end try
    close theDoc saving no
    if not wasRunning then quit
  end tell
end run
`

async function convertWithKeynote(input: string, pdf: string, work: string): Promise<void> {
  const script = path.join(work, 'to-pdf.applescript')
  fs.writeFileSync(script, KEYNOTE_SCRIPT, 'utf8')
  await run('osascript', [script, input, pdf], work)
  fs.rmSync(script, { force: true })
}

/**
 * LibreOffice headless with its own profile, so an open LibreOffice window is not disturbed.
 * svg: the page set with LibreOffice's slide show engine (click animations); pdf: still pages.
 */
async function convertWithLibreOffice(input: string, work: string, cacheRoot: string, format: DeckView): Promise<void> {
  const soffice = libreOfficePath()
  if (!soffice) throw new Error('LibreOffice not found')
  const profile = pathToFileURL(path.join(cacheRoot, 'libreoffice-profile')).href
  const target = format === 'svg' ? 'svg:impress_svg_Export' : 'pdf'
  await run(soffice, ['--headless', '--norestore', '--nolockcheck', '--nodefault', `-env:UserInstallation=${profile}`, '--convert-to', target, '--outdir', work, input], work)
  const produced = path.join(work, `${deckTitle(input)}.${format}`)
  if (fs.existsSync(produced)) fs.renameSync(produced, path.join(work, `deck.${format}`))
}
