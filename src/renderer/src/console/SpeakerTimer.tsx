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

  return (
    <section className={`rounded-2xl border-2 p-3 ${over ? 'border-alarm/60 bg-alarm/10' : 'border-line bg-panel'}`} title={t.myTimerTitle}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted">{t.myTimer}</h2>
        <div className="ml-auto flex gap-1">
          <Btn tone={mode === 'up' ? 'primary' : 'quiet'} onClick={() => pick('up')}>
            {t.countUp}
          </Btn>
          <Btn tone={mode === 'down' ? 'primary' : 'quiet'} onClick={() => pick('down')}>
            {t.countDown}
          </Btn>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`font-mono text-3xl font-bold tabular-nums ${over ? 'text-alarm' : running ? 'text-ink' : 'text-muted'}`}>{clock(shownSec)}</span>
        {over && <span className="text-sm font-semibold text-alarm">{t.overTime}</span>}
        {mode === 'down' && !started && (
          <span className="flex items-center gap-1">
            <Btn onClick={() => setMinutes((m) => clampMinutes(m - 5))}>−</Btn>
            <input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(clampMinutes(Number(e.target.value)))}
              className="w-16 rounded-lg border border-line bg-panel-2 px-2 py-1 text-center font-mono text-base"
            />
            <Btn onClick={() => setMinutes((m) => clampMinutes(m + 5))}>+</Btn>
            <span className="text-sm text-muted">{t.minutes}</span>
          </span>
        )}
        <span className="ml-auto flex gap-2">
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
