import { useState } from 'react'
import type { AppState, OutputView, PreviewRect } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { BarButtons, type BarKind } from './SlideBar'
import { InkToolbar, MirrorView } from './Ink'
import { Btn, goToSlide, IconLabel, Milestones, PageText, UiIcon, ZoomControl, Menu, useFlipped, type ConsoleMenu } from './ui'
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
          <IconLabel icon="window">{t.firstWindow}</IconLabel>
        </Btn>
        <Btn title={t.firstWhiteboardTitle} onClick={() => window.presenter.addWhiteboard(true)}>
          <IconLabel icon="board">{t.firstWhiteboard}</IconLabel>
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

/** The camera button: saves what Projector 1 shows, with its marks, as a picture; says "Saved" for a moment. */
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
      {/* A fixed icon box, so the button keeps its size and the icon sits in the middle of it. */}
      <span className="flex h-5 min-w-5 items-center justify-center">{saved ? t.pictureSaved : <UiIcon name="camera" size={18} />}</span>
    </Btn>
  )
}

/**
 * Not projecting: the deck itself, live, in the console (marks drawn here are on it).
 * Projecting: a live video of what the participants see, with a marking canvas on top.
 */
export function CurrentPane(props: {
  state: AppState
  projector: OutputView
  mirror: string | null
  suspended: boolean
  bar: BarKind | null
  onBar: (kind: BarKind | null) => void
  onGuide: () => void
  onPickWindow: () => void
}) {
  const { state, projector, mirror, suspended, bar, onBar, onGuide, onPickWindow } = props
  const t = useT()
  const flipped = useFlipped()
  if (!state.mainDeck && projector.deck === null && projector.kind !== 'capture') return <EmptyState state={state} onGuide={onGuide} onPickWindow={onPickWindow} />
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
          <SavePicture />
        </div>
      </div>
      <InkToolbar ink={state.ink} enabled={projector.deck !== null && projector.adapter !== 'loading'} />
      {state.resumedAt !== null && (
        // A deck opened again within 3 hours stands on the slide it showed last: the two ways on, side by side, right above the slide.
        <div role="group" aria-label={t.resumedAsk} title={t.resumedTitle} className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-accent/10 p-2 pl-4 ring-1 ring-accent/40">
          <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{t.resumedAsk}</span>
          <span className="flex shrink-0 gap-2">
            <button type="button" onClick={() => window.presenter.dismissResumed()} className="flex w-48 flex-col items-center rounded-xl bg-accent px-4 py-1.5 text-white hover:bg-accent-strong">
              <span className="text-sm font-semibold">{t.resumedStay(state.resumedAt + 1)}</span>
              <span className="text-sm opacity-85">{t.resumedStayHint}</span>
            </button>
            <button type="button" onClick={() => goToSlide(0, state.onAirId ?? 'projector')} className="flex w-48 flex-col items-center rounded-xl bg-panel-2 px-4 py-1.5 text-ink ring-2 ring-line hover:bg-line">
              <span className="text-sm font-semibold">{t.resumedFirst}</span>
              <span className="text-sm text-muted">{t.resumedFirstHint}</span>
            </button>
          </span>
        </div>
      )}
      {state.projecting ? (
        <MirrorView aspect={aspect} ink={state.ink} fallback={mirror} />
      ) : (
        <ViewSlot aspect={aspect} suspended={suspended} onRect={layoutCurrent}>
          {t.loadingDeck}
        </ViewSlot>
      )}
      <div className={`mt-2 flex min-w-0 items-center gap-3 ${flipped ? 'flex-row-reverse' : ''}`}>
        {state.mainDeck && <BarButtons open={bar} onOpen={onBar} />}
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
                  <IconLabel icon={playing ? 'pause' : 'play'} size={14}>
                    {name}
                  </IconLabel>
                </Btn>
              )
            })}
            <Btn title={t.mediaFullTitle} onClick={() => window.presenter.mediaFullscreen()}>
              <IconLabel icon="expand" size={14}>
                {t.mediaFull}
              </IconLabel>
            </Btn>
          </span>
        )}
        <Milestones state={state} index={projector.shownIndex} />
      </div>
    </section>
  )
}
