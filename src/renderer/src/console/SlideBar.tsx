import { Fragment, useEffect, useRef } from 'react'
import type { AppState } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { Btn, goToSlide, UiIcon } from './ui'

/** What the slide bar shows: the slide list (jump), or the speaker notes of the slide in view. Both go with the slides. */
export type BarKind = 'slides' | 'notes'

/** The slide the bar follows: the selected screen, which can show another deck. */
function useFocus(state: AppState): { label: string; deck: string; current: number } {
  const t = useT()
  const focus = state.outputs.find((o) => o.id === state.slidesOf)
  return { label: focus ? screenLabel(t, focus) : '', deck: focus?.deck?.name ?? '', current: focus?.shownIndex ?? 0 }
}

function SlideList({ state, current }: { state: AppState; current: number }) {
  const t = useT()
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [current])
  if (state.slides.length === 0) return <p className="p-2 text-sm text-muted">{t.noSlideList}</p>
  let lastSection = ''
  return (
    <div className="flex flex-col gap-0.5">
      {state.slides.map((s, i) => {
        const section = s.sectionLabel || s.section || ''
        const header = section && section !== lastSection ? section : null
        if (section) lastSection = section
        const isActive = i === current
        return (
          <Fragment key={i}>
            {header && <h3 className="mt-2 px-2 text-sm font-semibold text-tint">{header}</h3>}
            <button
              ref={isActive ? active : undefined}
              type="button"
              onClick={() => goToSlide(i, state.slidesOf)}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm active:scale-100 ${isActive ? 'bg-accent font-semibold text-white' : 'text-muted hover:bg-panel-2 hover:text-ink'}`}
            >
              <span className="w-7 shrink-0 text-right tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{s.title || t.slideN(i + 1)}</span>
              {s.minutes ? <span className="shrink-0 rounded-full bg-panel-2 px-2 text-ink">{t.presetMinutes(s.minutes)}</span> : null}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

/**
 * The slide bar, as in a slide editor: a narrow rail with one button per thing that goes with the
 * slides (Slides, Notes); a button opens its panel beside the rail, from the left, and the same
 * button closes it. The panel has no tabs of its own.
 */
export function SlideBar({ state, open, onOpen }: { state: AppState; open: BarKind | null; onOpen: (kind: BarKind | null) => void }) {
  const t = useT()
  const { label, deck, current } = useFocus(state)
  const entry = (kind: BarKind, icon: 'list' | 'note', name: string) => (
    <button
      key={kind}
      type="button"
      aria-pressed={open === kind}
      title={kind === 'slides' ? t.slidesTitle : t.notesTitle}
      onClick={() => onOpen(open === kind ? null : kind)}
      className={`flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] leading-none ${open === kind ? 'bg-accent text-white' : 'text-muted hover:bg-panel-2 hover:text-ink'}`}
    >
      <UiIcon name={icon} size={18} />
      {name}
    </button>
  )
  const note = state.slides[current]?.notes
  return (
    <div className="flex min-h-0 gap-2">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 self-start rounded-card bg-panel p-1.5 ring-1 ring-line/60" aria-label={t.slideBarLabel}>
        {entry('slides', 'list', t.slides)}
        {entry('notes', 'note', t.notes)}
      </nav>
      {open && (
        <aside className="flex min-h-0 w-72 shrink-0 animate-[slideInLeft_0.18s_ease-out] flex-col overflow-hidden rounded-card bg-panel ring-1 ring-line/60">
          <div className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {open === 'slides' ? t.slides : t.notesOf(current + 1)}
              <span className="font-normal text-muted">
                {' · '}
                {label}
                {deck ? ` · ${deck}` : ''}
              </span>
            </h2>
            <Btn tone="quiet" title={t.hide} onClick={() => onOpen(null)}>
              ✕
            </Btn>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {open === 'slides' ? <SlideList state={state} current={current} /> : note ? <p className="p-1 text-base leading-relaxed whitespace-pre-wrap select-text">{note}</p> : <p className="p-1 text-sm text-muted">{t.noNotes}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}
