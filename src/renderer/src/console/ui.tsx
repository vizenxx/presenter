import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppState, DeckStatus, OutputView } from '../../../shared/types'
import { useT } from './i18n'

type Tone = 'default' | 'primary' | 'quiet'
const TONES: Record<Tone, string> = {
  default: 'bg-panel-2 text-ink hover:bg-line',
  primary: 'bg-accent font-semibold text-white hover:bg-accent-strong',
  quiet: 'text-tint hover:bg-panel-2'
}

export function Btn(props: { children: ReactNode; onClick?: () => void; tone?: Tone; title?: string; disabled?: boolean }) {
  const { children, onClick, tone = 'default', title, disabled } = props
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]}`}
    >
      {children}
    </button>
  )
}

const HOLD_DELAY_MS = 400
const HOLD_EVERY_MS = 80

/**
 * A button that repeats while it is held down (like a keyboard key): one step at once, then,
 * after a short pause, a step every 80 ms until the mouse is released. A keyboard press is one step.
 */
export function HoldBtn(props: { children: ReactNode; onStep: () => void; title?: string; disabled?: boolean; className: string }) {
  const { children, onStep, title, disabled, className } = props
  const step = useRef(onStep)
  step.current = onStep
  const timer = useRef<number | null>(null)
  const stop = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return
        stop()
        step.current()
        timer.current = window.setTimeout(() => {
          timer.current = window.setInterval(() => step.current(), HOLD_EVERY_MS)
        }, HOLD_DELAY_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        // detail 0 = Enter or Space; mouse clicks already stepped on pointer down.
        if (e.detail === 0) step.current()
      }}
      className={className}
    >
      {children}
    </button>
  )
}

/**
 * A number box that can be emptied while typing. It keeps the last valid value; leaving the box
 * (or Enter) puts a value into range, and an empty box shows the last value again.
 * live = false: the value goes out only when you leave the box or press Enter (a sorted list must not move while you type).
 */
export function NumberField(props: { value: number; min: number; max: number; onChange: (n: number) => void; onEnter?: (n: number) => void; digits?: number; title?: string; className?: string; live?: boolean; disabled?: boolean }) {
  const { value, min, max, onChange, onEnter, digits = 0, title, className = '', live = true, disabled = false } = props
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value).padStart(digits, '0')
  const commit = (): number => {
    const n = draft === null || draft === '' ? value : Math.min(max, Math.max(min, Number(draft)))
    if (n !== value) onChange(n)
    setDraft(null)
    return n
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      title={title}
      disabled={disabled}
      value={shown}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const text = e.target.value.replace(/\D/g, '').slice(0, String(max).length)
        setDraft(text)
        const n = Number(text)
        if (live && text !== '' && n >= min && n <= max) onChange(n)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const n = commit()
        onEnter?.(n)
      }}
      className={`rounded-full bg-panel-2 px-1 py-1 text-center text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  )
}

/** Menus that can be open in the console; native deck views step aside while one is. */
export type ConsoleMenu = 'recent' | 'add' | 'bells' | 'times' | 'adjust-class' | 'adjust-mine' | `screen:${string}` | `show:${string}` | null

/**
 * A pop-up menu below (or above) its button, from its left edge (or, align right, its right edge).
 * A press anywhere else or Esc closes it (Esc then does nothing else, e.g. it does not stop
 * projecting); the button itself toggles it (presses inside the menu's parent do not count as "elsewhere").
 */
export function Menu(props: { children: ReactNode; onClose: () => void; up?: boolean; width?: string; align?: 'left' | 'right' }) {
  const { children, onClose, up = false, width = 'w-96', align = 'left' } = props
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent): void => {
      if (box.current?.parentElement?.contains(e.target as Node)) return
      onClose()
    }
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', escape, true)
    }
  }, [onClose])
  return (
    <div ref={box} onClick={(e) => e.stopPropagation()} className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-20 rounded-2xl bg-panel p-1.5 shadow-xl ring-1 ring-line/70 ${up ? 'bottom-full mb-2' : 'top-full mt-2'} ${width}`}>
      {children}
    </div>
  )
}

export function MenuItem({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} className="group block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-accent hover:text-white active:scale-100">
      {children}
    </button>
  )
}

const ZOOM_BTN = `rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${TONES.default}`

/** Text size (字号): page zoom for one screen in 5 % steps, like Ctrl + / Ctrl − in a browser. */
export function ZoomControl({ o }: { o: OutputView }) {
  const t = useT()
  const whole = o.deckKind !== null && o.deckKind !== 'html'
  const off = !o.deck || whole
  return (
    <div className="flex items-center gap-1" title={whole ? t.textSizeWholePage : t.textSizeTitle}>
      <span className="text-sm text-muted">{t.textSize}</span>
      <HoldBtn disabled={off} title={t.holdToRepeat} onStep={() => window.presenter.zoom(o.id, 'out')} className={ZOOM_BTN}>
        A−
      </HoldBtn>
      <button type="button" disabled={off} title={t.backTo100} onClick={() => window.presenter.zoom(o.id, 'reset')} className="w-14 rounded-full py-1.5 text-center text-sm tabular-nums hover:bg-panel-2 disabled:opacity-40">
        {o.zoomPercent}%
      </button>
      <HoldBtn disabled={off} title={t.holdToRepeat} onStep={() => window.presenter.zoom(o.id, 'in')} className={ZOOM_BTN}>
        A+
      </HoldBtn>
    </div>
  )
}

/** Converting a PPT, or a file that could not be opened. */
export function DeckStatusBar({ status }: { status: DeckStatus }) {
  const t = useT()
  if (status.state === 'ready') return null
  const converting = status.state === 'converting'
  const message = converting ? t.converting : t.deckErrors[status.code ?? 'open-failed']
  return (
    <div className={`flex items-center gap-3 border-b px-4 py-2 text-sm ${converting ? 'border-line bg-panel-2' : 'border-alarm/40 bg-alarm/15'}`}>
      {converting && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-tint border-t-transparent" />}
      <span className="shrink-0 font-semibold">{status.name}</span>
      <span className={`min-w-0 ${converting ? 'text-muted' : ''}`} title={status.detail}>
        {message}
      </span>
      {!converting && (
        <span className="ml-auto shrink-0">
          <Btn tone="quiet" onClick={() => window.presenter.dismissDeckStatus()}>
            {t.close}
          </Btn>
        </span>
      )}
    </div>
  )
}

/** Jump on a given screen (default: the projector); linked screens follow as usual. */
export function goToSlide(index: number, screen = 'projector'): void {
  window.presenter.select(screen)
  window.presenter.navigate({ type: 'goto', index })
}

export function PageText({ o }: { o: OutputView }) {
  const t = useT()
  if (!o.deck) return <>{t.noDeckShort}</>
  if (o.adapter === 'loading') return <>{t.connecting}</>
  const page = o.shownIndex + 1
  if (o.total) return <>{t.slideOf(page, o.total)}</>
  return (
    <>
      {t.slideN(page)}
      <span title={t.keyModeTitle} className="ml-1.5 rounded-full bg-panel-2 px-2 text-muted">
        {t.keyMode}
      </span>
    </>
  )
}

export function Milestones({ state, index }: { state: AppState; index: number }) {
  const t = useT()
  if (state.milestones.length === 0) return null
  return (
    <div className="ml-auto flex shrink-0 gap-1.5">
      {state.milestones.map((m) => {
        const [from, to] = m.range ?? [m.slideIndex, m.slideIndex]
        const active = index >= from && index <= to
        return (
          <button
            key={`${m.label}-${m.slideIndex}`}
            type="button"
            title={t.goTo(m.label)}
            onClick={() => goToSlide(m.slideIndex, state.onAirId ?? 'projector')}
            className={`rounded-full px-3 py-0.5 text-sm ${active ? 'bg-accent font-semibold text-white' : 'bg-panel-2 text-muted hover:text-ink'}`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
