import { useEffect, useRef, useState } from 'react'
import { attachInkInput, drawInk, INK_COLORS, InkScene, type InkSettings, type InkTool } from '../../../shared/ink'
import { inkSvg, type InkIconName } from '../../../shared/inkIcons'
import { useT, type Strings } from './i18n'
import { AspectBox } from './ViewSlot'

const TOOLS: Array<{ tool: InkTool; key: string; label: (t: Strings) => string }> = [
  { tool: 'pointer', key: 'Esc', label: (t) => t.inkPointer },
  { tool: 'pen', key: 'P', label: (t) => t.inkPen },
  { tool: 'highlighter', key: 'H', label: (t) => t.inkHighlighter },
  { tool: 'rect', key: 'R', label: (t) => t.inkRect },
  { tool: 'laser', key: 'L', label: (t) => t.inkLaser },
  { tool: 'eraser', key: 'E', label: (t) => t.inkEraser }
]

/** Console shortcuts for the marking tools (no modifier keys). */
export const INK_KEYS: Record<string, InkTool> = { p: 'pen', h: 'highlighter', r: 'rect', l: 'laser', e: 'eraser' }

const CURSORS: Record<InkTool, string> = { pointer: 'pointer', pen: 'crosshair', highlighter: 'crosshair', rect: 'crosshair', laser: 'none', eraser: 'cell' }

function Icon({ name }: { name: InkIconName }) {
  return <span className="grid shrink-0 place-items-center" dangerouslySetInnerHTML={{ __html: inkSvg(name, 18) }} />
}

/** Marking tools. The same tool is active on the console and on the projector palette. */
export function InkToolbar({ ink, enabled }: { ink: InkSettings; enabled: boolean }) {
  const t = useT()
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 rounded-[20px] bg-panel-2 px-1.5 py-1" title={t.inkHint}>
      {TOOLS.map(({ tool, key, label }) => (
        <button
          key={tool}
          type="button"
          disabled={!enabled}
          title={tool === 'pointer' ? t.inkPointerTitle : t.inkToolTitle(label(t), key)}
          onClick={() => window.presenter.setInkTool(tool)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm disabled:opacity-40 ${ink.tool === tool ? 'bg-accent font-semibold text-white' : 'text-ink hover:bg-line'}`}
        >
          <Icon name={tool} />
          {label(t)}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-line" />
      {INK_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={!enabled}
          title={t.inkColor}
          onClick={() => window.presenter.setInkColor(color)}
          style={{ background: color }}
          className={`m-0.5 h-6 w-6 rounded-full ring-1 ring-black/15 ring-inset disabled:opacity-40 ${ink.color === color ? 'outline-2 outline-offset-2 outline-accent' : ''}`}
        />
      ))}
      <span className="mx-1 h-5 w-px bg-line" />
      {/* Undo and Clear show icons only (names in the tooltip) so the bar stays on one line. */}
      <button type="button" disabled={!enabled} title={`${t.inkUndo} · ${t.inkUndoTitle}`} aria-label={t.inkUndo} onClick={() => window.presenter.inkOp({ t: 'undo' }, false)} className="rounded-full p-1.5 text-ink hover:bg-line disabled:opacity-40">
        <Icon name="undo" />
      </button>
      <button type="button" disabled={!enabled} title={`${t.inkClear} · ${t.inkClearTitle}`} aria-label={t.inkClear} onClick={() => window.presenter.inkOp({ t: 'clear' }, false)} className="rounded-full p-1.5 text-ink hover:bg-line disabled:opacity-40">
        <Icon name="clear" />
      </button>
    </div>
  )
}

/**
 * While projecting: a live video of the projector window (captured like screen
 * sharing) with a marking canvas on top. Marks draw here at once and reach the
 * projector as small operations, so neither side waits for the video.
 */
export function MirrorView({ aspect, ink, fallback }: { aspect: number; ink: InkSettings; fallback: string | null }) {
  const t = useT()
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const settings = useRef(ink)
  settings.current = ink
  const [live, setLive] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop())
          return
        }
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        setLive(true)
        window.presenter.mirrorMode('video')
      })
      .catch(() => window.presenter.mirrorMode('snapshot'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d') as CanvasRenderingContext2D
    const scene = new InkScene()
    let frame = 0
    const redraw = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const r = el.getBoundingClientRect()
        const ratio = window.devicePixelRatio || 1
        const w = Math.round(r.width * ratio)
        const h = Math.round(r.height * ratio)
        if (el.width !== w || el.height !== h) {
          el.width = w
          el.height = h
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        drawInk(ctx, r.width, r.height, scene)
      })
    }
    void window.presenter.inkSnapshot().then((strokes) => {
      scene.strokes = strokes.map((s) => ({ ...s, points: [...s.points] }))
      redraw()
    })
    const unsubscribe = window.presenter.onInkOp((op) => {
      scene.apply(op)
      redraw()
    })
    const detach = attachInkInput({
      element: el,
      settings: () => settings.current,
      scene,
      onOp: (op) => {
        scene.apply(op)
        redraw()
        window.presenter.inkOp(op, true)
      }
    })
    const ro = new ResizeObserver(redraw)
    ro.observe(el)
    return () => {
      unsubscribe()
      detach()
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  const drawing = ink.tool !== 'pointer'
  return (
    <AspectBox aspect={aspect}>
      {!live && fallback && <img src={fallback} alt="" className="absolute inset-0 h-full w-full object-fill" />}
      <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-fill" />
      {!live && !fallback && <span className="absolute inset-0 grid place-items-center text-sm text-muted">{t.waitingPicture}</span>}
      <canvas
        ref={canvas}
        title={drawing ? undefined : t.selectProjector}
        onClick={() => {
          if (!drawing) window.presenter.select('projector')
        }}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: CURSORS[ink.tool], touchAction: 'none' }}
      />
    </AspectBox>
  )
}
