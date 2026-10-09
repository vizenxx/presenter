import { useEffect, useRef, useState } from 'react'
import { mmss } from '../../../shared/format'
import { MAX_BEEPS, MAX_WARNINGS, type TimerWarning } from '../../../shared/timer'
import type { AppState, TimerView } from '../../../shared/types'
import { AdjustTime } from './AdjustTime'
import { useT } from './i18n'
import { Btn, HoldBtn, Menu, NumberField, type ConsoleMenu } from './ui'

export const PRESETS = [1, 3, 5, 10, 15, 20]
const MAX_MINUTES = 180
const SMALL = 'rounded-full bg-panel-2 px-2.5 py-1 text-sm hover:bg-line disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Sets the class timer's time (minutes : seconds) while it is stopped: the big time shows it and
 * the one Start button starts it (Enter in a box starts too). − and + change the minutes and
 * repeat while held. While the timer runs or is paused the boxes rest: ± gives more or less time.
 */
export function SetTime({ timer, buttonClass = SMALL }: { timer: TimerView; buttonClass?: string }) {
  const t = useT()
  const stopped = timer.status === 'idle' || timer.status === 'done'
  const total = timer.durationSec
  // The boxes keep what you type (0 : 30 passes through 0 : 00 on the way); the timer gets every time above zero.
  const [mm, setMm] = useState(Math.floor(total / 60))
  const [ss, setSs] = useState(total % 60)
  useEffect(() => {
    setMm(Math.floor(total / 60))
    setSs(total % 60)
  }, [total])
  const now = useRef({ mm, ss })
  now.current = { mm, ss }
  const apply = (m: number, s: number): void => {
    setMm(m)
    setSs(s)
    if (m * 60 + s > 0) window.presenter.timerSet(m * 60 + s)
  }
  const start = (m: number, s: number): void => {
    if (m * 60 + s > 0) window.presenter.timerStart(m * 60 + s)
  }
  const step = (delta: number): void => {
    const { mm: m, ss: s } = now.current
    const next = Math.min(MAX_MINUTES, Math.max(0, m + delta))
    if (next * 60 + s > 0) apply(next, s)
  }
  return (
    <span className="flex items-center gap-1" title={stopped ? t.setTimeTitle : t.setTimeBusy}>
      <span className="mr-0.5 text-sm text-muted">{t.setTime}</span>
      <HoldBtn disabled={!stopped} title={t.holdToRepeat} onStep={() => step(-1)} className={buttonClass}>
        −
      </HoldBtn>
      <NumberField disabled={!stopped} value={mm} min={0} max={MAX_MINUTES} onChange={(m) => apply(m, now.current.ss)} onEnter={(m) => start(m, now.current.ss)} title={t.minutesBox} className="w-11" />
      <span className="text-sm text-muted">:</span>
      <NumberField disabled={!stopped} value={ss} min={0} max={59} digits={2} onChange={(s) => apply(now.current.mm, s)} onEnter={(s) => start(now.current.mm, s)} title={t.secondsBox} className="w-11" />
      <HoldBtn disabled={!stopped} title={t.holdToRepeat} onStep={() => step(1)} className={buttonClass}>
        +
      </HoldBtn>
    </span>
  )
}

/**
 * The class timer's warning bells, in their pop-up: a title line ("Warning bells · Class timer",
 * "＋ Add a bell"), then one row per bell in the order they ring (most time left first): time
 * left (minutes : seconds), number of beeps, ✕. The list is sorted again when you leave a box,
 * never while you type. Up to 5 bells; Presenter remembers them.
 */
export function WarningBells({ warnings }: { warnings: TimerWarning[] }) {
  const t = useT()
  const send = (list: TimerWarning[]): void => window.presenter.timerWarnings(list)
  const change = (i: number, next: Partial<TimerWarning>): void => send(warnings.map((w, j) => (j === i ? { ...w, ...next } : w)))
  const add = (): void => send([...warnings, warnings.length === 0 ? { sec: 60, beeps: 3 } : { sec: 30, beeps: 1 }])
  return (
    <div className="p-2 text-sm text-muted">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-ink">🔔 {t.bellsTitle}</h3>
        {warnings.length < MAX_WARNINGS && (
          <button type="button" onClick={add} className="ml-auto rounded-full px-2 py-0.5 text-tint hover:bg-panel-2">
            ＋ {t.warnAdd}
          </button>
        )}
      </div>
      <p className="mt-1">{t.warnTitle}</p>
      {warnings.length === 0 && <p className="mt-2 text-ink">{t.warnNone}</p>}
      <div className="mt-2 flex flex-col gap-1.5">
        {warnings.map((w, i) => (
          <div key={i} className="flex items-center gap-1 rounded-xl py-1 pr-1 pl-2 ring-1 ring-line/70">
            <NumberField value={Math.floor(w.sec / 60)} min={0} max={60} live={false} onChange={(m) => change(i, { sec: m * 60 + (w.sec % 60) })} title={t.warnMinutes} className="w-10 text-ink" />
            <span>:</span>
            <NumberField value={w.sec % 60} min={0} max={59} digits={2} live={false} onChange={(sec) => change(i, { sec: Math.floor(w.sec / 60) * 60 + sec })} title={t.warnSeconds} className="w-10 text-ink" />
            <span className="mr-1">{t.warnLeft}</span>
            <NumberField value={w.beeps} min={1} max={MAX_BEEPS} live={false} onChange={(beeps) => change(i, { beeps })} title={t.warnBeepsTitle} className="w-8 text-ink" />
            <span>{t.warnBeeps(w.beeps)}</span>
            <button type="button" title={t.warnRemove} aria-label={t.warnRemove} onClick={() => send(warnings.filter((_, j) => j !== i))} className="ml-auto grid h-6 w-6 place-items-center rounded-full hover:bg-line">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The class timer (students see it on the projector), in two rows. Row 1: name, 🔔 (its warning
 * bells, in a pop-up), the time, the one Start / Pause button, Reset, ± (change the time, in a
 * pop-up). Row 2: presets (start at once) and Set (the time Start will use).
 */
export function TimerPanel({ state, menu, onMenu }: { state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const t = useT()
  const timer = state.timer
  const close = (): void => onMenu(null)
  const label = timer.alarming ? t.stopAlarm : timer.status === 'running' ? t.pause : timer.status === 'paused' ? t.resume : t.start
  const color = timer.alarming ? 'text-alarm' : timer.status === 'running' ? 'text-ink' : timer.status === 'paused' ? 'text-gold' : 'text-muted'
  const bells = timer.warnings.length
  return (
    <section className={`rounded-card px-4 py-2.5 ${timer.alarming ? 'animate-pulse bg-alarm/15 ring-2 ring-alarm' : 'bg-panel ring-1 ring-line/60'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-muted">{t.timer}</h2>
          {state.plannedMinutes ? <p className="truncate text-sm text-muted">{t.planned(state.plannedMinutes)}</p> : null}
        </div>
        <span className="relative shrink-0">
          <button type="button" title={t.bellsButtonTitle} onClick={() => onMenu(menu === 'bells' ? null : 'bells')} className={`rounded-full px-2.5 py-0.5 text-sm tabular-nums hover:bg-line ${menu === 'bells' ? 'bg-line text-ink' : bells === 0 ? 'text-muted' : 'bg-panel-2 text-ink'}`}>
            {t.bellsButton(bells)}
          </button>
          {menu === 'bells' && (
            <Menu up width="w-[23rem]" onClose={close}>
              <WarningBells warnings={timer.warnings} />
            </Menu>
          )}
        </span>
        <span className={`ml-auto text-[32px] leading-none font-semibold tracking-tight tabular-nums ${color}`}>{mmss(timer.remainingSec)}</span>
        <Btn tone="primary" onClick={() => window.presenter.timerToggle()}>
          {label}
        </Btn>
        <Btn onClick={() => window.presenter.timerReset()}>{t.reset}</Btn>
        <AdjustButton state={state} target="class" menu={menu} onMenu={onMenu} />
      </div>
      {timer.alarming && <p className="mt-1 text-sm text-alarm">{t.alarmHint}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {PRESETS.map((m) => (
          <button key={m} type="button" title={t.presetTitle} className={SMALL} onClick={() => window.presenter.timerStart(m * 60)}>
            {t.presetMinutes(m)}
          </button>
        ))}
        <span className="ml-auto">
          <SetTime timer={timer} />
        </span>
      </div>
    </section>
  )
}

/** ± on a timer card: opens Change the time for that timer (the other timer can still be chosen there). */
export function AdjustButton({ state, target, menu, onMenu }: { state: AppState; target: 'class' | 'mine'; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const t = useT()
  const id: ConsoleMenu = target === 'class' ? 'adjust-class' : 'adjust-mine'
  return (
    <span className="relative shrink-0">
      <Btn title={t.adjustButtonTitle} onClick={() => onMenu(menu === id ? null : id)}>
        ±
      </Btn>
      {menu === id && (
        <Menu up align="right" width="w-[24rem]" onClose={() => onMenu(null)}>
          <AdjustTime state={state} initial={target} />
        </Menu>
      )}
    </span>
  )
}
