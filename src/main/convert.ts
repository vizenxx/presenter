import { execFile, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { deckKind, deckTitle, type DeckKind } from '../shared/deckKinds'
import type { DeckErrorCode } from '../shared/lang'
import { readPptxSlides, type SlideInfo } from './pptxMeta'

/** Where a deck is served from and which page opens it. */
export interface PreparedDeck {
  kind: DeckKind
  /** Folder served on the deck's own deck:// host. */
  folder: string
  /** Path (and query) inside that host. */
  entry: string
}

/** Windows: PowerPoint, then LibreOffice. macOS: Keynote, then LibreOffice. */
export type Converter = 'powerpoint' | 'keynote' | 'libreoffice'

export interface ConvertOptions {
  /** Folder for converted decks (a cache: one sub-folder per file version). */
  cacheRoot: string
  /** Converters to try, in order; default: every installed one (PowerPoint or Keynote first). */
  converters?: Converter[]
}

/** Deck text the viewer reads next to the PDF. */
export interface DeckMeta {
  source: string
  converter: Converter
  slides: SlideInfo[]
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
/** Bump when the conversion output changes, so old cache entries are not reused. */
const CONVERT_VERSION = 1
const CONVERT_TIMEOUT_MS = 180_000
const ZIP_SLIDES = /\.(pptx|pptm|ppsx)$/i

export async function prepareDeck(filePath: string, opts: ConvertOptions): Promise<PreparedDeck> {
  const full = path.resolve(filePath)
  const kind = deckKind(full)
  if (!kind) throw new DeckError('unsupported')
  if (!fs.existsSync(full)) throw new DeckError('missing')
  if (kind === 'html') return { kind, folder: path.dirname(full), entry: encodeURIComponent(path.basename(full)) }
  if (kind === 'pdf') return { kind, folder: path.dirname(full), entry: `${VIEWER_ENTRY}?file=${encodeURIComponent(path.basename(full))}` }
  const folder = await convertSlides(full, opts)
  return { kind, folder, entry: `${VIEWER_ENTRY}?file=deck.pdf&meta=meta.json` }
}

/** Converts a PowerPoint-type file to deck.pdf + meta.json in a cache folder; returns that folder. */
export async function convertSlides(full: string, opts: ConvertOptions): Promise<string> {
  const stat = fs.statSync(full)
  const key = crypto.createHash('sha1').update(`${CONVERT_VERSION}|${full.toLowerCase()}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 20)
  const folder = path.join(opts.cacheRoot, key)
  if (fs.existsSync(path.join(folder, 'deck.pdf')) && fs.existsSync(path.join(folder, 'meta.json'))) return folder

  const converters = opts.converters ?? installedConverters()
  if (converters.length === 0) throw new DeckError('no-converter')

  const work = `${folder}.work-${process.pid}-${Date.now()}`
  fs.mkdirSync(work, { recursive: true })
  const failures: string[] = []
  try {
    for (const converter of converters) {
      try {
        const pdf = path.join(work, 'deck.pdf')
        if (converter === 'powerpoint') await convertWithPowerPoint(full, pdf, work)
        else if (converter === 'keynote') await convertWithKeynote(full, pdf, work)
        else await convertWithLibreOffice(full, work, opts.cacheRoot)
        if (!fs.existsSync(pdf) || fs.statSync(pdf).size === 0) throw new Error('no PDF produced')
        const slides = ZIP_SLIDES.test(full) ? safeSlides(full) : []
        const meta: DeckMeta = { source: full, converter, slides }
        fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(meta, null, 2))
        fs.rmSync(folder, { recursive: true, force: true })
        fs.renameSync(work, folder)
        return folder
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

function safeSlides(full: string): SlideInfo[] {
  try {
    return readPptxSlides(fs.readFileSync(full))
  } catch {
    return []
  }
}

// ---------- converters ----------

export function installedConverters(): Converter[] {
  const found: Converter[] = []
  if (hasPowerPoint()) found.push('powerpoint')
  if (hasKeynote()) found.push('keynote')
  if (libreOfficePath()) found.push('libreoffice')
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

function libreOfficePath(): string | null {
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

/** LibreOffice headless with its own profile, so an open LibreOffice window is not disturbed. */
async function convertWithLibreOffice(input: string, work: string, cacheRoot: string): Promise<void> {
  const soffice = libreOfficePath()
  if (!soffice) throw new Error('LibreOffice not found')
  const profile = pathToFileURL(path.join(cacheRoot, 'libreoffice-profile')).href
  await run(soffice, ['--headless', '--norestore', '--nolockcheck', '--nodefault', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', work, input], work)
  const produced = path.join(work, `${deckTitle(input)}.pdf`)
  if (fs.existsSync(produced)) fs.renameSync(produced, path.join(work, 'deck.pdf'))
}
