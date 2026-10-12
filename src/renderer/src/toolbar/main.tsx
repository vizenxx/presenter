import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { clock, mmss } from '../../../shared/format'
import { inkKeyAction } from '../../../shared/ink'
import { clockNow, speakerSeconds, speakerStarted } from '../../../shared/timer'
import type { AppState } from '../../../shared/types'
import { useAppState } from '../console/hooks'
import { InkButtons } from '../console/Ink'
import { IS_MAC } from '../console/platform'
import { screenLabel, useT } from '../console/i18n'
import { useRollFace } from '../console/RollerPanel'
import { SpeakerTimer, useNow } from '../console/SpeakerTimer'
import { TimerPanel } from '../console/TimerPanel'
import { FlipContext, IconLabel, Menu, MenuHostContext, MenuItem, type ConsoleMenu } from '../console/ui'

const SMALL_BTN = 'rounded-full px-2.5 py-1 text-sm hover:bg-line'

function Group({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-1 border-l border-line pl-2">{children}</span>
}

/**
 * The two timers, opened from the ⏱ button: the same two cards as in the console (the time is its
 * own entry, ±, warning bells, the presets, My timer's modes), so there is one way to use them.
 * Their pop-ups open below, inside this window, which grows with them.
 */
function TimerCards({ state, flipped, menu, onMenu }: { state: AppState; flipped: boolean; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const shared = <TimerPanel state={state} menu={menu} onMenu={onMenu} />
  const mine = <SpeakerTimer state={state} menu={menu} onMenu={onMenu} />
  return (
    <div className="grid min-w-[34rem] grid-cols-2 gap-2 border-t border-line pt-1.5">
      {flipped ? mine : shared}
      {flipped ? shared : mine}
    </div>
  )
}

/**
 * The floating tools over a program window shown on a projector: marks, the shared timer (a
 * small ⏱ button that opens its settings), the name roll, and My timer's time while it runs.
 * It floats above the window, can fold to a small handle, is left out of screen capture, and
 * the audience never sees it.
 */
function Toolbar() {
  const t = useT()
  const state = useAppState()
  const [open, setOpen] = useState(true)
  const [timerOpen, setTimerOpen] = useState(false)
  const [menu, setMenu] = useState<ConsoleMenu>(null)
  // Where the cards' pop-ups open: below them, inside this window (it is only as big as its content).
  const [host, setHost] = useState<HTMLElement | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const clockMode = !!state && state.speaker.mode === 'clock'
  const running = !!state && (state.speaker.startedAt !== null || (clockMode && clockNow(state.speaker, Date.now()).phase === 'during'))
  const now = useNow(running || clockMode)
  const face = useRollFace(state?.roller ?? { lists: [], activeListId: null, activeText: '', people: [], superLucky: false, roll: null, showing: false, groups: null })

  // Keys while the toolbar has the keyboard (it takes it while you draw on a window): Esc returns
  // to the pointer, Ctrl+Z (⌘Z) undoes, Delete clears, P H R A L E pick a tool. Any key stops a ringing alarm.
  const tool = state?.ink.tool ?? 'pointer'
  const alarming = state?.timer.alarming ?? false
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      if (alarming) {
        e.preventDefault()
        window.presenter.timerDismiss()
        return
      }
      const action = inkKeyAction(e.key, { control: e.ctrlKey, alt: e.altKey, meta: e.metaKey }, IS_MAC, tool)
      // Text is typed on slides only, not on a program window.
      if (!action || (action.type === 'tool' && action.tool === 'text')) return
      e.preventDefault()
      if (action.type === 'undo') window.presenter.inkOp({ t: 'undo' }, false)
      else if (action.type === 'clear') window.presenter.inkOp({ t: 'clear' }, false)
      else window.presenter.setInkTool(action.type === 'pointer' ? 'pointer' : action.tool)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, alarming])

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
  // My timer shows only once it has started (running or paused; by clock times: from the start time on).
  const mineSet = !!speaker && (speaker.mode === 'clock' ? ['during', 'after'].includes(clockNow(speaker, now).phase) : speakerStarted(speaker))
  const timer = state?.timer
  const timerOn = !!timer && (timer.status !== 'idle' || timer.alarming)
  // The roll shows on the audience screens; with none, only this bar and the console show it.
  const audience = !!state && (state.projecting || state.projectors.length > 0)

  return (
    <FlipContext.Provider value={!!state?.flipped}>
    <MenuHostContext.Provider value={host}>
    <div ref={root} className="inline-flex w-max flex-col gap-1.5 rounded-[22px] border border-line bg-panel/95 px-2 py-1.5 whitespace-nowrap text-ink">
      <div className={`flex items-center gap-2 ${state?.flipped ? 'flex-row-reverse' : ''}`}>
        <span className="cursor-move px-1 text-lg leading-none text-muted [-webkit-app-region:drag]" title={t.toolbarDrag}>
          ⠿
        </span>
        {!open || !state || !speaker || !timer ? (
          <button type="button" onClick={() => setOpen(true)} title={target ? t.toolbarFor(screenLabel(t, target)) : undefined} className={`${SMALL_BTN} font-semibold`}>
            <IconLabel icon="pen" size={15}>
              {t.toolbarTitle} ▸
            </IconLabel>
          </button>
        ) : (
          <>
            <span className="flex items-center gap-0.5" title={target ? t.toolbarFor(screenLabel(t, target)) : undefined}>
              <InkButtons ink={state.ink} textTool={false} />
            </span>
            <Group>
              <button
                type="button"
                title={t.timer}
                onClick={() => { setMenu(null); setTimerOpen((o) => !o) }}
                className={`${SMALL_BTN} tabular-nums ${timer.alarming ? 'bg-alarm text-white' : timerOpen ? 'bg-line' : ''} ${timer.status === 'running' ? 'text-ink' : timerOn ? 'text-gold' : ''}`}
              >
                <IconLabel icon="timer" size={15}>
                  {timerOn ? mmss(timer.remainingSec) : t.timerShort}
                </IconLabel>
              </button>
            </Group>
            {mineSet && (
              <Group>
                <span className="text-sm text-muted">{t.mineShort}</span>
                <span title={t.myTimerTitle} className={`text-lg font-semibold tracking-tight tabular-nums ${speaker.mode !== 'up' && mine < 0 ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>
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
                  <IconLabel icon="dice" size={15}>
                    {t.pickShort}
                  </IconLabel>
                </button>
              )}
              {face.person && (
                <span className={`max-w-48 truncate rounded-full px-2 text-sm font-semibold ${face.landed ? 'bg-link/15 text-link' : 'text-tint'}`} title={audience ? undefined : t.noAudience}>
                  {face.person.name}
                  {!audience && ' *'}
                </span>
              )}
              <span className="relative">
                <button type="button" title={t.toolbarScreensTitle} onClick={() => setMenu(menu === 'screens' ? null : 'screens')} className={`${SMALL_BTN} ${menu === 'screens' ? 'bg-line' : ''}`}>
                  <IconLabel icon="window" size={15}>
                    {t.toolbarScreens} ▾
                  </IconLabel>
                </button>
                {menu === 'screens' && (
                  <Menu onClose={() => setMenu(null)}>
                    {state.outputs
                      .filter((o) => o.kind !== 'preview' && (o.deck !== null || o.kind === 'capture'))
                      .map((o) => (
                        <MenuItem
                          key={o.id}
                          onClick={() => {
                            setMenu(null)
                            window.presenter.showOn(o.id, 1)
                          }}
                        >
                          {o.id === state.onAirId ? '✓ ' : ''}
                          {screenLabel(t, o)}
                          {o.deck ? <span className="text-muted group-hover:text-white/75"> · {o.deck.name}</span> : null}
                        </MenuItem>
                      ))}
                  </Menu>
                )}
              </span>
              <button type="button" title={t.toolbarBackTitle} onClick={() => window.presenter.focusConsole()} className={SMALL_BTN}>
                <IconLabel icon="console" size={15}>
                  {t.toolbarBack}
                </IconLabel>
              </button>
              <button type="button" title={t.toolbarHide} onClick={() => setOpen(false)} className={SMALL_BTN}>
                ◂
              </button>
            </Group>
          </>
        )}
      </div>
      {open && state && timerOpen && <TimerCards state={state} flipped={state.flipped} menu={menu} onMenu={setMenu} />}
      <div ref={setHost} />
    </div>
    </MenuHostContext.Provider>
    </FlipContext.Provider>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Toolbar />)
