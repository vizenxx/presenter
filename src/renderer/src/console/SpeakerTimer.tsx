import { useEffect, useState } from 'react'
import { clock } from '../../../shared/format'
import { useT } from './i18n'
import { Btn } from './ui'

type Mode = 'up' | 'down'

const clampMinutes = (m: number): number => Math.min(240, Math.max(1, Math.round(Number.isFinite(m) ? m : 1)))

/**
 * The speaker's own timer, for pacing the talk. It lives only in this console: the class timer,
 * the projector and the main process never see it, and it makes no sound.
 */
export function SpeakerTimer() {
  const t = useT()
  const [mode, setMode] = useState<Mode>('up')
  const [minutes, setMinutes] = useState(45)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [heldMs, setHeldMs] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const running = startedAt !== null
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  const elapsedSec = (heldMs + (running ? now - startedAt : 0)) / 1000
  const shownSec = mode === 'up' ? elapsedSec : minutes * 60 - elapsedSec
  const over = mode === 'down' && shownSec < 0
  const started = running || heldMs > 0

  const toggle = (): void => {
    if (running) {
      setHeldMs((h) => h + Date.now() - startedAt)
      setStartedAt(null)
    } else {
      setNow(Date.now())
      setStartedAt(Date.now())
    }
  }
  const reset = (): void => {
    setStartedAt(null)
    setHeldMs(0)
  }
  const pick = (m: Mode): void => {
    setMode(m)
    reset()
  }

  const SMALL = 'rounded-md px-2 py-1 text-sm'
  return (
    <section className={`rounded-2xl border-2 px-3 py-2 ${over ? 'border-alarm/60 bg-alarm/10' : 'border-line bg-panel'}`} title={t.myTimerTitle}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-semibold text-muted">{t.myTimer}</h2>
        <span className="flex overflow-hidden rounded-md border border-line">
          <button type="button" onClick={() => pick('up')} className={`${SMALL} ${mode === 'up' ? 'bg-accent text-black' : 'text-muted hover:bg-line'}`}>
            {t.countUp}
          </button>
          <button type="button" onClick={() => pick('down')} className={`${SMALL} ${mode === 'down' ? 'bg-accent text-black' : 'text-muted hover:bg-line'}`}>
            {t.countDown}
          </button>
        </span>
        {mode === 'down' && !started && (
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(clampMinutes(Number(e.target.value)))}
              className="w-12 rounded-md border border-line bg-panel-2 px-1 py-0.5 text-center font-mono text-sm"
            />
            <span className="text-sm text-muted">{t.minutes}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {over && <span className="text-sm font-semibold text-alarm">{t.overTime}</span>}
          <span className={`font-mono text-2xl font-bold tabular-nums ${over ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>{clock(shownSec)}</span>
          <Btn tone="primary" onClick={toggle}>
            {running ? t.pause : started ? t.resume : t.start}
          </Btn>
          <Btn disabled={!started} onClick={reset}>
            {t.reset}
          </Btn>
        </span>
      </div>
    </section>
  )
}
