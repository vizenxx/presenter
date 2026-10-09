import { useEffect, useState } from 'react'
import { mmss } from '../../../shared/format'
import { MAX_BEEPS, MAX_WARNINGS, type TimerWarning } from '../../../shared/timer'
import type { AppState } from '../../../shared/types'
import { useT } from './i18n'
import { Btn, HoldBtn, NumberField } from './ui'

export const PRESETS = [1, 3, 5, 10, 15, 20]
const MAX_MINUTES = 180
const SMALL = 'rounded-full bg-panel-2 px-2.5 py-1 text-sm hover:bg-line'

/**
 * Minutes and seconds for the class timer, then Start (Enter in either box starts too).
 * − and + change the minutes and repeat while held. A slide's planned time fills it in.
 */
export function CustomTime({ planned, buttonClass = SMALL }: { planned: number | null; buttonClass?: string }) {
  const t = useT()
  const [minutes, setMinutes] = useState(planned ?? 5)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!planned) return
    setMinutes(planned)
    setSeconds(0)
  }, [planned])
  const start = (m = minutes, s = seconds): void => {
    if (m * 60 + s > 0) window.presenter.timerStart(m * 60 + s)
  }
  return (
    <span className="flex items-center gap-1">
      <HoldBtn title={t.holdToRepeat} onStep={() => setMinutes((m) => Math.max(0, m - 1))} className={buttonClass}>
        −
      </HoldBtn>
      <NumberField value={minutes} min={0} max={MAX_MINUTES} onChange={setMinutes} onEnter={(m) => start(m, seconds)} title={t.minutesBox} className="w-11" />
      <span className="text-sm text-muted">:</span>
      <NumberField value={seconds} min={0} max={59} digits={2} onChange={setSeconds} onEnter={(s) => start(minutes, s)} title={t.secondsBox} className="w-11" />
      <HoldBtn title={t.holdToRepeat} onStep={() => setMinutes((m) => Math.min(MAX_MINUTES, m + 1))} className={buttonClass}>
        +
      </HoldBtn>
      <button type="button" disabled={minutes * 60 + seconds === 0} className={`${buttonClass} bg-accent/15 text-tint disabled:opacity-40`} onClick={() => start()}>
        {t.startCustom}
      </button>
    </span>
  )
}

/**
 * The warning bells. A header line ("🔔 Warning bells", "＋ Add a bell" at the right), then one
 * card per bell in the order they ring (most time left first), all the same width, one or two
 * per line: time left (minutes : seconds), number of beeps, ✕. The list is sorted again when you
 * leave a box, never while you type. Up to 5 bells; Presenter remembers them.
 */
export function WarningBells({ warnings }: { warnings: TimerWarning[] }) {
  const t = useT()
  const send = (list: TimerWarning[]): void => window.presenter.timerWarnings(list)
  const change = (i: number, next: Partial<TimerWarning>): void => send(warnings.map((w, j) => (j === i ? { ...w, ...next } : w)))
  const add = (): void => send([...warnings, warnings.length === 0 ? { sec: 60, beeps: 3 } : { sec: 30, beeps: 1 }])
  return (
    <div className="mt-2 border-t border-line/60 pt-2 text-sm text-muted" title={t.warnTitle}>
      <div className="flex items-center gap-2">
        <span>🔔 {t.warnBells}</span>
        {warnings.length === 0 && <span>{t.warnNone}</span>}
        {warnings.length < MAX_WARNINGS && (
          <button type="button" onClick={add} className="ml-auto rounded-full px-2 py-0.5 text-tint hover:bg-panel-2">
            ＋ {t.warnAdd}
          </button>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-1.5">
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
      )}
    </div>
  )
}

/** The class timer (students see it on the projector), kept to two rows: the time, then presets and own time. */
export function TimerPanel({ state }: { state: AppState }) {
  const t = useT()
  const timer = state.timer
  const label = timer.alarming ? t.stopAlarm : timer.status === 'running' ? t.pause : timer.status === 'paused' ? t.resume : t.start
  const color = timer.alarming ? 'text-alarm' : timer.status === 'running' ? 'text-ink' : timer.status === 'paused' ? 'text-gold' : 'text-muted'
  return (
    <section className={`rounded-card px-4 py-2.5 ${timer.alarming ? 'animate-pulse bg-alarm/15 ring-2 ring-alarm' : 'bg-panel ring-1 ring-line/60'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-muted">{t.timer}</h2>
          {state.plannedMinutes ? <p className="truncate text-sm text-muted">{t.planned(state.plannedMinutes)}</p> : null}
        </div>
        <span className={`ml-auto text-[32px] leading-none font-semibold tracking-tight tabular-nums ${color}`}>{mmss(timer.remainingSec)}</span>
        <Btn tone="primary" onClick={() => window.presenter.timerToggle()}>
          {label}
        </Btn>
        <Btn onClick={() => window.presenter.timerReset()}>{t.reset}</Btn>
      </div>
      {timer.alarming && <p className="mt-1 text-sm text-alarm">{t.alarmHint}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {PRESETS.map((m) => (
          <button key={m} type="button" className={SMALL} onClick={() => window.presenter.timerStart(m * 60)}>
            {t.presetMinutes(m)}
          </button>
        ))}
        <span className="ml-auto">
          <CustomTime planned={state.plannedMinutes} />
        </span>
      </div>
    </section>
  )
}
