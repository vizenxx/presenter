import { useEffect, useState } from 'react'
import { clock } from '../../../shared/format'
import { clockPhase, hhmm, speakerSeconds, speakerStarted } from '../../../shared/timer'
import type { AppState, SpeakerMode, SpeakerTimerView } from '../../../shared/types'
import { useT, type Strings } from './i18n'
import { AdjustButton } from './TimerPanel'
import { Btn, Menu, NumberField, type ConsoleMenu } from './ui'

export { speakerSeconds }

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

const MODES: Array<{ mode: SpeakerMode; label: (t: Strings) => string }> = [
  { mode: 'up', label: (t) => t.countUp },
  { mode: 'down', label: (t) => t.countDown },
  { mode: 'clock', label: (t) => t.fromTo }
]

/** Clock times in their pop-up: From hh : mm, To hh : mm (a box sends when you leave it). */
function ClockTimes({ speaker }: { speaker: SpeakerTimerView }) {
  const t = useT()
  const send = (fromSec: number, untilSec: number): void => window.presenter.speakerTimes(fromSec, untilSec)
  const row = (label: string, sec: number, set: (sec: number) => void, which: 'From' | 'To') => (
    <div className="flex items-center gap-1">
      <span className="w-12">{label}</span>
      <NumberField value={Math.floor(sec / 3600)} min={0} max={23} digits={2} live={false} onChange={(h) => set(h * 3600 + (sec % 3600))} title={`${which}: hour`} className="w-11 text-ink" />
      <span>:</span>
      <NumberField value={Math.floor((sec % 3600) / 60)} min={0} max={59} digits={2} live={false} onChange={(m) => set(Math.floor(sec / 3600) * 3600 + m * 60)} title={`${which}: minute`} className="w-11 text-ink" />
    </div>
  )
  return (
    <div className="flex flex-col gap-2 p-2 text-sm text-muted">
      <h3 className="font-semibold text-ink">🕘 {t.timesTitle}</h3>
      <p>{t.timesHint}</p>
      {row(t.timesFrom, speaker.fromSec, (s) => send(s, speaker.untilSec), 'From')}
      {row(t.timesTo, speaker.untilSec, (s) => send(speaker.fromSec, s), 'To')}
    </div>
  )
}

/**
 * The speaker's own timer, for pacing the talk. The audience never sees it and it makes no
 * sound; the class timer is separate. The console and the floating toolbar show the same one.
 * From–to: it waits until the start clock time, counts down to the end clock time by itself,
 * then shows Over time; the times are set in the 🕘 pop-up.
 */
export function SpeakerTimer({ state, menu, onMenu }: { state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const t = useT()
  const speaker = state.speaker
  const clockMode = speaker.mode === 'clock'
  const running = speaker.startedAt !== null
  const started = speakerStarted(speaker)
  const now = useNow(running || clockMode)
  const phase = clockMode ? clockPhase(speaker, now) : null
  const shownSec = speakerSeconds(speaker, now)
  const over = (speaker.mode === 'down' && shownSec < 0) || phase === 'after'
  const live = running || phase === 'during'
  const SMALL = 'rounded-full px-2.5 py-0.5 text-sm'
  return (
    <section className={`rounded-card px-4 py-2.5 ${over ? 'bg-alarm/10 ring-2 ring-alarm/60' : 'bg-panel ring-1 ring-line/60'}`} title={t.myTimerTitle}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-semibold text-muted">{t.myTimer}</h2>
        <span className="flex rounded-full bg-panel-2 p-0.5">
          {MODES.map(({ mode, label }) => (
            <button key={mode} type="button" onClick={() => window.presenter.speakerMode(mode)} className={`${SMALL} ${speaker.mode === mode ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
              {label(t)}
            </button>
          ))}
        </span>
        {speaker.mode === 'down' && !started && (
          <span className="flex items-center gap-1">
            <NumberField value={speaker.minutes} min={1} max={240} onChange={(m) => window.presenter.speakerMinutes(m)} onEnter={() => window.presenter.speakerToggle()} title={t.minutesBox} className="w-14" />
            <span className="text-sm text-muted">{t.minutes}</span>
          </span>
        )}
        {clockMode && (
          <span className="relative">
            <button type="button" title={t.timesButtonTitle} onClick={() => onMenu(menu === 'times' ? null : 'times')} className={`rounded-full px-2.5 py-0.5 text-sm tabular-nums hover:bg-line ${menu === 'times' ? 'bg-line text-ink' : 'bg-panel-2 text-ink'}`}>
              🕘 {hhmm(speaker.fromSec)}–{hhmm(speaker.untilSec)}
            </button>
            {menu === 'times' && (
              <Menu up align="right" width="w-72" onClose={() => onMenu(null)}>
                <ClockTimes speaker={speaker} />
              </Menu>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {phase === 'before' && <span className="text-sm text-muted">{t.startsAt(hhmm(speaker.fromSec))}</span>}
          {over && <span className="text-sm font-semibold text-alarm">{t.overTime}</span>}
          <span className={`text-[26px] leading-none font-semibold tracking-tight tabular-nums ${over ? 'text-alarm' : live ? 'text-ink' : 'text-muted'}`}>{clock(shownSec)}</span>
          {!clockMode && (
            <>
              <Btn tone="primary" onClick={() => window.presenter.speakerToggle()}>
                {running ? t.pause : started ? t.resume : t.start}
              </Btn>
              <Btn disabled={!started} onClick={() => window.presenter.speakerReset()}>
                {t.reset}
              </Btn>
            </>
          )}
          <AdjustButton state={state} target="mine" menu={menu} onMenu={onMenu} />
        </span>
      </div>
    </section>
  )
}
