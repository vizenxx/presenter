import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { clock } from '../../../shared/format'
import { INK_COLORS, type InkTool } from '../../../shared/ink'
import { inkSvg, type InkIconName } from '../../../shared/inkIcons'
import { useAppState } from '../console/hooks'
import { screenLabel, useT } from '../console/i18n'
import { speakerSeconds, useNow } from '../console/SpeakerTimer'

const TOOLS: InkTool[] = ['pointer', 'pen', 'highlighter', 'rect', 'laser', 'eraser']
const ICON_BTN = 'grid h-8 w-8 place-items-center rounded-lg hover:bg-line'
const SMALL_BTN = 'rounded-md px-1.5 py-0.5 text-sm hover:bg-line'

function Icon({ name }: { name: InkIconName }) {
  return <span className="grid place-items-center" dangerouslySetInnerHTML={{ __html: inkSvg(name, 18) }} />
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 border-l border-line pl-2">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </span>
  )
}

/**
 * The floating tools over a program window shown on a projector: marks, the name picker, and
 * My timer's time while it runs (the teacher's choice: no class timer here, no My timer buttons).
 * It floats above the window, can fold to a small handle, is left out of screen capture, and
 * the audience never sees it.
 */
function Toolbar() {
  const t = useT()
  const state = useAppState()
  const [open, setOpen] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  const running = !!state && state.speaker.startedAt !== null
  const now = useNow(running)

  // The window is exactly as big as the bar; it tells the main process whenever that changes.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const report = (): void => window.presenter.toolbarSize(el.offsetWidth, el.offsetHeight)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [])

  const target = state?.outputs.find((o) => o.id === state.toolsFor)
  const speaker = state?.speaker
  const mine = speaker ? speakerSeconds(speaker, now) : 0
  // My timer shows only once the teacher has started it (running or paused).
  const mineSet = !!speaker && (speaker.startedAt !== null || speaker.heldMs > 0)
  const tool = state?.ink.tool ?? 'pointer'

  return (
    <div ref={root} className="inline-flex items-center gap-2 rounded-2xl border border-line bg-panel/95 px-2 py-1.5 text-ink shadow-2xl">
      <span className="cursor-move px-1 text-lg leading-none text-muted [-webkit-app-region:drag]" title={t.toolbarDrag}>
        ⠿
      </span>
      {!open || !state || !speaker ? (
        <button type="button" onClick={() => setOpen(true)} title={target ? t.toolbarFor(screenLabel(t, target)) : undefined} className={`${SMALL_BTN} font-semibold`}>
          ✎ {t.toolbarTitle} ▸
        </button>
      ) : (
        <>
          <span className="flex items-center gap-0.5" title={target ? t.toolbarFor(screenLabel(t, target)) : undefined}>
            {TOOLS.map((name) => (
              <button key={name} type="button" onClick={() => window.presenter.setInkTool(name)} className={`${ICON_BTN} ${tool === name ? 'bg-accent text-black' : ''}`}>
                <Icon name={name} />
              </button>
            ))}
            {INK_COLORS.map((color) => (
              <button key={color} type="button" title={t.inkColor} onClick={() => window.presenter.setInkColor(color)} style={{ background: color }} className={`mx-0.5 h-5 w-5 rounded-full border-2 border-white/30 ${state.ink.color === color ? 'outline-2 outline-offset-1 outline-accent' : ''}`} />
            ))}
            <button type="button" title={t.inkUndo} onClick={() => window.presenter.inkOp({ t: 'undo' }, false)} className={ICON_BTN}>
              <Icon name="undo" />
            </button>
            <button type="button" title={t.inkClear} onClick={() => window.presenter.inkOp({ t: 'clear' }, false)} className={ICON_BTN}>
              <Icon name="clear" />
            </button>
          </span>
          {mineSet && (
            <Group label={t.mineShort}>
              <span title={t.myTimerTitle} className={`font-mono text-lg font-bold tabular-nums ${speaker.mode === 'down' && mine < 0 ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>
                {clock(mine)}
              </span>
            </Group>
          )}
          <span className="flex items-center gap-1 border-l border-line pl-2">
            {state.roller.showing ? (
              <button type="button" onClick={() => window.presenter.rollerHide()} className={SMALL_BTN}>
                {t.hidePickShort}
              </button>
            ) : (
              <button type="button" onClick={() => window.presenter.rollerRoll()} className={SMALL_BTN}>
                🎲 {t.pickShort}
              </button>
            )}
            <button type="button" title={t.toolbarHide} onClick={() => setOpen(false)} className={SMALL_BTN}>
              ◂
            </button>
          </span>
        </>
      )}
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Toolbar />)
