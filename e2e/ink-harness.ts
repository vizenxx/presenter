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

/** Red pixels (the pen colour of these tests) inside a region of the capture, in capture pixels. */
function redIn(image: NativeImage, x0: number, y0: number, x1: number, y1: number): number {
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  let n = 0
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
      const i = (y * width + x) * 4
      if (bitmap[i + 2] > 180 && bitmap[i + 1] < 110 && bitmap[i] < 110) n++
    }
  }
  return n
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
  const tool = (name: InkTool): void => wc.send('ink:settings', { tool: name, color: '#ef4444', projecting: false, active: true })
  const drag = async (from: [number, number], to: [number, number]): Promise<void> => {
    wc.sendInputEvent({ type: 'mouseDown', x: from[0], y: from[1], button: 'left', clickCount: 1 })
    for (let i = 1; i <= 10; i++) {
      wc.sendInputEvent({ type: 'mouseMove', x: from[0] + ((to[0] - from[0]) * i) / 10, y: from[1] + ((to[1] - from[1]) * i) / 10, button: 'left' })
      await wait(16)
    }
    wc.sendInputEvent({ type: 'mouseUp', x: to[0], y: to[1], button: 'left', clickCount: 1 })
    await wait(250)
  }
  /** A drag along several points; Shift held when shift is true. */
  const dragPath = async (points: Array<[number, number]>, shift: boolean): Promise<void> => {
    const modifiers: Array<'shift'> = shift ? ['shift'] : []
    const [first, ...rest] = points
    wc.sendInputEvent({ type: 'mouseDown', x: first[0], y: first[1], button: 'left', clickCount: 1, modifiers })
    let from = first
    for (const to of rest) {
      for (let i = 1; i <= 8; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: from[0] + ((to[0] - from[0]) * i) / 8, y: from[1] + ((to[1] - from[1]) * i) / 8, button: 'left', modifiers })
        await wait(16)
      }
      from = to
    }
    wc.sendInputEvent({ type: 'mouseUp', x: from[0], y: from[1], button: 'left', clickCount: 1, modifiers })
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

    // 6. Pen with Shift: one straight line from start to end, whatever path the mouse takes.
    wc.send('ink:op', { t: 'clear' })
    ops.length = 0
    tool('pen')
    await wait(100)
    await dragPath([[200, 500], [300, 650], [600, 500]], true)
    const line = await shot('shift-line')
    if (!redAt(line, 400 * scale, 500 * scale)) throw new Error('Shift pen: no straight line between start and end')
    if (redAt(line, 300 * scale, 650 * scale)) throw new Error('Shift pen: the line follows the mouse path')
    console.log('ok Shift pen draws a straight line')

    // 7. Box with Shift: a square (the longer side of the drag wins).
    wc.send('ink:op', { t: 'clear' })
    tool('rect')
    await wait(100)
    await dragPath([[100, 100], [500, 200]], true)
    const square = await shot('shift-square')
    if (!redAt(square, 100 * scale, 450 * scale) || !redAt(square, 300 * scale, 500 * scale)) throw new Error('Shift box: not a 400 x 400 square')
    console.log('ok Shift box draws a square')

    // 8. Arrow: a straight shaft and an open V head at the tip.
    wc.send('ink:op', { t: 'clear' })
    ops.length = 0
    tool('arrow')
    await wait(100)
    await drag([700, 600], [1100, 600])
    const arrow = await shot('arrow')
    const begin = ops.find((o) => o.t === 'begin')
    if (!begin || begin.t !== 'begin' || begin.stroke.tool !== 'arrow') throw new Error('arrow ops missing')
    if (!redAt(arrow, 900 * scale, 600 * scale)) throw new Error('arrow shaft not drawn')
    // The two arms of the V, halfway along them (head 25 px long, 30° from the shaft).
    if (!redAt(arrow, 1089 * scale, 606.3 * scale) || !redAt(arrow, 1089 * scale, 593.7 * scale)) throw new Error('arrow head (V) not drawn')
    console.log('ok arrow with a V head')

    // 9. Arrow with Shift: turned to the nearest 45° step (here: level).
    await dragPath([[200, 300], [420, 330]], true)
    const level = await shot('shift-arrow')
    if (!redAt(level, 320 * scale, 300 * scale) || redAt(level, 320 * scale, 316 * scale)) throw new Error('Shift arrow: not turned to level')
    console.log('ok Shift arrow snaps to 45° steps')

    // 10. A click with the arrow leaves no empty mark behind.
    ops.length = 0
    await drag([640, 100], [640, 100])
    if (!ops.some((o) => o.t === 'erase')) throw new Error('a click with the arrow left an empty mark')
    console.log('ok a click with the arrow leaves nothing')

    // 11. Zoom: drag a box; the page is enlarged so the box fills it; a click shows it all again.
    ops.length = 0
    tool('zoom')
    await wait(100)
    await drag([320, 180], [640, 360])
    const zoom = ops.find((o) => o.t === 'zoom')
    if (!zoom || zoom.t !== 'zoom' || !zoom.rect) throw new Error(`no zoom op: ${JSON.stringify(ops.map((o) => o.t))}`)
    const t1 = await wc.executeJavaScript('document.body.style.transform')
    const zoomScale = Number((/scale\(([0-9.]+)\)/.exec(t1) ?? [])[1])
    if (!(zoomScale > 3.9 && zoomScale < 4.1)) throw new Error(`the page is not enlarged about 4 times: ${t1}`)
    await shot('zoom')
    if (ops.some((o) => o.t === 'begin' && o.stroke.id !== 'zoom-box')) throw new Error('the zoom box left a mark')
    await drag([640, 360], [640, 360])
    const t2 = await wc.executeJavaScript('document.body.style.transform')
    if (t2 !== '') throw new Error(`a click does not show the whole page again: ${t2}`)
    console.log('ok zoom: a box fills the page, a click shows it all again')

    // 12. Text: a click and typing; Esc ends it; the words are drawn red where the click was.
    const typingFlag = (): Promise<boolean> => wc.executeJavaScript(`document.querySelector('presenter-ink')?.dataset.presenterTyping === '1'`)
    const lastText = (): string => {
      const o = [...ops].reverse().find((x) => x.t === 'text')
      return o && o.t === 'text' ? o.text : ''
    }
    const press = async (key: string): Promise<void> => {
      wc.sendInputEvent({ type: 'keyDown', keyCode: key })
      wc.sendInputEvent({ type: 'keyUp', keyCode: key })
      await wait(120)
    }
    const type = async (words: string): Promise<void> => {
      wc.focus()
      await wc.insertText(words)
      await wait(150)
    }
    await drag([640, 360], [640, 360])
    // A clean page: the marks of the tests before would be counted as text.
    wc.send('ink:op', { t: 'clear' })
    await wait(150)
    ops.length = 0
    tool('text')
    await wait(100)
    await drag([300, 200], [300, 200])
    await wait(200)
    if (!(await typingFlag())) throw new Error('the page is not told that a text is typed (keys would turn pages)')
    const begun = ops.find((o) => o.t === 'begin')
    if (!begun || begun.t !== 'begin' || begun.stroke.tool !== 'text' || begun.stroke.points.length !== 2) throw new Error(`a click does not begin a text: ${JSON.stringify(begun)}`)
    await type('Hello class')
    if (lastText() !== 'Hello class') throw new Error(`typed words not sent: "${lastText()}"`)
    await press('Escape')
    if (await typingFlag()) throw new Error('Esc did not end the typing')
    const hello = await shot('text-click')
    if (redIn(hello, 300 * scale, 200 * scale, 700 * scale, 260 * scale) < 80) throw new Error('the typed words are not drawn where the click was')
    if (redIn(hello, 300 * scale, 300 * scale, 700 * scale, 700 * scale) > 0) throw new Error('a one-line text drew below its line')
    console.log('ok text: a click, typing, Esc; the words stand where the click was')

    // 13. Empty text leaves no mark; the click on a text edits it again.
    ops.length = 0
    await drag([900, 500], [900, 500])
    await press('Escape')
    if (!ops.some((o) => o.t === 'erase')) throw new Error('an empty text was kept')
    await drag([320, 215], [320, 215])
    await wait(200)
    await type('!')
    if (lastText() !== 'Hello class!') throw new Error(`editing a text again: "${lastText()}"`)
    await press('Escape')
    console.log('ok text: empty text leaves nothing; a click on a text edits it')

    // 14. A dragged box: the text wraps inside it and gets smaller; nothing is drawn outside the box.
    ops.length = 0
    await drag([700, 100], [1100, 260])
    await wait(200)
    await type('Wrapping words in a box should stay inside the box and get smaller when there are many of them. '.repeat(3))
    await press('Escape')
    const boxText = await shot('text-box')
    const inside = redIn(boxText, 700 * scale, 100 * scale, 1100 * scale, 262 * scale)
    const around = redIn(boxText, 640 * scale, 262 * scale, 1280 * scale, 520 * scale) + redIn(boxText, 640 * scale, 0, 1280 * scale, 96 * scale) + redIn(boxText, 1104 * scale, 100 * scale, 1280 * scale, 262 * scale)
    if (inside < 300) throw new Error(`the boxed text is not drawn in the box (${inside})`)
    if (around > 0) throw new Error(`the boxed text runs outside the box (${around} px)`)
    console.log('ok text: a dragged box keeps the text inside it')

    // 15. Too much text for a small box is refused (at the smallest size).
    ops.length = 0
    await drag([100, 500], [260, 560])
    await wait(200)
    await type('x '.repeat(400))
    const kept = lastText().length
    await press('Escape')
    if (!(kept > 0 && kept < 800)) throw new Error(`a small box took ${kept} of 800 letters`)
    console.log(`ok text: a small box takes ${kept} of 800 letters, then refuses`)

    // 16. A text moves with a drag, and stays on the slide.
    ops.length = 0
    await dragPath([[330, 215], [530, 415]], false)
    const moved = [...ops].reverse().find((o) => o.t === 'rect')
    if (!moved || moved.t !== 'rect' || moved.points.length !== 2 || !(moved.points[0] > 0.3)) throw new Error(`a text did not move: ${JSON.stringify(moved)}`)
    const after = await shot('text-moved')
    if (redIn(after, 520 * scale, 400 * scale, 900 * scale, 470 * scale) < 80) throw new Error('the moved text is not at its new place')
    if (redIn(after, 300 * scale, 200 * scale, 480 * scale, 260 * scale) > 0) throw new Error('the text is still at its old place')
    console.log('ok text: a drag moves it')

    // 17. The eraser removes a text; Undo removes the last one.
    ops.length = 0
    tool('eraser')
    await wait(100)
    await drag([540, 430], [700, 430])
    if (!ops.some((o) => o.t === 'erase')) throw new Error('the eraser did not remove the text')
    const textGone = await shot('text-erased')
    if (redIn(textGone, 520 * scale, 400 * scale, 900 * scale, 470 * scale) > 0) throw new Error('the erased text is still drawn')
    console.log('ok text: the eraser removes it')
    console.log('INK OK')
  } catch (error) {
    console.error(String(error))
    code = 1
  } finally {
    win.destroy()
    app.exit(code)
  }
})
