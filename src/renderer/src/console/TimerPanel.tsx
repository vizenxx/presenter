import { useEffect, useState } from 'react'
import { mmss } from '../../../shared/format'
import type { AppState } from '../../../shared/types'
import { useT } from './i18n'
import { Btn } from './ui'

const PRESETS = [1, 3, 5, 8, 10, 15, 20]
const clampMinutes = (m: number): number => Math.min(180, Math.max(1, Math.round(Number.isFinite(m) ? m : 1)))

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
    <section className={`rounded-2xl border-2 p-3 ${timer.alarming ? 'animate-pulse border-alarm bg-alarm/15' : 'border-line bg-panel'}`}>
      <div className="flex items-center">
        <h2 className="text-sm font-semibold text-muted">{t.timer}</h2>
        {state.plannedMinutes ? <span className="ml-auto text-sm text-muted">{t.planned(state.plannedMinutes)}</span> : null}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className={`font-mono text-5xl font-bold tabular-nums ${color}`}>{mmss(timer.remainingSec)}</span>
        <div className="ml-auto flex gap-2">
          <Btn tone="primary" onClick={() => window.presenter.timerToggle()}>
            {label}
          </Btn>
          <Btn onClick={() => window.presenter.timerReset()}>{t.reset}</Btn>
        </div>
      </div>
      {timer.alarming && <p className="mt-1 text-sm text-alarm">{t.alarmHint}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((m) => (
          <Btn key={m} onClick={() => window.presenter.timerStart(m * 60)}>
            {t.presetMinutes(m)}
          </Btn>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Btn onClick={() => setCustom((c) => clampMinutes(c - 1))}>−</Btn>
        <input
          type="number"
          min={1}
          max={180}
          value={custom}
          onChange={(e) => setCustom(clampMinutes(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') window.presenter.timerStart(custom * 60)
          }}
          className="w-16 rounded-lg border border-line bg-panel-2 px-2 py-1 text-center font-mono text-base"
        />
        <Btn onClick={() => setCustom((c) => clampMinutes(c + 1))}>+</Btn>
        <span className="text-sm text-muted">{t.minutes}</span>
        <Btn tone="primary" onClick={() => window.presenter.timerStart(custom * 60)}>
          {t.startCustom}
        </Btn>
      </div>
    </section>
  )
}
