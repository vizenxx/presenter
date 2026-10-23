import { useRef } from 'react'
import { computeRects, dividers, leaves, ratioAt, type TileDivider, type TilePreset } from '../../../shared/tiles'
import type { AppState, OutputView, SplitView } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { Btn } from './ui'

/** The editor draws the projector at this many units wide; the real pixels do not matter here. */
const W = 1000
const GAP = 18

/** A divider of the split: pulled with the pointer (the ratio follows it at once), double-clicked to give everyone the same room. */
function Handle({ d, n, scale, box }: { d: TileDivider; n: number; scale: number; box: React.RefObject<HTMLDivElement | null> }) {
  const t = useT()
  const frame = useRef(0)
  const move = (e: React.PointerEvent): void => {
    const el = box.current
    if (!el || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * W
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * (W / scale)
    const ratio = ratioAt(d, x, y, GAP)
    // One message per frame is plenty.
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => window.presenter.setSplitRatio(n, d.path, ratio))
  }
  const row = d.dir === 'row'
  return (
    <div
      role="separator"
      aria-orientation={row ? 'vertical' : 'horizontal'}
      title={t.dividerTitle}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={move}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      onDoubleClick={() => window.presenter.arrangeSplit(n, 'even')}
      className={`absolute z-10 rounded-full bg-accent/40 hover:bg-accent ${row ? 'cursor-col-resize' : 'cursor-row-resize'}`}
      style={{
        left: `${(d.rect.x / W) * 100}%`,
        top: `${(d.rect.y / (W / scale)) * 100}%`,
        width: `${(d.rect.width / W) * 100}%`,
        height: `${(d.rect.height / (W / scale)) * 100}%`,
        touchAction: 'none'
      }}
    />
  )
}

const PRESETS: Array<[TilePreset | 'even', string]> = [
  ['side', '▥'],
  ['stack', '☰'],
  ['grid', '▦'],
  ['main', '◧'],
  ['even', '＝']
]

/**
 * How the contents of one projector share its screen: the arrangements, a small picture of the screen with
 * dividers to pull (as in a tiling window manager or the editor grid of VS Code), and each content's own buttons.
 */
export function LayoutEditor({ state, split }: { state: AppState; split: SplitView }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const scale = split.width / Math.max(1, split.height)
  const rect = { x: 0, y: 0, width: W, height: W / scale }
  const rects = computeRects(split.tree, rect, GAP)
  const handles = dividers(split.tree, rect, GAP)
  const ids = leaves(split.tree)
  const mainId = split.number === 1 ? state.onAirId : (state.projectors.find((p) => p.number === split.number)?.contentId ?? null)
  const outputOf = (id: string): OutputView | undefined => state.outputs.find((o) => o.id === id)
  const label = (id: string): string => {
    const o = outputOf(id)
    return o ? [screenLabel(t, o), o.deck?.name].filter(Boolean).join(' · ') : id
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{t.layoutTitle(split.number)}</span>
        <span className="ml-auto flex gap-1">
          {PRESETS.map(([kind, glyph]) => (
            <Btn key={kind} title={t.layoutPresetTitle[kind]} onClick={() => window.presenter.arrangeSplit(split.number, kind)}>
              <span aria-hidden="true" className="text-base leading-none">
                {glyph}
              </span>
              <span className="sr-only">{t.layoutPresetTitle[kind]}</span>
            </Btn>
          ))}
        </span>
      </div>
      <div ref={box} className="relative w-full overflow-hidden rounded-lg bg-black/60 ring-1 ring-line" style={{ aspectRatio: `${scale}` }}>
        {ids.map((id) => {
          const r = rects.get(id)
          if (!r) return null
          const main = id === mainId
          return (
            <button
              key={id}
              type="button"
              title={label(id)}
              onClick={() => window.presenter.select(id)}
              className={`absolute flex items-center justify-center overflow-hidden rounded-md bg-panel-2 p-1 text-center text-sm hover:bg-line ${main ? 'ring-2 ring-accent' : ''}`}
              style={{ left: `${(r.x / W) * 100}%`, top: `${(r.y / rect.height) * 100}%`, width: `${(r.width / W) * 100}%`, height: `${(r.height / rect.height) * 100}%` }}
            >
              <span className="line-clamp-3 break-words">{label(id)}</span>
            </button>
          )
        })}
        {handles.map((d) => (
          <Handle key={d.path.join('') || 'root'} d={d} n={split.number} scale={scale} box={box} />
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {ids.map((id, i) => (
          <li key={id} className="flex items-center gap-2 text-sm">
            <span className={`min-w-0 flex-1 truncate ${id === mainId ? 'font-semibold' : ''}`} title={label(id)}>
              {label(id)}
            </span>
            {i > 0 && (
              <button type="button" title={t.tileSwapTitle} onClick={() => window.presenter.swapTiles(split.number, ids[i - 1], id)} className="rounded-full px-2 py-0.5 hover:bg-line">
                ⇄
              </button>
            )}
            <button type="button" title={t.tileAloneTitle} onClick={() => window.presenter.showOn(id, split.number)} className="rounded-full px-2 py-0.5 hover:bg-line">
              {t.tileAlone}
            </button>
            <button type="button" title={t.tileRemoveTitle} onClick={() => window.presenter.showOn(id, null)} className="rounded-full px-2 py-0.5 text-muted hover:bg-line">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">{t.layoutHelp}</p>
    </div>
  )
}
