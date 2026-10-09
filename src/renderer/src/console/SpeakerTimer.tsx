import { useEffect, useState } from 'react'
import { clock } from '../../../shared/format'
import { clockNow, from12, MAX_PERIODS, range12, speakerSeconds, speakerStarted, time12, WEEK_ORDER } from '../../../shared/timer'
import type { AppState, ClockPeriod, SpeakerMode, SpeakerTimerView } from '../../../shared/types'
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
const CHIP = 'rounded-full px-2 py-0.5 text-sm'

/** A clock time on the 12-hour clock: hour (1–12) : minute, then AM or PM. A box sends when you leave it. */
function TimeField({ label, sec, onSec, name }: { label: string; sec: number; onSec: (sec: number) => void; name: string }) {
  const h24 = Math.floor(sec / 3600)
  const minute = Math.floor((sec % 3600) / 60)
  const pm = h24 >= 12
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return (
    <span className="flex items-center gap-1">
      <span className="w-9">{label}</span>
      <NumberField value={h12} min={1} max={12} live={false} onChange={(h) => onSec(from12(h, minute, pm))} title={`${name}: hour`} className="w-10 text-ink" />
      <span>:</span>
      <NumberField value={minute} min={0} max={59} digits={2} live={false} onChange={(m) => onSec(from12(h12, m, pm))} title={`${name}: minute`} className="w-10 text-ink" />
      <span className="flex rounded-full bg-panel-2 p-0.5">
        {(['AM', 'PM'] as const).map((half) => {
          const on = (half === 'PM') === pm
          return (
            <button key={half} type="button" aria-pressed={on} title={`${name}: ${half}`} onClick={() => onSec(from12(h12, minute, half === 'PM'))} className={`${CHIP} ${on ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
              {half}
            </button>
          )
        })}
      </span>
    </span>
  )
}

/**
 * The class periods of My timer From–to, in the 🕘 pop-up: one card per period with its weekdays
 * (Mon … Sun) and its start and end on the 12-hour clock. Up to 6 periods, in order of start time.
 */
function ClassPeriods({ periods }: { periods: ClockPeriod[] }) {
  const t = useT()
  const send = (list: ClockPeriod[]): void => window.presenter.speakerPeriods(list)
  const change = (i: number, next: Partial<ClockPeriod>): void => send(periods.map((p, j) => (j === i ? { ...p, ...next } : p)))
  const add = (): void => {
    const last = periods[periods.length - 1]
    const fromSec = last ? Math.min(22 * 3600, last.untilSec + 15 * 60) : 9 * 3600
    send([...periods, { days: last ? [...last.days] : [1, 2, 3, 4, 5], fromSec, untilSec: fromSec + 3600 }])
  }
  return (
    <div className="flex flex-col gap-2 p-2 text-sm text-muted">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-ink">🕘 {t.timesTitle}</h3>
        {periods.length < MAX_PERIODS && (
          <button type="button" onClick={add} className="ml-auto rounded-full px-2 py-0.5 text-tint hover:bg-panel-2">
            ＋ {t.addPeriod}
          </button>
        )}
      </div>
      <p>{t.timesHint}</p>
      {periods.length === 0 && <p className="text-ink">{t.noPeriods}</p>}
      {periods.map((p, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-xl p-2 ring-1 ring-line/70">
          <div className="flex items-center gap-1">
            {WEEK_ORDER.map((d) => {
              const on = p.days.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on} title={`${t.periodN(i + 1)}: ${t.dayShort[d]}`} onClick={() => change(i, { days: on ? p.days.filter((x) => x !== d) : [...p.days, d] })} className={`${CHIP} ${on ? 'bg-accent text-white' : 'bg-panel-2 text-muted hover:text-ink'}`}>
                  {t.dayShort[d]}
                </button>
              )
            })}
            <button type="button" title={t.removePeriod} aria-label={t.removePeriod} onClick={() => send(periods.filter((_, j) => j !== i))} className="ml-auto grid h-6 w-6 place-items-center rounded-full hover:bg-line">
              ✕
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <TimeField label={t.timesFrom} sec={p.fromSec} onSec={(fromSec) => change(i, { fromSec })} name={`${t.periodN(i + 1)} from`} />
            <TimeField label={t.timesTo} sec={p.untilSec} onSec={(untilSec) => change(i, { untilSec })} name={`${t.periodN(i + 1)} to`} />
          </div>
          {p.days.length === 0 && <p className="text-alarm">{t.noDays}</p>}
        </div>
      ))}
    </div>
  )
}

/**
 * The speaker's own timer, for pacing the talk. The audience never sees it and it makes no
 * sound; the class timer is separate. The console and the floating toolbar show the same one.
 * From–to: today's class periods: during one it counts down to its end by itself, then shows
 * Over time for 30 minutes; before the next one it says when that starts. Periods are set in 🕘.
 */
export function SpeakerTimer({ state, menu, onMenu }: { state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const t = useT()
  const speaker: SpeakerTimerView = state.speaker
  const clockMode = speaker.mode === 'clock'
  const running = speaker.startedAt !== null
  const started = speakerStarted(speaker)
  const now = useNow(running || clockMode)
  const c = clockMode ? clockNow(speaker, now) : null
  const shownSec = speakerSeconds(speaker, now)
  const over = (speaker.mode === 'down' && shownSec < 0) || c?.phase === 'after'
  const live = running || c?.phase === 'during'
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
        {c && (
          <span className="relative">
            <button type="button" title={t.timesButtonTitle} onClick={() => onMenu(menu === 'times' ? null : 'times')} className={`rounded-full px-2.5 py-0.5 text-sm tabular-nums hover:bg-line ${menu === 'times' ? 'bg-line text-ink' : 'bg-panel-2 text-ink'}`}>
              🕘 {c.period ? range12(c.period.fromSec, c.endSec) : t.periodsButton}
            </button>
            {menu === 'times' && (
              <Menu up align="right" width="w-[30rem]" onClose={() => onMenu(null)}>
                <ClassPeriods periods={speaker.periods} />
              </Menu>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {c?.phase === 'before' && c.period && <span className="text-sm text-muted">{t.startsAt(time12(c.period.fromSec))}</span>}
          {c?.phase === 'none' && <span className="text-sm text-muted">{t.noPeriodNow}</span>}
          {over && <span className="text-sm font-semibold text-alarm">{t.overTime}</span>}
          <span className={`text-[26px] leading-none font-semibold tracking-tight tabular-nums ${over ? 'text-alarm' : live ? 'text-ink' : 'text-muted'}`}>{c?.phase === 'none' ? '—' : clock(shownSec)}</span>
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
