import { useEffect, useState } from 'react'
import { clock } from '../../../shared/format'
import { speakerStarted } from '../../../shared/timer'
import type { SpeakerTimerView } from '../../../shared/types'
import { useT } from './i18n'
import { Btn, NumberField } from './ui'

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
  const started = speakerStarted(speaker)
  const shownSec = speakerSeconds(speaker, useNow(running))
  const over = speaker.mode === 'down' && shownSec < 0
  const SMALL = 'rounded-full px-2.5 py-0.5 text-sm'
  return (
    <section className={`rounded-card px-4 py-2.5 ${over ? 'bg-alarm/10 ring-2 ring-alarm/60' : 'bg-panel ring-1 ring-line/60'}`} title={t.myTimerTitle}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-semibold text-muted">{t.myTimer}</h2>
        <span className="flex rounded-full bg-panel-2 p-0.5">
          <button type="button" onClick={() => window.presenter.speakerMode('up')} className={`${SMALL} ${speaker.mode === 'up' ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            {t.countUp}
          </button>
          <button type="button" onClick={() => window.presenter.speakerMode('down')} className={`${SMALL} ${speaker.mode === 'down' ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            {t.countDown}
          </button>
        </span>
        {speaker.mode === 'down' && !started && (
          <span className="flex items-center gap-1">
            <NumberField value={speaker.minutes} min={1} max={240} onChange={(m) => window.presenter.speakerMinutes(m)} onEnter={() => window.presenter.speakerToggle()} title={t.minutesBox} className="w-14" />
            <span className="text-sm text-muted">{t.minutes}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {over && <span className="text-sm font-semibold text-alarm">{t.overTime}</span>}
          <span className={`text-[26px] leading-none font-semibold tracking-tight tabular-nums ${over ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>{clock(shownSec)}</span>
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
