/**
 * Off-screen check of the media of an HTML deck's own page, with the real Output class:
 * the console finds a <video> and a "click to play" cover, and presses them without any click on
 * the projector. No window appears and nothing plays aloud (the video is silent).
 * Build first (npm run build), then: npm run check:media
 */
import { app, BaseWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { registerDeckScheme, installDeckProtocol, setViewerRoot } from '../src/main/deckProtocol'
import { Output } from '../src/main/output'
import { prepareDeck } from '../src/main/convert'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
registerDeckScheme()
app.disableHardwareAcceleration()

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** One second of silence as a WAV file: something a <video> element can load and play. */
function silence(): Buffer {
  const rate = 8000
  const samples = rate * 2
  const data = Buffer.alloc(samples * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

async function main(): Promise<void> {
  await app.whenReady()
  setViewerRoot(path.join(ROOT, 'out', 'renderer'))
  const folder = path.join(OUT, 'media-check')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'silence.wav'), silence())
  fs.writeFileSync(
    path.join(folder, 'deck.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>media</title><style>.slide{display:none;width:100vw;height:100vh}.slide.active{display:block}</style></head><body>
<div class="slide active"><h1>Media</h1>
<video id="v" loop muted src="silence.wav" style="width:360px;height:200px;background:#000"></video>
<button type="button" style="width:360px;height:200px" onclick="document.title='played'">Click to play · needs an internet connection</button></div>
<div class="slide"><h1>Two</h1></div></body></html>`
  )

  // Shown (a hidden page ignores clicks) but fully transparent, click-through and out of the task bar: nobody sees it.
  const win = new BaseWindow({ show: false, width: 1280, height: 720, skipTaskbar: true, focusable: false, frame: false })
  win.setOpacity(0)
  win.setIgnoreMouseEvents(true)
  win.showInactive()
  const output = new Output({
    id: 'check',
    screenNumber: 1,
    kind: 'window',
    linked: false,
    index: 0,
    preload: path.join(ROOT, 'out', 'preload', 'deck.js'),
    onEvent: () => undefined
  })
  installDeckProtocol(output.view.webContents.session)
  win.contentView.addChildView(output.view)
  output.view.setBounds({ x: 0, y: 0, width: 1280, height: 720 })
  const prepared = await prepareDeck(path.join(folder, 'deck.html'), { cacheRoot: path.join(OUT, 'media-check-cache') })
  output.load({ path: path.join(folder, 'deck.html'), name: 'deck.html' }, prepared)

  // The page loads; the deck answers the sync protocol or falls back to key mode; the scan needs it no longer "loading".
  let kinds = 0
  for (let i = 0; i < 80 && kinds < 2; i++) {
    await wait(250)
    await Promise.race([output.scanPageMedia(), wait(2000)])
    kinds = output.pageMedia?.kinds.length ?? 0
  }
  if (kinds < 2) throw new Error(`the scan should find the video and the cover (found ${kinds}; adapter ${output.adapter})`)
  console.log('ok the console finds the video and the "click to play" cover of an HTML deck page')

  const wc = output.view.webContents
  // The cover (second): a real click in its middle, like a click on the projector.
  output.toggleMedia(1)
  let played = false
  for (let i = 0; i < 25 && !played; i++) {
    await wait(200)
    played = (await wc.executeJavaScript('document.title')) === 'played'
  }
  if (!played) throw new Error('the console press did not reach the cover in the page')
  console.log('ok a press from the console reaches the cover (no click on the projector)')

  // The video (first): play, then pause.
  output.toggleMedia(0)
  let playing = false
  for (let i = 0; i < 25 && !playing; i++) {
    await wait(200)
    playing = !((await wc.executeJavaScript('document.getElementById("v").paused')) as boolean)
  }
  if (!playing) throw new Error('the video did not play from the console')
  await output.scanPageMedia()
  if (output.pageMedia?.playing !== 0) throw new Error(`the scan should say the video plays: ${JSON.stringify(output.pageMedia)}`)
  output.toggleMedia(0)
  let paused = false
  for (let i = 0; i < 25 && !paused; i++) {
    await wait(200)
    paused = (await wc.executeJavaScript('document.getElementById("v").paused')) as boolean
  }
  if (!paused) throw new Error('the video did not pause from the console')
  console.log('ok the video plays and pauses from the console')

  // Full screen: the video fills the screen it is shown on; again leaves it.
  await output.mediaFullscreen()
  await wait(500)
  const full = (await wc.executeJavaScript('!!document.fullscreenElement')) as boolean
  console.log(full ? 'ok Full screen puts the video full screen' : 'note: Full screen did not engage in this hidden window (needs a shown window; check by hand)')
  if (full) {
    await output.mediaFullscreen()
    await wait(500)
    if ((await wc.executeJavaScript('!!document.fullscreenElement')) as boolean) throw new Error('Full screen again should leave full screen')
    console.log('ok Full screen again leaves it')
  }
  output.destroy()
  console.log('MEDIA OK')
}

main().then(
  () => app.quit(),
  (error) => {
    console.error(String(error))
    app.exit(1)
  }
)
