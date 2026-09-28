/**
 * Off-screen check that HTML decks built with common frameworks (and the public-protocol
 * example) connect fully: page count, titles, notes, exact jumps. Uses the real deck
 * preload and the same injected script as the app. No window appears, nothing plays.
 * Build first, then: npm run check:frameworks
 */
import { app, BrowserWindow, ipcMain, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { deckUrl } from '../src/main/deckPaths'
import { installDeckProtocol, registerDeckFolder, registerDeckScheme } from '../src/main/deckProtocol'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
const FIXTURES = path.join(ROOT, 'e2e', 'fixtures', 'frameworks')
const MODULES = path.join(ROOT, 'node_modules')
// The same script Output injects (src/main/bridges/index.ts), read from its sources.
const BRIDGE = `${fs.readFileSync(path.join(ROOT, 'sdk', 'presenter-bridge.js'), 'utf8')}\n;${fs.readFileSync(path.join(ROOT, 'src', 'main', 'bridges', 'framework-adapters.js'), 'utf8')}`

registerDeckScheme()
app.disableHardwareAcceleration()
app.on('window-all-closed', () => undefined)

interface State {
  currentSlide: number
  totalSlides: number
  metadata: Array<{ title: string; notes?: string; minutes?: number }>
  ownTimer?: boolean
  /** Set by the public bridge (sdk); UXD202 decks never send it. */
  protocol?: number
}
let latest: State | null = null
const seen: State[] = []
ipcMain.on('deck:state', (_e, msg: State) => {
  latest = msg
  seen.push(msg)
})
for (const channel of ['deck:editing', 'deck:pointer', 'ink:ready', 'ink:op']) ipcMain.on(channel, () => undefined)

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
async function until(label: string, test: (s: State) => boolean, ms = 10000): Promise<State> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (latest && test(latest)) return latest
    await wait(100)
  }
  throw new Error(`timeout: ${label} (last: ${JSON.stringify(latest)})`)
}

/** Framework files are copied next to each fixture (a deck may only read its own folder). */
function prepareFixtures(): void {
  const copy = (from: string, to: string): void => fs.copyFileSync(path.join(MODULES, from), path.join(FIXTURES, to))
  copy('reveal.js/dist/reveal.js', 'reveal/reveal.js')
  copy('reveal.js/dist/reveal.css', 'reveal/reveal.css')
  copy('reveal.js/dist/theme/white.css', 'reveal/white.css')
  copy('impress.js/js/impress.js', 'impress/impress.js')
  copy('remark-slide/out/remark.min.js', 'remark/remark.min.js')
}

interface Case {
  name: string
  folder: string
  file: string
  total: number
  firstTitle: string
  note?: string
  /** [slide index, planned minutes] read from the deck. */
  minutes?: [number, number]
  /** The deck speaks its own protocol: no adapter may connect to it. */
  native?: boolean
}

const BNLI = 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Workshop/BNLI/1_必要保留_KEEP/18_Learner_First_Package'
const UXD_W8 = 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Curriculum/2026-Autumn/UXD202/Final Slides'

const CASES: Case[] = [
  { name: 'Reveal.js', folder: path.join(FIXTURES, 'reveal'), file: 'index.html', total: 4, firstTitle: 'Reveal opening', note: 'Reveal note one' },
  { name: 'remark', folder: path.join(FIXTURES, 'remark'), file: 'index.html', total: 4, firstTitle: 'Remark opening', note: 'Remark note one' },
  { name: 'impress.js', folder: path.join(FIXTURES, 'impress'), file: 'index.html', total: 4, firstTitle: 'Impress opening', note: 'Impress note one' },
  { name: 'Marp', folder: path.join(FIXTURES, 'marp'), file: 'index.html', total: 4, firstTitle: 'Marp opening', note: 'Speaker note for slide one' },
  { name: 'protocol example', folder: path.join(ROOT, 'examples'), file: 'minimal-deck.html', total: 4, firstTitle: 'Welcome', note: "Greet the class and state today's goal.", minutes: [1, 8] },
  { name: 'plain slides, keys', folder: path.join(FIXTURES, 'plain-keys'), file: 'index.html', total: 4, firstTitle: 'Keys opening', note: 'Keys note one', minutes: [2, 8] },
  { name: 'plain slides, goToSlide from 1', folder: path.join(FIXTURES, 'plain-goto1'), file: 'index.html', total: 4, firstTitle: 'One based opening', note: 'Script one EN\n\n脚本一', minutes: [2, 6] }
]

/** Real decks on this computer (read only); skipped when a file is not there. */
const REAL: Case[] = [
  { name: 'BNLI Day 1 (own channel)', folder: BNLI, file: 'Day1_Slides.html', total: 34, firstTitle: '', minutes: [3, 9] },
  { name: 'UXD202 Week 8 (UXD202 protocol)', folder: UXD_W8, file: 'Week-08-Unit 3 Interaction Design and Prototyping.html', total: 0, firstTitle: '', native: true }
].filter((c) => fs.existsSync(path.join(c.folder, c.file)))

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  prepareFixtures()
  const ses = session.fromPartition('frameworks-harness')
  installDeckProtocol(ses)
  let code = 0
  for (const c of [...CASES, ...REAL]) {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: { session: ses, preload: path.join(ROOT, 'out', 'preload', 'deck.js'), contextIsolation: true, sandbox: true, offscreen: true }
    })
    win.webContents.setAudioMuted(true)
    try {
      latest = null
      seen.length = 0
      const { host, url } = deckUrl(c.folder, encodeURIComponent(c.file), 'next')
      registerDeckFolder(host, c.folder)
      await win.loadURL(url)
      await win.webContents.executeJavaScript(BRIDGE)
      if (c.native) {
        // Presenter's PINGs make the deck answer on its own channel; the adapters must stay out.
        for (const delay of [300, 700, 1000]) {
          await wait(delay)
          win.webContents.send('deck:cmd', { type: 'PING' })
        }
        await wait(3000)
        if (seen.length === 0) throw new Error(`${c.name}: the deck did not answer`)
        if (seen.some((m) => m.protocol === 1)) throw new Error(`${c.name}: an adapter connected to a deck that has its own protocol`)
        console.log(`ok ${c.name}: its own protocol answers (${seen[seen.length - 1].totalSlides} slides); no adapter interferes`)
        continue
      }
      const s = await until(`${c.name} state`, (s) => s.totalSlides === c.total && s.metadata.length === c.total)
      if (c.firstTitle && s.metadata[0].title !== c.firstTitle) throw new Error(`${c.name}: first title "${s.metadata[0].title}"`)
      if (!s.metadata[0].title) throw new Error(`${c.name}: first slide has no title`)
      if (c.note && s.metadata[0].notes !== c.note) throw new Error(`${c.name}: first notes "${s.metadata[0].notes}"`)
      if (!c.note && !s.metadata.some((m) => m.notes)) throw new Error(`${c.name}: no notes found`)
      if (c.minutes && s.metadata[c.minutes[0]].minutes !== c.minutes[1]) throw new Error(`${c.name}: minutes on slide ${c.minutes[0] + 1} = ${s.metadata[c.minutes[0]].minutes}`)
      if (s.ownTimer !== false) throw new Error(`${c.name}: ownTimer should be false`)
      win.webContents.send('deck:cmd', { type: 'GOTO', slideIndex: 2 })
      await until(`${c.name} goto`, (s) => s.currentSlide === 2)
      await wait(400)
      fs.writeFileSync(path.join(OUT, `framework-${c.name.replace(/\W+/g, '-').toLowerCase()}.png`), (await win.webContents.capturePage()).toPNG())
      const withNotes = s.metadata.filter((m) => m.notes).length
      console.log(`ok ${c.name}: ${s.totalSlides} slides, first "${s.metadata[0].title.slice(0, 40)}", ${withNotes} with notes, jump to slide 3 works`)
    } catch (error) {
      console.error(String(error))
      code = 1
    } finally {
      win.destroy()
      await wait(200)
    }
  }
  if (code === 0) console.log('FRAMEWORKS OK')
  app.exit(code)
})
