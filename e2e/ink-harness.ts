/**
 * Off-screen check of the marking layer in the projector deck page: real deck preload,
 * real ink engine, mouse input, pixels. No window appears and nothing plays, so it is
 * safe while a class is on the projector. Build first, then: npm run check:ink
 */
import { app, BrowserWindow, ipcMain, session, type NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { InkOp, InkTool } from '../src/shared/ink'
import { deckUrl } from '../src/main/deckPaths'
import { installDeckProtocol, registerDeckFolder, registerDeckScheme } from '../src/main/deckProtocol'

// Bundled to e2e/out/harness/, three levels below the project root.
const ROOT = path.resolve(__dirname, '..', '..', '..')
const OUT = path.join(ROOT, 'e2e', 'out')
const FIXTURE = path.join(ROOT, 'e2e', 'fixtures')

registerDeckScheme()
app.disableHardwareAcceleration()

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const ops: InkOp[] = []
let ready = false
ipcMain.on('ink:op', (_e, op: InkOp) => ops.push(op))
ipcMain.on('ink:ready', () => {
  ready = true
})
for (const channel of ['deck:state', 'deck:editing', 'deck:pointer', 'ink:set-tool', 'ink:set-color']) ipcMain.on(channel, () => undefined)

/** True when a clearly red pixel lies within 2 px of (x, y) (antialiased edges vary by a pixel). */
function redAt(image: NativeImage, x: number, y: number): boolean {
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = Math.round(x) + dx
      const py = Math.round(y) + dy
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      const i = (py * width + px) * 4
      if (bitmap[i + 2] > 180 && bitmap[i + 1] < 110 && bitmap[i] < 110) return true
    }
  }
  return false
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const ses = session.fromPartition('ink-harness')
  installDeckProtocol(ses)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: { session: ses, preload: path.join(ROOT, 'out', 'preload', 'deck.js'), contextIsolation: true, sandbox: true, offscreen: true }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.log(`[page error] ${event.message}`)
  })
  const wc = win.webContents
  const tool = (name: InkTool): void => wc.send('ink:settings', { tool: name, color: '#ef4444', projecting: false })
  const drag = async (from: [number, number], to: [number, number]): Promise<void> => {
    wc.sendInputEvent({ type: 'mouseDown', x: from[0], y: from[1], button: 'left', clickCount: 1 })
    for (let i = 1; i <= 10; i++) {
      wc.sendInputEvent({ type: 'mouseMove', x: from[0] + ((to[0] - from[0]) * i) / 10, y: from[1] + ((to[1] - from[1]) * i) / 10, button: 'left' })
      await wait(16)
    }
    wc.sendInputEvent({ type: 'mouseUp', x: to[0], y: to[1], button: 'left', clickCount: 1 })
    await wait(250)
  }
  const shot = async (name: string): Promise<NativeImage> => {
    await wait(250)
    const image = await wc.capturePage()
    fs.writeFileSync(path.join(OUT, `ink-${name}.png`), image.toPNG())
    return image
  }

  let code = 0
  try {
    const { host, url } = deckUrl(FIXTURE, 'plain-deck.html', 'projector')
    registerDeckFolder(host, FIXTURE)
    await win.loadURL(url)
    for (let i = 0; i < 50 && !ready; i++) await wait(100)
    if (!ready) throw new Error('ink layer did not report ready')
    // Device pixels per page pixel (the capture can be a few pixels wider than the page).
    const scale = Math.max(1, Math.round((await shot('blank')).getSize().width / 1280))

    // 1. Pen: a stroke draws red on the page and is sent as begin + extend.
    tool('pen')
    await wait(100)
    await drag([200, 200], [600, 400])
    const pen = await shot('pen')
    if (!ops.some((o) => o.t === 'begin') || !ops.some((o) => o.t === 'extend')) throw new Error(`pen ops missing: ${JSON.stringify(ops.map((o) => o.t))}`)
    if (!redAt(pen, 400 * scale, 300 * scale)) throw new Error('pen stroke not drawn at the middle of the drag')
    console.log(`ok pen: ${ops.length} ops sent, stroke drawn`)

    // 2. Box: two corners, drawn as an outline (edge red, middle not).
    ops.length = 0
    tool('rect')
    await wait(100)
    await drag([700, 150], [1100, 450])
    const box = await shot('box')
    const last = [...ops].reverse().find((o) => o.t === 'rect')
    if (!last || last.t !== 'rect') throw new Error('box ops missing')
    if (!redAt(box, 700 * scale, 300 * scale) || redAt(box, 900 * scale, 300 * scale)) throw new Error('box not drawn as an outline')
    console.log('ok box: outline drawn')

    // 3. Eraser: crossing the pen stroke removes it.
    ops.length = 0
    tool('eraser')
    await wait(100)
    await drag([380, 150], [420, 450])
    const erased = await shot('erased')
    if (!ops.some((o) => o.t === 'erase')) throw new Error('eraser sent nothing')
    if (redAt(erased, 400 * scale, 300 * scale)) throw new Error('pen stroke still visible after erasing')
    console.log('ok eraser')

    // 4. A clear from the main process (e.g. a page turn) empties the layer.
    wc.send('ink:op', { t: 'clear' })
    const cleared = await shot('cleared')
    if (redAt(cleared, 700 * scale, 300 * scale)) throw new Error('marks still visible after clear')
    console.log('ok clear')

    // 5. A stroke made on the console arrives as operations and draws here.
    wc.send('ink:op', { t: 'begin', stroke: { id: 'console-1', tool: 'pen', color: '#ef4444', points: [0.1, 0.8, 0.5, 0.8] } })
    const remote = await shot('remote')
    if (!redAt(remote, 0.3 * 1280 * scale, 0.8 * 720 * scale)) throw new Error('console stroke not drawn on the projector page')
    console.log('ok console stroke drawn on the projector page')
    console.log('INK OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    win.destroy()
    app.exit(code)
  }
})
