import { useState } from 'react'
import type { AppState } from '../../../shared/types'
import { AdjustTime } from './AdjustTime'
import { useT } from './i18n'
import { WarningBells } from './TimerPanel'

const OPEN_KEY = 'presenter.timerTools.open'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    // Remembering open or folded is a convenience.
  }
}

/**
 * The timer tools that are not needed every minute, in one card that folds: Change the time
 * (both timers) and the class timer's warning bells. Folded, it is one line that still says how
 * many bells are set. Presenter remembers open or folded.
 */
export function TimerTools({ state }: { state: AppState }) {
  const t = useT()
  const [open, setOpen] = useState(readOpen)
  const toggle = (): void => {
    setOpen(!open)
    writeOpen(!open)
  }
  const bells = state.timer.warnings.length
  return (
    <section className="rounded-card bg-panel ring-1 ring-line/60">
      <button type="button" aria-expanded={open} title={open ? t.toolsFold : t.toolsOpen} onClick={toggle} className="flex w-full items-center gap-2 rounded-card px-4 py-2 text-left text-sm active:scale-100 hover:bg-panel-2/60">
        <span className="font-semibold text-muted">⚙ {t.toolsTitle}</span>
        <span className="text-muted">· {t.toolsSummary(bells)}</span>
        <span className="ml-auto text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-4 pb-2.5">
          <AdjustTime state={state} />
          <WarningBells warnings={state.timer.warnings} />
        </div>
      )}
    </section>
  )
}
