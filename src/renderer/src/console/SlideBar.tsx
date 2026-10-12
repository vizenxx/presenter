import { Fragment, useEffect, useRef } from 'react'
import type { AppState } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { Btn, goToSlide, IconLabel, useFlipped } from './ui'

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
 * The two buttons of the slide bar (Slides, Notes). They sit in the current slide's own row, at
 * its left edge, where the panel they open comes in from. A button opens its panel; the same
 * button closes it.
 */
export function BarButtons({ open, onOpen }: { open: BarKind | null; onOpen: (kind: BarKind | null) => void }) {
  const t = useT()
  const entry = (kind: BarKind, icon: 'list' | 'note', name: string) => (
    <Btn key={kind} tone={open === kind ? 'primary' : 'default'} title={kind === 'slides' ? t.slidesTitle : t.notesTitle} onClick={() => onOpen(open === kind ? null : kind)}>
      <IconLabel icon={icon}>{name}</IconLabel>
    </Btn>
  )
  return (
    <span className="flex shrink-0 items-center gap-1.5" role="group" aria-label={t.slideBarLabel}>
      {entry('slides', 'list', t.slides)}
      {entry('notes', 'note', t.notes)}
    </span>
  )
}

/** The slide bar's panel, at the left of the console: the slide list or the notes of the slide in view. */
export function SlidePanel({ state, open, onClose }: { state: AppState; open: BarKind; onClose: () => void }) {
  const t = useT()
  const flipped = useFlipped()
  const { label, deck, current } = useFocus(state)
  const note = state.slides[current]?.notes
  return (
    <aside className={`flex min-h-0 w-72 shrink-0 ${flipped ? 'animate-[slideInRight_0.18s_ease-out]' : 'animate-[slideInLeft_0.18s_ease-out]'} flex-col overflow-hidden rounded-card bg-panel ring-1 ring-line/60`}>
      <div className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {open === 'slides' ? t.slides : t.notesOf(current + 1)}
          <span className="font-normal text-muted">
            {' · '}
            {label}
            {deck ? ` · ${deck}` : ''}
          </span>
        </h2>
        <Btn tone="quiet" title={t.hide} onClick={onClose}>
          ✕
        </Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {open === 'slides' ? <SlideList state={state} current={current} /> : note ? <p className="p-1 text-base leading-relaxed whitespace-pre-wrap select-text">{note}</p> : <p className="p-1 text-sm text-muted">{t.noNotes}</p>}
      </div>
    </aside>
  )
}
