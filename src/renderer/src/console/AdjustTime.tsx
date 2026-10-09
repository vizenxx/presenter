import { useState } from 'react'
import { speakerStarted } from '../../../shared/timer'
import type { AppState } from '../../../shared/types'
import { useT } from './i18n'
import { NumberField } from './ui'

type Target = 'class' | 'mine'
const SEGMENT = 'rounded-full px-2.5 py-0.5 text-sm'
const CHANGE = 'rounded-full bg-panel-2 px-3 py-1 text-sm font-semibold tabular-nums hover:bg-line disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Change the time of a timer that runs: choose the class timer or My timer, set an amount
 * (minutes : seconds), then − takes it away and + adds it. The class timer keeps at least one
 * second; after it rang, + makes it run again for that time. A timer that has not started is not changed.
 */
export function AdjustTime({ state }: { state: AppState }) {
  const t = useT()
  const [target, setTarget] = useState<Target>('class')
  const [minutes, setMinutes] = useState(1)
  const [seconds, setSeconds] = useState(0)
  const amount = minutes * 60 + seconds
  const label = `${minutes}:${String(seconds).padStart(2, '0')}`
  const classStatus = state.timer.status
  const on = target === 'class' ? classStatus !== 'idle' : speakerStarted(state.speaker)
  const canMore = on && amount > 0
  const canLess = canMore && !(target === 'class' && classStatus === 'done')
  const change = (sign: 1 | -1): void => {
    if (target === 'class') window.presenter.timerAdjust(sign * amount)
    else window.presenter.speakerAdjust(sign * amount)
  }
  const segment = (value: Target, name: string) => (
    <button type="button" aria-pressed={target === value} onClick={() => setTarget(value)} className={`${SEGMENT} ${target === value ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
      {name}
    </button>
  )
  return (
    <section className="rounded-card bg-panel px-4 py-2 ring-1 ring-line/60" title={t.adjustHint}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-semibold text-muted">{t.adjustTitle}</h2>
        <span className="flex rounded-full bg-panel-2 p-0.5">
          {segment('class', t.adjustClass)}
          {segment('mine', t.adjustMine)}
        </span>
        <span className="flex items-center gap-1">
          <NumberField value={minutes} min={0} max={180} onChange={setMinutes} title={t.adjustMinutes} className="w-11" />
          <span className="text-sm text-muted">:</span>
          <NumberField value={seconds} min={0} max={59} digits={2} onChange={setSeconds} title={t.adjustSeconds} className="w-11" />
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" disabled={!canLess} title={on ? t.adjustLess(label) : t.adjustNotStarted} onClick={() => change(-1)} className={CHANGE}>
            − {label}
          </button>
          <button type="button" disabled={!canMore} title={on ? t.adjustMore(label) : t.adjustNotStarted} onClick={() => change(1)} className={CHANGE}>
            + {label}
          </button>
        </span>
      </div>
    </section>
  )
}
