import { useEffect, useState } from 'react'
import { clock } from '../../../shared/format'
import type { SpeakerTimerView } from '../../../shared/types'
import { useT } from './i18n'
import { Btn } from './ui'

/** Seconds to show: time so far (count up) or time left, below zero when over (count down). */
export function speakerSeconds(s: SpeakerTimerView, now: number): number {
  const elapsed = (s.heldMs + (s.startedAt !== null ? now - s.startedAt : 0)) / 1000
  return s.mode === 'up' ? elapsed : s.minutes * 60 - elapsed
}

/** The current time, refreshed four times a second while something runs. */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])
  return running ? now : Date.now()
}

/**
 * The speaker's own timer, for pacing the talk. The audience never sees it and it makes no
 * sound; the class timer is separate. The console and the floating toolbar show the same one.
 */
export function SpeakerTimer({ speaker }: { speaker: SpeakerTimerView }) {
  const t = useT()
  const running = speaker.startedAt !== null
  const started = running || speaker.heldMs > 0
  const shownSec = speakerSeconds(speaker, useNow(running))
  const over = speaker.mode === 'down' && shownSec < 0
  const SMALL = 'rounded-md px-2 py-1 text-sm'
  return (
    <section className={`rounded-2xl border-2 px-3 py-2 ${over ? 'border-alarm/60 bg-alarm/10' : 'border-line bg-panel'}`} title={t.myTimerTitle}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-semibold text-muted">{t.myTimer}</h2>
        <span className="flex overflow-hidden rounded-md border border-line">
          <button type="button" onClick={() => window.presenter.speakerMode('up')} className={`${SMALL} ${speaker.mode === 'up' ? 'bg-accent text-black' : 'text-muted hover:bg-line'}`}>
            {t.countUp}
          </button>
          <button type="button" onClick={() => window.presenter.speakerMode('down')} className={`${SMALL} ${speaker.mode === 'down' ? 'bg-accent text-black' : 'text-muted hover:bg-line'}`}>
            {t.countDown}
          </button>
        </span>
        {speaker.mode === 'down' && !started && (
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={240}
              value={speaker.minutes}
              onChange={(e) => window.presenter.speakerMinutes(Number(e.target.value))}
              className="w-12 rounded-md border border-line bg-panel-2 px-1 py-0.5 text-center font-mono text-sm"
            />
            <span className="text-sm text-muted">{t.minutes}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {over && <span className="text-sm font-semibold text-alarm">{t.overTime}</span>}
          <span className={`font-mono text-2xl font-bold tabular-nums ${over ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>{clock(shownSec)}</span>
          <Btn tone="primary" onClick={() => window.presenter.speakerToggle()}>
            {running ? t.pause : started ? t.resume : t.start}
          </Btn>
          <Btn disabled={!started} onClick={() => window.presenter.speakerReset()}>
            {t.reset}
          </Btn>
        </span>
      </div>
    </section>
  )
}
