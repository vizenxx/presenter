import { Fragment, useEffect, useRef } from 'react'
import type { AppState } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { RollerPanel } from './RollerPanel'
import { Btn, goToSlide } from './ui'

export type DrawerTab = 'list' | 'notes' | 'roller'

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

function Notes({ state, current }: { state: AppState; current: number }) {
  const t = useT()
  const note = state.slides[current]?.notes
  if (!note) return <p className="p-2 text-sm text-muted">{t.noNotes}</p>
  return <p className="p-2 text-base leading-relaxed whitespace-pre-wrap select-text">{note}</p>
}

export function Drawer({ state, tab, onTab }: { state: AppState; tab: DrawerTab; onTab: (t: DrawerTab | null) => void }) {
  const t = useT()
  // Lists and notes follow the selected screen, which can show another deck.
  const focus = state.outputs.find((o) => o.id === state.slidesOf)
  const current = focus?.shownIndex ?? 0
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-card bg-panel ring-1 ring-line/60">
      <div className="flex gap-1.5 border-b border-line/70 p-2">
        <Btn tone={tab === 'list' ? 'primary' : 'default'} onClick={() => onTab('list')}>
          {t.slides}
        </Btn>
        <Btn tone={tab === 'notes' ? 'primary' : 'default'} onClick={() => onTab('notes')}>
          {t.notes}
        </Btn>
        <Btn tone={tab === 'roller' ? 'primary' : 'default'} title={t.pick} onClick={() => onTab('roller')}>
          {t.pickTab}
        </Btn>
        <span className="ml-auto">
          <Btn tone="quiet" title={t.hide} onClick={() => onTab(null)}>
            ✕
          </Btn>
        </span>
      </div>
      {focus && tab !== 'roller' && (
        <p className="border-b border-line/70 px-3 py-1.5 text-sm text-muted">
          {screenLabel(t, focus)}
          {focus.deck ? ` · ${focus.deck.name}` : ''}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'list' && <SlideList state={state} current={current} />}
        {tab === 'notes' && <Notes state={state} current={current} />}
        {tab === 'roller' && <RollerPanel state={state} />}
      </div>
    </aside>
  )
}
