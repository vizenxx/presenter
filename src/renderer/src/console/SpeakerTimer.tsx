import { useEffect, useState } from 'react'
import { clockNow, from12, MAX_PERIODS, range12, speakerSeconds, speakerStarted, time12, WEEK_ORDER } from '../../../shared/timer'
import type { AppState, ClockPeriod, SpeakerMode, SpeakerTimerView } from '../../../shared/types'
import { useT, type Strings } from './i18n'
import { EditableTime } from './TimeEdit'
import { AdjustButton } from './TimerPanel'
import { Btn, Menu, NumberField, UiIcon, type ConsoleMenu } from './ui'

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

/** short = the label on a narrow card (the slide bar open makes the cards narrow). */
const MODES: Array<{ mode: SpeakerMode; label: (t: Strings) => string; short: string }> = [
  { mode: 'up', label: (t) => t.countUp, short: 'Up' },
  { mode: 'down', label: (t) => t.countDown, short: 'Down' },
  { mode: 'clock', label: (t) => t.fromTo, short: 'From–to' }
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
 * The sessions of My timer From–to, in the 🕘 pop-up: one card per period with its weekdays
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
        <h3 className="flex items-center gap-1.5 font-semibold text-ink">
          <UiIcon name="clock" size={16} />
          {t.timesTitle}
        </h3>
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
 * The speaker's own timer, for pacing the talk, as an upright card beside the shared timer. The
 * participants never see it and it makes no sound. The time is its own entry (double-click the
 * minutes or the seconds; it keeps running meanwhile). From–to: today's sessions: during one it
 * counts down to its end by itself, then shows Over time for 30 minutes; before the next one it
 * says when that starts. The sessions are set with the clock button.
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
  // Count down before it starts: the minutes it will count (whole minutes). Started: the time left (or counted) is moved by the difference.
  // Clock times set themselves, and a count up that has not started has nothing to change.
  const editable: Array<'h' | 'm' | 's'> | false = clockMode ? false : speaker.mode === 'down' && !started ? ['m'] : started ? ['h', 'm', 's'] : false
  const commit = (next: number, current: number): void => {
    if (speaker.mode === 'down' && !started) window.presenter.speakerMinutes(Math.max(1, Math.round(next / 60)))
    else window.presenter.speakerAdjust(next - current)
  }
  return (
    <section className={`@container flex min-w-0 flex-col gap-2 rounded-card p-3 ${over ? 'bg-alarm/10 ring-2 ring-alarm/60' : 'bg-panel ring-1 ring-line/60'}`} title={t.myTimerTitle}>
      <h2 className="text-sm leading-tight font-semibold text-muted">{t.myTimer}</h2>
      <span className="flex self-start rounded-full bg-panel-2 p-0.5">
        {MODES.map(({ mode, label, short }) => (
          <button key={mode} type="button" title={label(t)} onClick={() => window.presenter.speakerMode(mode)} className={`${SMALL} whitespace-nowrap ${speaker.mode === mode ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            <span className="@max-[18rem]:hidden">{label(t)}</span>
            <span className="hidden @max-[18rem]:inline">{short}</span>
          </button>
        ))}
      </span>
      <div className="flex min-h-14 flex-col items-center justify-center">
        {c?.phase === 'none' ? (
          <span className="text-[40px] leading-none font-semibold text-muted">—</span>
        ) : (
          <EditableTime
            sec={shownSec}
            hours
            maxMinutes={speaker.mode === 'down' && !started ? 240 : 599}
            editable={editable}
            onCommit={commit}
            className={`text-[40px] leading-none font-semibold tracking-tight ${over ? 'text-alarm' : live ? 'text-ink' : 'text-muted'}`}
            title={editable ? t.editTimeTitle : undefined}
          />
        )}
        {c?.phase === 'before' && c.period && <span className="mt-1 text-sm text-muted">{t.startsAt(time12(c.period.fromSec))}</span>}
        {c?.phase === 'none' && <span className="mt-1 text-sm text-muted">{t.noPeriodNow}</span>}
        {over && <span className="mt-1 text-sm font-semibold text-alarm">{t.overTime}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
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
        {c && (
          <span className="relative">
            <button type="button" title={t.timesButtonTitle} onClick={() => onMenu(menu === 'times' ? null : 'times')} className={`rounded-full px-2.5 py-1 text-sm tabular-nums hover:bg-line ${menu === 'times' ? 'bg-line text-ink' : 'bg-panel-2 text-ink'}`}>
              <span className="inline-flex items-center gap-1">
                <UiIcon name="clock" size={15} />
                {c.period ? range12(c.period.fromSec, c.endSec) : t.periodsButton}
              </span>
            </button>
            {menu === 'times' && (
              <Menu up align="right" width="w-[30rem]" onClose={() => onMenu(null)}>
                <ClassPeriods periods={speaker.periods} />
              </Menu>
            )}
          </span>
        )}
        <AdjustButton state={state} target="mine" menu={menu} onMenu={onMenu} />
      </div>
    </section>
  )
}
