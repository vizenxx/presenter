import { useState } from 'react'
import { clockNow, speakerStarted } from '../../../shared/timer'
import type { AppState } from '../../../shared/types'
import { useT } from './i18n'
import { NumberField } from './ui'

type Target = 'class' | 'mine'
const SEGMENT = 'rounded-full px-2.5 py-0.5 text-sm'
const CHANGE = 'rounded-full bg-panel-2 px-3 py-1 text-sm font-semibold tabular-nums hover:bg-line disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Change the time (in the pop-up of a timer's ± button): the timer (that card's timer at first),
 * an amount (minutes : seconds), then − takes it away and + adds it. The class timer keeps at
 * least one second; after it rang, + makes it run again for that time. A timer that has not
 * started is not changed.
 */
export function AdjustTime({ state, initial }: { state: AppState; initial: Target }) {
  const t = useT()
  const [target, setTarget] = useState<Target>(initial)
  const [minutes, setMinutes] = useState(1)
  const [seconds, setSeconds] = useState(0)
  const amount = minutes * 60 + seconds
  const label = `${minutes}:${String(seconds).padStart(2, '0')}`
  const classStatus = state.timer.status
  // My timer From–to with no class period today has nothing to change.
  const mineOn = speakerStarted(state.speaker) && !(state.speaker.mode === 'clock' && clockNow(state.speaker, Date.now()).phase === 'none')
  const on = target === 'class' ? classStatus !== 'idle' : mineOn
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
    <div className="flex flex-col gap-2 p-2 text-sm text-muted">
      <h3 className="font-semibold text-ink">± {t.adjustTitle}</h3>
      <div className="flex items-center gap-2">
        <span className="w-16">{t.adjustWhich}</span>
        <span className="flex rounded-full bg-panel-2 p-0.5">
          {segment('class', t.adjustClass)}
          {segment('mine', t.adjustMine)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-16 shrink-0">{t.adjustAmount}</span>
        <NumberField value={minutes} min={0} max={180} onChange={setMinutes} title={t.adjustMinutes} className="w-11 text-ink" />
        <span>:</span>
        <NumberField value={seconds} min={0} max={59} digits={2} onChange={setSeconds} title={t.adjustSeconds} className="w-11 text-ink" />
        <span className="ml-auto flex items-center gap-1">
          <button type="button" disabled={!canLess} title={t.adjustLess(label)} onClick={() => change(-1)} className={CHANGE}>
            − {label}
          </button>
          <button type="button" disabled={!canMore} title={t.adjustMore(label)} onClick={() => change(1)} className={CHANGE}>
            + {label}
          </button>
        </span>
      </div>
      <p>{on ? t.adjustHint : t.adjustNotStarted}</p>
    </div>
  )
}
