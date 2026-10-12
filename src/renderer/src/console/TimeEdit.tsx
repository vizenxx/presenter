import { useRef, useState, type ReactNode } from 'react'
import { timeParts, withPart } from '../../../shared/format'
import { useT } from './i18n'

type Part = 'h' | 'm' | 's'
const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/**
 * A time that is its own entry: double-click the hours, the minutes or the seconds to type a new
 * value. The clock does not wait: the other parts keep running while you type, and when you press
 * Enter (or ✓, or leave the box) the typed part is set and the others are what they are at that
 * moment. Esc (or ✕) leaves the clock as it was running. onCommit gets the new time and the time
 * shown at that moment (so the caller can add the difference to a running timer).
 */
export function EditableTime(props: {
  /** The time shown now; it may change every second. Below zero (over time) it cannot be edited. */
  sec: number
  /** Show 1 h or more as h:mm:ss; otherwise minutes run on. */
  hours?: boolean
  maxMinutes: number
  /** Which parts can be typed; false = none (a clock time, or a timer that has not started). */
  editable: Part[] | false
  onCommit: (next: number, current: number) => void
  className?: string
  title?: string
}) {
  const t = useT()
  const { sec, hours = false, maxMinutes, editable, onCommit, className = '', title } = props
  const latest = useRef(sec)
  latest.current = sec
  const [edit, setEdit] = useState<{ part: Part; draft: string } | null>(null)
  const editRef = useRef(edit)
  editRef.current = edit
  const over = sec < 0
  const p = timeParts(Math.abs(sec), hours)

  const finish = (apply: boolean): void => {
    const e = editRef.current
    if (!e) return
    editRef.current = null
    setEdit(null)
    if (!apply || e.draft === '') return
    const current = Math.floor(latest.current)
    const next = withPart(latest.current, hours, e.part, Number(e.draft), maxMinutes)
    if (next !== current) onCommit(next, current)
  }

  const part = (key: Part, value: number): ReactNode => {
    const can = !over && !!editable && editable.includes(key)
    const text = pad(value, key === 'h' ? 1 : 2)
    if (edit?.part === key) {
      return (
        <input
          key={key}
          ref={(el) => {
            if (el && el.dataset['ready'] !== '1') {
              el.dataset['ready'] = '1'
              el.focus()
              el.select()
            }
          }}
          value={edit.draft}
          inputMode="numeric"
          maxLength={3}
          aria-label={key === 'h' ? t.hoursBox : key === 'm' ? t.minutesBox : t.secondsBox}
          title={key === 'h' ? t.hoursBox : key === 'm' ? t.minutesBox : t.secondsBox}
          onChange={(e) => setEdit({ part: key, draft: e.target.value.replace(/\D/g, '').slice(0, 3) })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finish(true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              finish(false)
            }
          }}
          onBlur={() => finish(true)}
          style={{ width: `${Math.max(2, edit.draft.length) + 0.6}ch` }}
          className="rounded-lg bg-panel-2 text-center text-ink ring-2 ring-accent outline-none"
        />
      )
    }
    return (
      <span
        key={key}
        role={can ? 'button' : undefined}
        tabIndex={can ? 0 : undefined}
        title={can ? t.editTimeTitle : undefined}
        onDoubleClick={can ? () => setEdit({ part: key, draft: text }) : undefined}
        onKeyDown={can ? (e) => e.key === 'Enter' && setEdit({ part: key, draft: text }) : undefined}
        className={can ? 'cursor-text rounded-lg px-0.5 hover:bg-line/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none' : 'px-0.5'}
      >
        {text}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1" title={title}>
      <span className={`inline-flex items-baseline tabular-nums ${className}`}>
        {over ? '−' : ''}
        {p.hasHours && (
          <>
            {part('h', p.h)}
            <span>:</span>
          </>
        )}
        {part('m', p.m)}
        <span>:</span>
        {part('s', p.s)}
      </span>
      {edit && (
        <span className="inline-flex items-center gap-1">
          <button type="button" title={t.editTimeApply} aria-label={t.editTimeApply} onMouseDown={(e) => e.preventDefault()} onClick={() => finish(true)} className="grid h-6 w-6 place-items-center rounded-full bg-accent text-sm text-white">
            ✓
          </button>
          <button type="button" title={t.editTimeCancel} aria-label={t.editTimeCancel} onMouseDown={(e) => e.preventDefault()} onClick={() => finish(false)} className="grid h-6 w-6 place-items-center rounded-full bg-panel-2 text-sm text-muted hover:bg-line">
            ✕
          </button>
        </span>
      )}
    </span>
  )
}
