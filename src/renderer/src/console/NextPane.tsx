import type { AppState, OutputView, PreviewRect } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { PageText } from './ui'
import { ViewSlot } from './ViewSlot'

const layoutNext = (rect: PreviewRect | null): void => window.presenter.layoutPreview(rect)

/**
 * The slide after the one the chosen screen shows. Clicking it selects it: page keys then
 * turn only the preview (students see nothing change) until a real screen is selected again.
 */
export function NextPane({ state, next, suspended }: { state: AppState; next: OutputView; suspended: boolean }) {
  const t = useT()
  const source = state.outputs.find((o) => o.id === state.previewOf)
  const selected = state.selectedId === next.id
  const aspect = state.previewSize.width / Math.max(1, state.previewSize.height)
  const atEnd = next.total !== null && next.index >= next.total
  return (
    <section
      onClick={() => window.presenter.select(next.id)}
      title={selected ? undefined : t.nextSelectTitle}
      className={`flex min-h-0 flex-1 cursor-pointer flex-col rounded-2xl border-2 bg-panel p-3 ${selected ? 'border-accent' : 'border-line'}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold text-muted">
          {t.nextSlide}
          {source ? ` · ${screenLabel(t, source)}` : ''}
        </h2>
        {selected && <span className="shrink-0 rounded bg-accent px-1.5 text-sm text-black">{t.previewBrowsing}</span>}
        <span className="ml-auto shrink-0 text-sm text-muted">{atEnd ? t.lastSlide : <PageText o={next} />}</span>
      </div>
      <ViewSlot aspect={aspect} suspended={suspended || atEnd} onRect={layoutNext}>
        {atEnd ? t.nothingAfter : t.loadingPreview}
      </ViewSlot>
      <p className="mt-2 min-h-6 truncate text-sm">{atEnd ? '' : next.title}</p>
    </section>
  )
}
