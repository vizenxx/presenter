import { useEffect, useState } from 'react'
import { mmss } from '../../../shared/format'
import type { AppState } from '../../../shared/types'
import { useT } from './i18n'
import { Btn } from './ui'

const PRESETS = [1, 3, 5, 10, 15, 20]
const clampMinutes = (m: number): number => Math.min(180, Math.max(1, Math.round(Number.isFinite(m) ? m : 1)))
const SMALL = 'rounded-md bg-panel-2 px-2 py-1 text-sm hover:bg-line'

/** The class timer (students see it on the projector), kept to two short rows. */
export function TimerPanel({ state }: { state: AppState }) {
  const t = useT()
  const timer = state.timer
  const [custom, setCustom] = useState(5)
  useEffect(() => {
    if (state.plannedMinutes) setCustom(state.plannedMinutes)
  }, [state.plannedMinutes])
  const label = timer.alarming ? t.stopAlarm : timer.status === 'running' ? t.pause : timer.status === 'paused' ? t.resume : t.start
  const color = timer.alarming ? 'text-alarm' : timer.status === 'running' ? 'text-ink' : timer.status === 'paused' ? 'text-accent' : 'text-muted'
  return (
    <section className={`rounded-2xl border-2 px-3 py-2 ${timer.alarming ? 'animate-pulse border-alarm bg-alarm/15' : 'border-line bg-panel'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-muted">{t.timer}</h2>
          {state.plannedMinutes ? <p className="truncate text-sm text-muted">{t.planned(state.plannedMinutes)}</p> : null}
        </div>
        <span className={`ml-auto font-mono text-3xl font-bold tabular-nums ${color}`}>{mmss(timer.remainingSec)}</span>
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
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={SMALL} onClick={() => setCustom((c) => clampMinutes(c - 1))}>
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
            className="w-12 rounded-md border border-line bg-panel-2 px-1 py-0.5 text-center font-mono text-sm"
          />
          <button type="button" className={SMALL} onClick={() => setCustom((c) => clampMinutes(c + 1))}>
            +
          </button>
          <button type="button" className={`${SMALL} bg-accent/20 text-accent`} onClick={() => window.presenter.timerStart(custom * 60)}>
            {t.startCustom}
          </button>
        </span>
      </div>
    </section>
  )
}
