import { useState } from 'react'
import type { AppState, OutputView, PreviewRect } from '../../../shared/types'
import type { DrawerTab } from './Drawer'
import { screenLabel, useT } from './i18n'
import { InkToolbar, MirrorView } from './Ink'
import { Btn, goToSlide, Milestones, PageText, ZoomControl } from './ui'
import { ViewSlot } from './ViewSlot'

const layoutCurrent = (rect: PreviewRect | null): void => window.presenter.layoutCurrent(rect)

function EmptyState({ state, onGuide, onPickWindow }: { state: AppState; onGuide: () => void; onPickWindow: () => void }) {
  const t = useT()
  return (
    <section className="flex min-h-0 flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed border-line bg-panel p-6 text-center">
      <p className="text-[28px] font-semibold tracking-tight">{t.dropHere}</p>
      <p className="text-sm text-muted">{t.supported}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Btn tone="primary" onClick={() => window.presenter.openDialog()}>
          {t.openDeck}
        </Btn>
        <Btn title={t.firstWindowTitle} onClick={onPickWindow}>
          🪟 {t.firstWindow}
        </Btn>
        <Btn title={t.firstWhiteboardTitle} onClick={() => window.presenter.addWhiteboard(true)}>
          ✏️ {t.firstWhiteboard}
        </Btn>
      </div>
      <button type="button" onClick={onGuide} className="text-sm text-tint hover:underline">
        {t.guideLink}
      </button>
      {state.recent.length > 0 && (
        <div className="w-full max-w-xl text-left">
          <h3 className="mb-1 px-3 text-sm text-muted">{t.recentlyOpened}</h3>
          {state.recent.map((d) => (
            <button key={d.path} type="button" title={d.path} onClick={() => window.presenter.openPath(d.path)} className="block w-full truncate rounded-xl px-3 py-2 text-left text-base hover:bg-panel-2 active:scale-100">
              {d.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** 📷: saves what Projector 1 shows, with its marks, as a picture; says "Saved" for a moment. */
function SavePicture() {
  const t = useT()
  const [saved, setSaved] = useState<string | null>(null)
  const save = (): void => {
    void window.presenter.savePicture().then((p) => {
      if (!p) return
      setSaved(p)
      window.setTimeout(() => setSaved(null), 4000)
    })
  }
  return (
    <Btn title={saved ? t.pictureSavedTo(saved) : t.savePictureTitle} onClick={save}>
      {saved ? t.pictureSaved : '📷'}
    </Btn>
  )
}

/**
 * Not projecting: the deck itself, live, in the console (marks drawn here are on it).
 * Projecting: a live video of what the students see, with a marking canvas on top.
 */
export function CurrentPane(props: {
  state: AppState
  projector: OutputView
  mirror: string | null
  suspended: boolean
  drawer: DrawerTab | null
  onDrawer: (tab: DrawerTab | null) => void
  onGuide: () => void
  onPickWindow: () => void
}) {
  const { state, projector, mirror, suspended, drawer, onDrawer, onGuide, onPickWindow } = props
  const t = useT()
  if (!state.mainDeck && projector.kind !== 'capture') return <EmptyState state={state} onGuide={onGuide} onPickWindow={onPickWindow} />
  const selected = state.selectedId === projector.id
  const aspect = state.projectorSize.width / Math.max(1, state.projectorSize.height)
  return (
    <section className={`flex min-h-0 flex-col rounded-card bg-panel p-3 ${selected ? 'ring-2 ring-accent' : 'ring-1 ring-line/60'}`}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="truncate text-sm font-semibold text-muted">
          {state.projecting ? t.paneProjecting : t.paneNotProjecting}
          {t.paneOnAir(screenLabel(t, projector))}
        </h2>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ZoomControl o={projector} />
          <span className="mx-1 h-5 w-px bg-line" />
          <Btn tone={drawer === 'list' ? 'primary' : 'default'} onClick={() => onDrawer(drawer === 'list' ? null : 'list')}>
            {t.slides}
          </Btn>
          <Btn tone={drawer === 'notes' ? 'primary' : 'default'} onClick={() => onDrawer(drawer === 'notes' ? null : 'notes')}>
            {t.notes}
          </Btn>
          <SavePicture />
        </div>
      </div>
      <InkToolbar ink={state.ink} enabled={projector.deck !== null && projector.adapter !== 'loading'} />
      {state.projecting ? (
        <MirrorView aspect={aspect} ink={state.ink} fallback={mirror} />
      ) : (
        <ViewSlot aspect={aspect} suspended={suspended} onRect={layoutCurrent}>
          {t.loadingDeck}
        </ViewSlot>
      )}
      <div className="mt-2 flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-sm text-muted">
          <PageText o={projector} />
          {projector.steps && (
            <span title={t.stepsTitle}>
              {' · '}
              {t.stepsOf(projector.steps.done, projector.steps.count)}
            </span>
          )}
        </span>
        <span className="min-w-0 truncate text-base font-semibold">{projector.title}</span>
        {projector.media && (
          <span className="flex shrink-0 items-center gap-1">
            {projector.media.kinds.map((kind, i) => {
              const playing = projector.media?.playing === i
              const name = `${kind === 'audio' ? t.mediaSound : t.mediaVideo}${(projector.media?.kinds.length ?? 0) > 1 ? ` ${i + 1}` : ''}`
              return (
                <Btn key={i} tone={playing ? 'primary' : 'default'} title={t.mediaTitle} onClick={() => window.presenter.mediaToggle(i)}>
                  {playing ? '⏸' : '▶'} {name}
                </Btn>
              )
            })}
          </span>
        )}
        {state.resumedAt !== null && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 py-0.5 pr-0.5 pl-3 text-sm text-tint" title={t.resumedTitle}>
            {t.resumed(state.resumedAt + 1)}
            <button type="button" onClick={() => goToSlide(0, state.onAirId ?? 'projector')} className="rounded-full px-2 py-0.5 hover:bg-accent/20">
              {t.resumedFirst}
            </button>
          </span>
        )}
        <Milestones state={state} index={projector.shownIndex} />
      </div>
    </section>
  )
}
