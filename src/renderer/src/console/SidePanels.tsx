import { Fragment, useEffect, useRef } from 'react'
import type { AppState } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { RollerPanel } from './RollerPanel'
import { goToSlide, UiIcon } from './ui'

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

/** The slide the lists and notes follow: the selected screen, which can show another deck. */
function useFocus(state: AppState): { label: string; deck: string; current: number } {
  const t = useT()
  const focus = state.outputs.find((o) => o.id === state.slidesOf)
  return { label: focus ? screenLabel(t, focus) : '', deck: focus?.deck?.name ?? '', current: focus?.shownIndex ?? 0 }
}

/** The pop-up of the Slides button: the slide list, with the screen and deck it follows. */
export function SlidesPopup({ state }: { state: AppState }) {
  const t = useT()
  const { label, deck, current } = useFocus(state)
  return (
    <div className="flex max-h-[70vh] flex-col">
      <p className="flex items-center gap-1.5 truncate px-2 py-1 text-sm font-semibold">
        <UiIcon name="list" size={15} />
        <span className="shrink-0">{t.slides}</span>
        <span className="min-w-0 truncate font-normal text-muted">
          {label}
          {deck ? ` · ${deck}` : ''}
        </span>
      </p>
      <div className="min-h-0 overflow-y-auto p-1">
        <SlideList state={state} current={current} />
      </div>
    </div>
  )
}

/** The pop-up of the Participants button: pick one, or make teams. */
export function ParticipantsPopup({ state }: { state: AppState }) {
  return (
    <div className="max-h-[70vh] overflow-y-auto p-1.5">
      <RollerPanel state={state} />
    </div>
  )
}

/** The speaker notes of the slide in view, under the next slide: they belong to the slide, so they are always there. */
export function NotesPane({ state }: { state: AppState }) {
  const t = useT()
  const { current } = useFocus(state)
  const note = state.slides[current]?.notes
  if (!note) {
    return (
      <section className="flex shrink-0 items-baseline gap-2 rounded-card bg-panel px-3 py-2 ring-1 ring-line/60">
        <h2 className="shrink-0 text-sm font-semibold text-muted">{t.notesOf(current + 1)}</h2>
        <span className="min-w-0 truncate text-sm text-muted">{t.noNotes}</span>
      </section>
    )
  }
  return (
    <section className="flex max-h-[45%] min-h-0 shrink-0 flex-col rounded-card bg-panel px-3 py-2 ring-1 ring-line/60">
      <h2 className="text-sm font-semibold text-muted">{t.notesOf(current + 1)}</h2>
      <p className="mt-1 min-h-0 overflow-y-auto text-base leading-relaxed whitespace-pre-wrap select-text">{note}</p>
    </section>
  )
}
