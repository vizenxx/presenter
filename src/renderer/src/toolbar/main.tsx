import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { clock, mmss } from '../../../shared/format'
import { INK_COLORS, type InkTool } from '../../../shared/ink'
import { inkSvg, type InkIconName } from '../../../shared/inkIcons'
import type { AppState } from '../../../shared/types'
import { useAppState } from '../console/hooks'
import { screenLabel, useT } from '../console/i18n'
import { useRollFace } from '../console/RollerPanel'
import { speakerSeconds, useNow } from '../console/SpeakerTimer'

const TOOLS: InkTool[] = ['pointer', 'pen', 'highlighter', 'rect', 'laser', 'eraser']
const PRESETS = [1, 3, 5, 10, 15, 20]
const ICON_BTN = 'grid h-8 w-8 place-items-center rounded-full hover:bg-line'
const SMALL_BTN = 'rounded-full px-2.5 py-1 text-sm hover:bg-line'
const clampMinutes = (m: number): number => Math.min(180, Math.max(1, Math.round(Number.isFinite(m) ? m : 1)))

function Icon({ name }: { name: InkIconName }) {
  return <span className="grid place-items-center" dangerouslySetInnerHTML={{ __html: inkSvg(name, 18) }} />
}

function Group({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-1 border-l border-line pl-2">{children}</span>
}

/** The class timer's settings, opened from the ⏱ button (the students see this timer). */
function TimerDetails({ state }: { state: AppState }) {
  const t = useT()
  const timer = state.timer
  const [custom, setCustom] = useState(state.plannedMinutes ?? 5)
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-line pt-1.5">
      <span className="text-sm text-muted">{t.timer}</span>
      <span className={`mx-1 text-xl font-semibold tracking-tight tabular-nums ${timer.alarming ? 'text-alarm' : timer.status === 'running' ? 'text-ink' : 'text-muted'}`}>{mmss(timer.remainingSec)}</span>
      <button type="button" onClick={() => window.presenter.timerToggle()} className={`${SMALL_BTN} bg-accent/15 text-tint`}>
        {timer.alarming ? t.stopAlarm : timer.status === 'running' ? t.pause : timer.status === 'paused' ? t.resume : t.start}
      </button>
      <button type="button" onClick={() => window.presenter.timerReset()} className={SMALL_BTN}>
        {t.reset}
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      {PRESETS.map((m) => (
        <button key={m} type="button" onClick={() => window.presenter.timerStart(m * 60)} className={SMALL_BTN}>
          {t.presetMinutes(m)}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-line" />
      <button type="button" className={SMALL_BTN} onClick={() => setCustom((c) => clampMinutes(c - 1))}>
        −
      </button>
      <input
        type="number"
        min={1}
        max={180}
        value={custom}
        onChange={(e) => setCustom(clampMinutes(Number(e.target.value)))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') window.presenter.timerStart(custom * 60)
        }}
        className="w-14 rounded-full bg-panel-2 px-1 py-1 text-center text-sm tabular-nums"
      />
      <button type="button" className={SMALL_BTN} onClick={() => setCustom((c) => clampMinutes(c + 1))}>
        +
      </button>
      <button type="button" className={`${SMALL_BTN} bg-accent/15 text-tint`} onClick={() => window.presenter.timerStart(custom * 60)}>
        {t.startCustom}
      </button>
    </div>
  )
}

/**
 * The floating tools over a program window shown on a projector: marks, the class timer (a
 * small ⏱ button that opens its settings), the name roll, and My timer's time while it runs.
 * It floats above the window, can fold to a small handle, is left out of screen capture, and
 * the audience never sees it.
 */
function Toolbar() {
  const t = useT()
  const state = useAppState()
  const [open, setOpen] = useState(true)
  const [timerOpen, setTimerOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const running = !!state && state.speaker.startedAt !== null
  const now = useNow(running)
  const face = useRollFace(state?.roller ?? { lists: [], activeListId: null, activeText: '', people: [], superLucky: false, roll: null, showing: false })

  // The window is exactly as big as the bar; it tells the main process whenever that changes.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    // max-content width: the bar never wraps to fit the window; the window follows the bar.
    const report = (): void => {
      const r = el.getBoundingClientRect()
      window.presenter.toolbarSize(Math.ceil(r.width), Math.ceil(r.height))
    }
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
  const timer = state?.timer
  const timerOn = !!timer && (timer.status !== 'idle' || timer.alarming)
  // The roll shows on the audience screens; with none, only this bar and the console show it.
  const audience = !!state && (state.projecting || state.projectors.length > 0)

  return (
    <div ref={root} className="inline-flex w-max flex-col gap-1.5 rounded-[22px] border border-line bg-panel/95 px-2 py-1.5 whitespace-nowrap text-ink">
      <div className="flex items-center gap-2">
        <span className="cursor-move px-1 text-lg leading-none text-muted [-webkit-app-region:drag]" title={t.toolbarDrag}>
          ⠿
        </span>
        {!open || !state || !speaker || !timer ? (
          <button type="button" onClick={() => setOpen(true)} title={target ? t.toolbarFor(screenLabel(t, target)) : undefined} className={`${SMALL_BTN} font-semibold`}>
            ✎ {t.toolbarTitle} ▸
          </button>
        ) : (
          <>
            <span className="flex items-center gap-0.5" title={target ? t.toolbarFor(screenLabel(t, target)) : undefined}>
              {TOOLS.map((name) => (
                <button key={name} type="button" onClick={() => window.presenter.setInkTool(name)} className={`${ICON_BTN} ${tool === name ? 'bg-accent text-white' : ''}`}>
                  <Icon name={name} />
                </button>
              ))}
              {INK_COLORS.map((color) => (
                <button key={color} type="button" title={t.inkColor} onClick={() => window.presenter.setInkColor(color)} style={{ background: color }} className={`mx-0.5 h-5 w-5 rounded-full ring-1 ring-black/15 ring-inset ${state.ink.color === color ? 'outline-2 outline-offset-1 outline-accent' : ''}`} />
              ))}
              <button type="button" title={t.inkUndo} onClick={() => window.presenter.inkOp({ t: 'undo' }, false)} className={ICON_BTN}>
                <Icon name="undo" />
              </button>
              <button type="button" title={t.inkClear} onClick={() => window.presenter.inkOp({ t: 'clear' }, false)} className={ICON_BTN}>
                <Icon name="clear" />
              </button>
            </span>
            <Group>
              <button
                type="button"
                title={t.timer}
                onClick={() => setTimerOpen((o) => !o)}
                className={`${SMALL_BTN} tabular-nums ${timer.alarming ? 'bg-alarm text-white' : timerOpen ? 'bg-line' : ''} ${timer.status === 'running' ? 'text-ink' : timerOn ? 'text-gold' : ''}`}
              >
                ⏱ {timerOn ? mmss(timer.remainingSec) : t.timerShort}
              </button>
            </Group>
            {mineSet && (
              <Group>
                <span className="text-sm text-muted">{t.mineShort}</span>
                <span title={t.myTimerTitle} className={`text-lg font-semibold tracking-tight tabular-nums ${speaker.mode === 'down' && mine < 0 ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>
                  {clock(mine)}
                </span>
              </Group>
            )}
            <Group>
              {state.roller.showing ? (
                <button type="button" onClick={() => window.presenter.rollerHide()} className={SMALL_BTN}>
                  {t.hidePickShort}
                </button>
              ) : (
                <button type="button" title={t.rollerButtonTitle} disabled={state.roller.people.length === 0} onClick={() => window.presenter.rollerRoll()} className={`${SMALL_BTN} disabled:opacity-40`}>
                  🎲 {t.pickShort}
                </button>
              )}
              {face.person && (
                <span className={`max-w-48 truncate rounded-full px-2 text-sm font-semibold ${face.landed ? 'bg-link/15 text-link' : 'text-tint'}`} title={audience ? undefined : t.noAudience}>
                  {face.person.name}
                  {!audience && ' *'}
                </span>
              )}
              <button type="button" title={t.toolbarHide} onClick={() => setOpen(false)} className={SMALL_BTN}>
                ◂
              </button>
            </Group>
          </>
        )}
      </div>
      {open && state && timerOpen && <TimerDetails state={state} />}
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Toolbar />)
