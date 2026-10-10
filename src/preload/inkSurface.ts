/**
 * The marking layer inside the projector deck page (isolated world, shadow DOM so
 * the deck's own CSS cannot reach it). Local strokes draw at once and go to the
 * main process as small operations; strokes made on the console arrive the same way.
 */
import { ipcRenderer } from 'electron'
import { attachInkInput, drawInk, INK_COLORS, INK_TOOLS, InkScene, zoomTransform, type InkOp, type InkSettings, type InkStroke, type InkTool } from '../shared/ink'
import { inkSvg, type InkIconName } from '../shared/inkIcons'

interface SurfaceSettings extends InkSettings {
  /** The palette shows only on the projector while projecting. */
  projecting: boolean
  /** Only the screen on the projector shows and takes marks. */
  active: boolean
}

const PALETTE_IDLE_MS = 2500
const CURSORS: Record<InkTool, string> = { pointer: 'default', pen: 'crosshair', highlighter: 'crosshair', rect: 'crosshair', arrow: 'crosshair', text: 'text', laser: 'none', eraser: 'cell', zoom: 'zoom-in' }

const CSS = `
  :host { all: initial; }
  canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; touch-action: none; }
  .palette { position: fixed; left: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 22px;
    background: rgba(28, 28, 30, 0.88); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  .palette.show { opacity: 1; pointer-events: auto; }
  .row { display: flex; gap: 4px; }
  button { all: unset; box-sizing: border-box; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 999px; color: #f5f5f7; cursor: pointer; }
  button:hover { background: rgba(255, 255, 255, 0.12); }
  button.on { background: #0071e3; color: #fff; }
  .swatch { width: 28px; height: 28px; margin: 6px; border-radius: 999px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2); }
  .swatch.on { outline: 3px solid #0071e3; outline-offset: 2px; }
`

export function mountInkSurface(): void {
  const scene = new InkScene()
  let settings: SurfaceSettings = { tool: 'pointer', color: INK_COLORS[0], projecting: false, active: false }

  const host = document.createElement('presenter-ink')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;'
  const root = host.attachShadow({ mode: 'closed' })
  const tool = (name: InkTool): string => `<button data-tool="${name}" title="${name}">${inkSvg(name as InkIconName)}</button>`
  root.innerHTML = `<style>${CSS}</style><canvas></canvas><div class="text-host"></div>
    <div class="palette">
      <div class="row">${INK_TOOLS.slice(0, 5).map(tool).join('')}</div>
      <div class="row">${INK_TOOLS.slice(5).map(tool).join('')}</div>
      <div class="row">${INK_COLORS.slice(0, 3).map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row">${INK_COLORS.slice(3).map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row"><button data-action="undo">${inkSvg('undo')}</button><button data-action="clear">${inkSvg('clear')}</button></div>
    </div>`
  const canvas = root.querySelector('canvas') as HTMLCanvasElement
  const palette = root.querySelector('.palette') as HTMLDivElement
  const textHost = root.querySelector('.text-host') as HTMLDivElement
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  let frame = 0
  const redraw = (): void => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const ratio = window.devicePixelRatio || 1
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio)
        canvas.height = Math.round(h * ratio)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawInk(ctx, w, h, scene)
    })
  }

  // The ink pad lies on the teacher's real window: it never enlarges (the projector's picture does).
  const isPad = location.pathname.endsWith('inkpad.html')
  let savedOverflow: string | null = null
  /** Enlarges the page (and its marks, which keep their places on it) to show the zoom box, or shows it all again. */
  const applyZoom = (): void => {
    if (isPad || !document.body) return
    const rect = scene.zoom
    const W = window.innerWidth
    const H = window.innerHeight
    if (!rect) {
      document.body.style.transform = ''
      canvas.style.transform = ''
      document.documentElement.style.overflow = savedOverflow ?? ''
      savedOverflow = null
      return
    }
    // The enlarged page is larger than the window: no scroll bars meanwhile.
    if (savedOverflow === null) savedOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const { s, tx, ty } = zoomTransform(rect)
    document.body.style.transformOrigin = '0 0'
    document.body.style.transform = `translate(${tx * W}px, ${ty * H}px) scale(${s})`
    // The canvas sits outside the page body (maybe on the window picture's frame): same move, from its own corner.
    const r = { left: parseFloat(canvas.style.left) || 0, top: parseFloat(canvas.style.top) || 0 }
    canvas.style.transformOrigin = '0 0'
    canvas.style.transform = `translate(${tx * W + (s - 1) * r.left}px, ${ty * H + (s - 1) * r.top}px) scale(${s})`
  }

  const send = (op: InkOp): void => {
    scene.apply(op)
    redraw()
    if (op.t === 'zoom') applyZoom()
    ipcRenderer.send('ink:op', op)
  }

  const apply = (): void => {
    host.style.display = settings.active ? 'block' : 'none'
    // Text is typed on the slide only; the ink pad over a program window leaves the clicks to the window.
    const drawing = settings.tool !== 'pointer' && !(isPad && settings.tool === 'text')
    canvas.style.pointerEvents = drawing ? 'auto' : 'none'
    canvas.style.cursor = CURSORS[settings.tool]
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-tool]')) b.classList.toggle('on', b.dataset['tool'] === settings.tool)
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-color]')) b.classList.toggle('on', b.dataset['color'] === settings.color)
    if (!settings.projecting) palette.classList.remove('show')
  }

  attachInkInput({
    element: canvas,
    settings: () => settings,
    scene,
    onOp: send,
    textHost: isPad ? undefined : textHost,
    // The deck's preload tells the main process that a text is being typed, so keys are not taken for page turns.
    onTyping: (typing) => {
      if (typing) host.dataset['presenterTyping'] = '1'
      else delete host.dataset['presenterTyping']
    }
  })

  // While drawing, the deck must not react to the same clicks (some decks advance on click).
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
    host.addEventListener(type, (e) => {
      if (settings.tool !== 'pointer' && e.composedPath()[0] === canvas) e.stopPropagation()
    })
  }

  palette.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button')
    if (!button) return
    if (button.dataset['tool']) ipcRenderer.send('ink:set-tool', button.dataset['tool'])
    else if (button.dataset['color']) ipcRenderer.send('ink:set-color', button.dataset['color'])
    else if (button.dataset['action'] === 'undo') send({ t: 'undo' })
    else if (button.dataset['action'] === 'clear') send({ t: 'clear' })
  })

  // The palette appears when the mouse moves on the projector, like PowerPoint's show toolbar.
  let idle = 0
  window.addEventListener(
    'pointermove',
    () => {
      if (!settings.projecting) return
      palette.classList.add('show')
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        if (!palette.matches(':hover')) palette.classList.remove('show')
      }, PALETTE_IDLE_MS)
    },
    true
  )

  ipcRenderer.on('ink:op', (_e, op: InkOp) => {
    scene.apply(op)
    redraw()
    if (op.t === 'zoom') applyZoom()
  })
  ipcRenderer.on('ink:snapshot', (_e, strokes: InkStroke[]) => {
    scene.replace(strokes)
    redraw()
  })
  ipcRenderer.on('ink:settings', (_e, next: SurfaceSettings) => {
    settings = next
    apply()
  })
  window.addEventListener('resize', redraw)
  // A window content's page says where the program window's picture is (letterboxed video);
  // marks use that area, so they match the ink pad lying on the real window.
  const applyFrame = (): void => {
    const f = document.documentElement?.dataset['presenterInkFrame']
    const parts = f ? f.split(',').map(Number) : []
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      canvas.style.left = `${parts[0]}px`
      canvas.style.top = `${parts[1]}px`
      canvas.style.width = `${parts[2]}px`
      canvas.style.height = `${parts[3]}px`
      canvas.style.right = 'auto'
      canvas.style.bottom = 'auto'
    }
    redraw()
  }

  const attach = (): void => {
    document.documentElement.appendChild(host)
    // Only now does the page's root exist to be watched.
    new MutationObserver(applyFrame).observe(document.documentElement, { attributes: true, attributeFilter: ['data-presenter-ink-frame'] })
    applyFrame()
    apply()
    redraw()
    ipcRenderer.send('ink:ready')
  }
  if (document.documentElement) attach()
  else document.addEventListener('DOMContentLoaded', attach, { once: true })
}
