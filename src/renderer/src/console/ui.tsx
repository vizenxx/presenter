import { useEffect, useRef, type ReactNode } from 'react'
import type { AppState, DeckStatus, OutputView } from '../../../shared/types'
import { useT } from './i18n'

type Tone = 'default' | 'primary' | 'quiet'
const TONES: Record<Tone, string> = {
  default: 'bg-panel-2 text-ink hover:bg-line',
  primary: 'bg-accent font-semibold text-black hover:bg-accent-strong',
  quiet: 'text-muted hover:bg-panel-2 hover:text-ink'
}

export function Btn(props: { children: ReactNode; onClick?: () => void; tone?: Tone; title?: string; disabled?: boolean }) {
  const { children, onClick, tone = 'default', title, disabled } = props
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]}`}
    >
      {children}
    </button>
  )
}

/** Menus that can be open in the console; native deck views step aside while one is. */
export type ConsoleMenu = 'recent' | 'add' | `screen:${string}` | null

/**
 * A pop-up menu below (or above) its button. A press anywhere else closes it; the button
 * itself toggles it (presses inside the menu's parent do not count as "elsewhere").
 */
export function Menu(props: { children: ReactNode; onClose: () => void; up?: boolean; width?: string }) {
  const { children, onClose, up = false, width = 'w-96' } = props
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent): void => {
      if (box.current?.parentElement?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [onClose])
  return (
    <div ref={box} onClick={(e) => e.stopPropagation()} className={`absolute left-0 z-20 rounded-xl border border-line bg-panel-2 p-1.5 shadow-2xl ${up ? 'bottom-full mb-1' : 'top-full mt-1'} ${width}`}>
      {children}
    </div>
  )
}

export function MenuItem({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-line">
      {children}
    </button>
  )
}

/** Text size (字号): page zoom for one screen, like Ctrl + / Ctrl − in a browser. */
export function ZoomControl({ o }: { o: OutputView }) {
  const t = useT()
  const whole = o.deckKind !== null && o.deckKind !== 'html'
  const off = !o.deck || whole
  return (
    <div className="flex items-center gap-1" title={whole ? t.textSizeWholePage : t.textSizeTitle}>
      <span className="text-sm text-muted">{t.textSize}</span>
      <Btn disabled={off} onClick={() => window.presenter.zoom(o.id, 'out')}>
        A−
      </Btn>
      <button type="button" disabled={off} title={t.backTo100} onClick={() => window.presenter.zoom(o.id, 'reset')} className="w-14 rounded-lg py-1.5 text-center font-mono text-sm hover:bg-line disabled:opacity-40">
        {o.zoomPercent}%
      </button>
      <Btn disabled={off} onClick={() => window.presenter.zoom(o.id, 'in')}>
        A+
      </Btn>
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
      {converting && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
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
      <span title={t.keyModeTitle} className="ml-1.5 rounded bg-panel-2 px-1.5 text-muted">
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
            onClick={() => goToSlide(m.slideIndex)}
            className={`rounded-full px-2.5 py-0.5 text-sm ${active ? 'bg-accent font-semibold text-black' : 'bg-panel-2 text-muted hover:text-ink'}`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
