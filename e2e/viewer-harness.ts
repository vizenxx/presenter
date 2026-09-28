/**
 * Off-screen check of the PPT/PDF path with the real main-process code:
 * convert -> deck:// protocol -> built viewer page -> deck preload -> sync protocol.
 * It renders off-screen: no window appears and nothing plays, so it is safe while a
 * class is on the projector. Build first (npm run build), then: npm run check:viewer
 */
import { app, BrowserWindow, ipcMain, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { prepareDeck, type Converter } from '../src/main/convert'
import { deckUrl } from '../src/main/deckPaths'
import { installDeckProtocol, registerDeckFolder, registerDeckScheme, setViewerRoot } from '../src/main/deckProtocol'

// Bundled to e2e/out/harness/, three levels below the project root.
const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
const SAMPLE = process.env['PRESENTER_SAMPLE_PPTX'] ?? 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Curriculum/2026-Autumn/UXD202/Original Slides/UXD202 Lecture n1.pptx'
const converters = process.env['PRESENTER_CONVERTER'] ? [process.env['PRESENTER_CONVERTER'] as Converter] : ['libreoffice' as Converter]

registerDeckScheme()
app.disableHardwareAcceleration()

interface State {
  currentSlide: number
  totalSlides: number
  metadata: Array<{ title: string; notes?: string }>
  ownTimer?: boolean
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let latest: State | null = null
ipcMain.on('deck:state', (_e, msg: State) => {
  latest = msg
})
for (const channel of ['deck:editing', 'deck:pointer']) ipcMain.on(channel, () => undefined)

async function until(label: string, test: (s: State) => boolean, ms = 20000): Promise<State> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (latest && test(latest)) return latest
    await wait(100)
  }
  throw new Error(`timeout: ${label} (last: ${JSON.stringify(latest && { ...latest, metadata: latest.metadata?.length })})`)
}

async function check(win: BrowserWindow, file: string, label: string, converted: boolean): Promise<void> {
  latest = null
  const prepared = await prepareDeck(file, { cacheRoot: path.join(OUT, 'convert-cache'), converters })
  const { host, url } = deckUrl(prepared.folder, prepared.entry, 'projector')
  registerDeckFolder(host, prepared.folder)
  await win.loadURL(url)
  const first = await until(`${label} first state`, (s) => s.totalSlides > 0)
  if (first.ownTimer !== false) throw new Error('viewer must report ownTimer: false')
  const withTitles = await until(`${label} titles`, (s) => s.metadata.length === s.totalSlides && !s.metadata.every((m) => /^Page \d+$/.test(m.title)))
  win.webContents.send('deck:cmd', { type: 'GOTO', slideIndex: 2 })
  await until(`${label} goto`, (s) => s.currentSlide === 2)
  await wait(700)
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `viewer-${label}.png`), image.toPNG())
  const notes = withTitles.metadata.filter((m) => m.notes).length
  console.log(`ok ${label}: ${withTitles.totalSlides} pages; titles e.g. "${withTitles.metadata[0].title.slice(0, 40)}"; ${notes} with notes${converted ? '' : ' (plain PDF)'}; page 3 captured`)
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  setViewerRoot(path.join(ROOT, 'out', 'renderer'))
  const ses = session.fromPartition('viewer-harness')
  installDeckProtocol(ses)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: { session: ses, preload: path.join(ROOT, 'out', 'preload', 'deck.js'), contextIsolation: true, sandbox: true, offscreen: true }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') console.log(`[page ${event.level}] ${event.message}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log(`[load failed] ${code} ${desc} ${url}`))
  let code = 0
  try {
    await check(win, SAMPLE, 'pptx', true)
    // The converted PDF doubles as a plain-PDF sample (no meta.json: titles come from page text).
    const pdf = path.join(OUT, 'sample.pdf')
    const prepared = await prepareDeck(SAMPLE, { cacheRoot: path.join(OUT, 'convert-cache'), converters })
    fs.copyFileSync(path.join(prepared.folder, 'deck.pdf'), pdf)
    await check(win, pdf, 'pdf', false)
    console.log('VIEWER OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    win.destroy()
    app.exit(code)
  }
})
