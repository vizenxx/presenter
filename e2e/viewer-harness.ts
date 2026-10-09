/**
 * Off-screen check of the PPT/PDF path with the real main-process code:
 * convert -> deck:// protocol -> built viewer page -> deck preload -> sync protocol.
 * It renders off-screen: no window appears and nothing plays, so it is safe while a
 * class is on the projector. Build first (npm run build), then: npm run check:viewer
 */
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import fs from 'node:fs'
import path from 'node:path'
import { prepareDeck, type Converter } from '../src/main/convert'
import { deckUrl } from '../src/main/deckPaths'
import { installDeckProtocol, registerDeckFolder, registerDeckScheme, setViewerRoot } from '../src/main/deckProtocol'

// Bundled to e2e/out/harness/, three levels below the project root.
const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
const SAMPLE = process.env['PRESENTER_SAMPLE_PPTX'] ?? path.resolve(ROOT, '../2026-Autumn/UXD202/Original Slides/UXD202 Lecture n1.pptx')
const converters = process.env['PRESENTER_CONVERTER'] ? [process.env['PRESENTER_CONVERTER'] as Converter] : ['libreoffice' as Converter]

registerDeckScheme()
app.disableHardwareAcceleration()

interface State {
  currentSlide: number
  totalSlides: number
  metadata: Array<{ title: string; notes?: string }>
  ownTimer?: boolean
  media?: { kinds: string[]; playing: number | null }
}

/** One second of a quiet 440 Hz tone as a WAV file (a stand-in for a slide's video or sound). */
function wavTone(): Buffer {
  const rate = 8000
  const samples = rate
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 2000), i * 2)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

/**
 * A converted deck with a video on page 3 (here a WAV in a video player) and a sound on page 4:
 * the ▶ shows where they stand, the console's command plays and pauses, and the file is served in parts.
 */
async function media(win: BrowserWindow, convertedFolder: string): Promise<void> {
  latest = null
  const folder = path.join(OUT, 'media-deck')
  fs.rmSync(folder, { recursive: true, force: true })
  fs.mkdirSync(path.join(folder, 'media'), { recursive: true })
  fs.copyFileSync(path.join(convertedFolder, 'deck.pdf'), path.join(folder, 'deck.pdf'))
  fs.writeFileSync(path.join(folder, 'media', '1.wav'), wavTone())
  const meta = JSON.parse(fs.readFileSync(path.join(convertedFolder, 'meta.json'), 'utf8'))
  meta.slides[2].media = [{ kind: 'video', x: 0.25, y: 0.25, w: 0.5, h: 0.5, file: 'media/1.wav' }]
  meta.slides[3].media = [{ kind: 'audio', x: 0.8, y: 0.8, w: 0.1, h: 0.1, file: 'media/1.wav' }]
  fs.writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(meta))
  const { host, url } = deckUrl(folder, '__presenter__/pdfdeck.html?file=deck.pdf&meta=meta.json', 'projector')
  registerDeckFolder(host, folder)
  await win.loadURL(url)
  await until('media deck', (s) => s.totalSlides > 3)
  win.webContents.send('deck:cmd', { type: 'GOTO', slideIndex: 2 })
  await until('page 3 has a video', (s) => s.currentSlide === 2 && s.media?.kinds.join() === 'video' && s.media.playing === null)
  // Measured once the page is drawn (the GOTO's render ends a moment after the report).
  const box = await win.webContents.executeJavaScript(`new Promise((done) => { const t0 = Date.now(); const look = () => { const b = document.querySelector('.media'); const r = b.getBoundingClientRect(); const c = document.getElementById('page').getBoundingClientRect(); if (r.width > 0 || Date.now() - t0 > 3000) done([(r.left - c.left) / c.width, (r.top - c.top) / c.height, r.width / c.width]); else setTimeout(look, 50) }; look() })`)
  if (Math.abs(box[0] - 0.25) > 0.01 || Math.abs(box[1] - 0.25) > 0.01 || Math.abs(box[2] - 0.5) > 0.01) throw new Error(`the video is not where it stands on the slide: ${box}`)
  const part = await win.webContents.executeJavaScript(`fetch('/media/1.wav', { headers: { Range: 'bytes=0-9' } }).then(async (r) => [r.status, (await r.arrayBuffer()).byteLength, r.headers.get('content-range')])`)
  if (part[0] !== 206 || part[1] !== 10) throw new Error(`the file is not served in parts: ${JSON.stringify(part)}`)
  win.webContents.send('deck:cmd', { type: 'MEDIA', action: 'toggle', index: 0 })
  await until('the video plays', (s) => s.media?.playing === 0)
  await wait(300)
  fs.writeFileSync(path.join(OUT, 'viewer-media.png'), (await win.webContents.capturePage()).toPNG())
  win.webContents.send('deck:cmd', { type: 'MEDIA', action: 'toggle', index: 0 })
  await until('the video pauses', (s) => s.media?.playing === null)
  win.webContents.send('deck:cmd', { type: 'MEDIA', action: 'toggle', index: 0 })
  await until('it plays again', (s) => s.media?.playing === 0)
  win.webContents.send('deck:cmd', { type: 'GOTO', slideIndex: 3 })
  await until('the next page stops it and has a sound', (s) => s.currentSlide === 3 && s.media?.kinds.join() === 'audio' && s.media.playing === null)
  console.log('ok PPT video and sound: in place on the slide, play and pause from the console, served in parts, stop on a page turn')
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

/** Records a 2-second MP4 (a moving square) and a PNG poster in an off-screen page. */
async function recordVideo(): Promise<{ mp4: Buffer; png: Buffer } | null> {
  const rec = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { offscreen: true } })
  await rec.loadURL('data:text/html,<canvas id="c" width="320" height="180"></canvas>')
  const result = await rec.webContents.executeJavaScript(`(async () => {
    const type = 'video/mp4;codecs=avc1'
    if (!MediaRecorder.isTypeSupported(type)) return null
    const c = document.getElementById('c'); const g = c.getContext('2d')
    let t = 0
    const draw = () => { g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, 320, 180); g.fillStyle = '#facc15'; g.fillRect(20 + (t % 260), 60, 40, 40); t += 6 }
    draw()
    const poster = c.toDataURL('image/png')
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type })
    const parts = []
    rec.ondataavailable = (e) => parts.push(e.data)
    const timer = setInterval(draw, 33)
    rec.start()
    await new Promise((r) => setTimeout(r, 2000))
    await new Promise((r) => { rec.onstop = r; rec.stop() })
    clearInterval(timer)
    const bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return [btoa(bin), poster.split(',')[1]]
  })()`)
  rec.destroy()
  return result ? { mp4: Buffer.from(result[0], 'base64'), png: Buffer.from(result[1], 'base64') } : null
}

/** A copy of the sample PPTX with the video embedded on its first slide, the way PowerPoint writes it. */
function pptxWithVideo(sample: string, video: { mp4: Buffer; png: Buffer }): string {
  const files = unzipSync(fs.readFileSync(sample))
  const text = (name: string): string => strFromU8(files[name])
  const pres = text('ppt/presentation.xml')
  const rels0 = text('ppt/_rels/presentation.xml.rels')
  // The first slide the show contains (the sample's first slides are hidden).
  const slidePath = [...pres.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => new RegExp('<Relationship[^>]*Id="' + m[1] + '"[^>]*Target="([^"]+)"').exec(rels0)?.[1] ?? '')
    .map((target) => `ppt/${target.replace(/^\//, '').replace(/^ppt\//, '')}`)
    .find((name) => files[name] && !/<p:sld\b[^>]*\bshow="0"/.test(text(name))) ?? ''
  const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
  const sz = /<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(pres) ?? ['', '12192000', '6858000']
  const [cx, cy] = [Number(sz[1]), Number(sz[2])]
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="900" name="Test video"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:videoFile r:link="rIdV1"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rIdV2"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rIdV3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(cx * 0.25)}" y="${Math.round(cy * 0.25)}"/><a:ext cx="${Math.round(cx * 0.5)}" cy="${Math.round(cy * 0.5)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  files[slidePath] = strToU8(text(slidePath).replace('</p:spTree>', `${pic}</p:spTree>`))
  const rels = files[relsPath] ? text(relsPath) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  files[relsPath] = strToU8(rels.replace('</Relationships>', '<Relationship Id="rIdV1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="../media/test-video.mp4"/><Relationship Id="rIdV2" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/test-video.mp4"/><Relationship Id="rIdV3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/test-poster.png"/></Relationships>'))
  files['ppt/media/test-video.mp4'] = new Uint8Array(video.mp4)
  files['ppt/media/test-poster.png'] = new Uint8Array(video.png)
  let types = text('[Content_Types].xml')
  if (!/Extension="mp4"/i.test(types)) types = types.replace('</Types>', '<Default Extension="mp4" ContentType="video/mp4"/></Types>')
  if (!/Extension="png"/i.test(types)) types = types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>')
  files['[Content_Types].xml'] = strToU8(types)
  const out = path.join(OUT, 'sample-with-video.pptx')
  fs.writeFileSync(out, zipSync(files))
  return out
}

/** The first conversion on a computer: LibreOffice starts with a new, empty profile. */
async function freshProfile(): Promise<void> {
  if (!converters.includes('libreoffice')) return
  const cacheRoot = fs.mkdtempSync(path.join(OUT, 'fresh-cache-'))
  try {
    const prepared = await prepareDeck(SAMPLE, { cacheRoot, converters: ['libreoffice'] })
    if (!fs.existsSync(path.join(prepared.folder, 'deck.pdf'))) throw new Error('no deck.pdf on the first conversion')
    console.log('ok the first conversion with a new LibreOffice profile works')
  } finally {
    fs.rmSync(cacheRoot, { recursive: true, force: true })
  }
}

/** The whole path with a real video in a real PPTX: convert, take the video out, play it in place. */
async function realVideo(win: BrowserWindow): Promise<void> {
  const video = await recordVideo()
  if (!video) {
    console.log('skip real video: this Chromium cannot record MP4')
    return
  }
  const file = pptxWithVideo(SAMPLE, video)
  const prepared = await prepareDeck(file, { cacheRoot: path.join(OUT, 'convert-cache'), converters })
  const meta = JSON.parse(fs.readFileSync(path.join(prepared.folder, 'meta.json'), 'utf8'))
  const m = meta.slides[0].media?.[0]
  if (!m || m.kind !== 'video' || Math.abs(m.x - 0.25) > 0.01 || Math.abs(m.w - 0.5) > 0.01) throw new Error(`the video was not found in the PPTX: ${JSON.stringify(meta.slides[0].media)}`)
  if (fs.statSync(path.join(prepared.folder, m.file)).size !== video.mp4.length) throw new Error('the video file was not copied whole')
  latest = null
  const { host, url } = deckUrl(prepared.folder, prepared.entry, 'projector')
  registerDeckFolder(host, prepared.folder)
  await win.loadURL(url)
  await until('slide 1 has the video', (s) => s.currentSlide === 0 && s.media?.kinds.join() === 'video')
  await wait(500)
  fs.writeFileSync(path.join(OUT, 'viewer-real-video-before.png'), (await win.webContents.capturePage()).toPNG())
  win.webContents.send('deck:cmd', { type: 'MEDIA', action: 'toggle', index: 0 })
  await until('the real video plays', (s) => s.media?.playing === 0)
  await wait(800)
  const frames = await win.webContents.executeJavaScript(`(() => { const v = document.querySelector('.media video'); return [v.readyState, v.videoWidth, v.currentTime] })()`)
  if (!(frames[0] >= 2 && frames[1] === 320 && frames[2] > 0.2)) throw new Error(`the video does not really play: ${JSON.stringify(frames)}`)
  fs.writeFileSync(path.join(OUT, 'viewer-real-video-playing.png'), (await win.webContents.capturePage()).toPNG())
  console.log(`ok a real PPTX video: found, taken out, plays in place (${frames[1]} px wide, at ${frames[2].toFixed(1)} s)`)
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
    await media(win, prepared.folder)
    await freshProfile()
    await realVideo(win)
    console.log('VIEWER OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    win.destroy()
    app.exit(code)
  }
})
