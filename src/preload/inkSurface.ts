/**
 * The marking layer inside the projector deck page (isolated world, shadow DOM so
 * the deck's own CSS cannot reach it). Local strokes draw at once and go to the
 * main process as small operations; strokes made on the console arrive the same way.
 */
import { ipcRenderer } from 'electron'
import { attachInkInput, drawInk, INK_COLORS, InkScene, type InkOp, type InkSettings, type InkStroke, type InkTool } from '../shared/ink'
import { inkSvg, type InkIconName } from '../shared/inkIcons'

interface SurfaceSettings extends InkSettings {
  /** The palette shows only on the projector while projecting. */
  projecting: boolean
}

const PALETTE_IDLE_MS = 2500
const CURSORS: Record<InkTool, string> = { pointer: 'default', pen: 'crosshair', highlighter: 'crosshair', rect: 'crosshair', laser: 'none', eraser: 'cell' }
const TOOLS: InkTool[] = ['pointer', 'pen', 'highlighter', 'rect', 'laser', 'eraser']

const CSS = `
  :host { all: initial; }
  canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; touch-action: none; }
  .palette { position: fixed; left: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 16px;
    background: rgba(17, 24, 39, 0.86); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  .palette.show { opacity: 1; pointer-events: auto; }
  .row { display: flex; gap: 4px; }
  button { all: unset; box-sizing: border-box; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 10px; color: #e5e7eb; cursor: pointer; }
  button:hover { background: rgba(255, 255, 255, 0.12); }
  button.on { background: #f59e0b; color: #111; }
  .swatch { width: 28px; height: 28px; margin: 6px; border-radius: 999px; border: 2px solid rgba(255, 255, 255, 0.35); }
  .swatch.on { outline: 3px solid #f59e0b; outline-offset: 2px; }
`

export function mountInkSurface(): void {
  const scene = new InkScene()
  let settings: SurfaceSettings = { tool: 'pointer', color: INK_COLORS[0], projecting: false }

  const host = document.createElement('presenter-ink')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;'
  const root = host.attachShadow({ mode: 'closed' })
  const tool = (name: InkTool): string => `<button data-tool="${name}" title="${name}">${inkSvg(name as InkIconName)}</button>`
  root.innerHTML = `<style>${CSS}</style><canvas></canvas>
    <div class="palette">
      <div class="row">${TOOLS.slice(0, 3).map(tool).join('')}</div>
      <div class="row">${TOOLS.slice(3).map(tool).join('')}</div>
      <div class="row">${INK_COLORS.slice(0, 3).map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row">${INK_COLORS.slice(3).map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row"><button data-action="undo">${inkSvg('undo')}</button><button data-action="clear">${inkSvg('clear')}</button></div>
    </div>`
  const canvas = root.querySelector('canvas') as HTMLCanvasElement
  const palette = root.querySelector('.palette') as HTMLDivElement
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  let frame = 0
  const redraw = (): void => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const ratio = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio)
        canvas.height = Math.round(h * ratio)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawInk(ctx, w, h, scene)
    })
  }

  const send = (op: InkOp): void => {
    scene.apply(op)
    redraw()
    ipcRenderer.send('ink:op', op)
  }

  const apply = (): void => {
    const drawing = settings.tool !== 'pointer'
    canvas.style.pointerEvents = drawing ? 'auto' : 'none'
    canvas.style.cursor = CURSORS[settings.tool]
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-tool]')) b.classList.toggle('on', b.dataset['tool'] === settings.tool)
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-color]')) b.classList.toggle('on', b.dataset['color'] === settings.color)
    if (!settings.projecting) palette.classList.remove('show')
  }

  attachInkInput({ element: canvas, settings: () => settings, scene, onOp: send })

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
  })
  ipcRenderer.on('ink:snapshot', (_e, strokes: InkStroke[]) => {
    scene.strokes = strokes.map((s) => ({ ...s, points: [...s.points] }))
    scene.laser = null
    redraw()
  })
  ipcRenderer.on('ink:settings', (_e, next: SurfaceSettings) => {
    settings = next
    apply()
  })
  window.addEventListener('resize', redraw)

  const attach = (): void => {
    document.documentElement.appendChild(host)
    apply()
    redraw()
    ipcRenderer.send('ink:ready')
  }
  if (document.documentElement) attach()
  else document.addEventListener('DOMContentLoaded', attach, { once: true })
}
