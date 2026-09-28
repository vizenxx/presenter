import type { AppState, OutputView } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { Menu, MenuItem, ZoomControl, type ConsoleMenu } from './ui'

const SMALL_BTN = 'grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-sm hover:bg-line'

/** "3/18"; key-mode decks show only the page number. */
function PageShort({ o }: { o: OutputView }) {
  const t = useT()
  if (!o.deck) return <>—</>
  if (o.adapter === 'loading') return <>…</>
  if (!o.total) return <span title={t.keyModeTitle}>{o.shownIndex + 1}</span>
  return (
    <>
      {o.shownIndex + 1}/{o.total}
    </>
  )
}

/** One screen, kept small: name, page, Linked, one-page moves; the rest sits in its ⋯ menu. */
function ScreenChip(props: { o: OutputView; state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const { o, state, menu, onMenu } = props
  const t = useT()
  const selected = o.id === state.selectedId
  // Green dot = students can see this screen now.
  const live = o.kind === 'window' || state.projecting
  const menuId: ConsoleMenu = `screen:${o.id}`
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()
  const tip = [screenLabel(t, o), o.deck?.name, live ? '' : t.notProjecting].filter(Boolean).join(' · ')
  return (
    <div
      onClick={() => window.presenter.select(o.id)}
      title={tip}
      className={`relative flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-lg border-2 pr-1 pl-2.5 ${selected ? 'border-accent bg-accent/10' : 'border-line bg-panel-2'}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-link' : 'bg-muted'}`} />
      <span className="ml-1 text-sm font-semibold whitespace-nowrap">{screenLabel(t, o)}</span>
      <span className="min-w-12 px-1 text-center text-sm text-muted tabular-nums">
        <PageShort o={o} />
      </span>
      <label onClick={stop} title={t.linkedTitle} className={`flex cursor-pointer items-center gap-1 px-1 text-sm ${o.linked ? 'text-link' : 'text-muted'}`}>
        <input type="checkbox" checked={o.linked} onChange={(e) => window.presenter.setLinked(o.id, e.target.checked)} className="h-4 w-4 accent-link" />
        {t.linked}
      </label>
      <button type="button" title={t.pageBackTitle} onClick={(e) => { stop(e); window.presenter.nudge(o.id, -1) }} className={SMALL_BTN}>
        −
      </button>
      <button type="button" title={t.pageNextTitle} onClick={(e) => { stop(e); window.presenter.nudge(o.id, 1) }} className={SMALL_BTN}>
        +
      </button>
      {o.kind === 'window' && (
        <span className="relative" onClick={stop}>
          <button type="button" title={t.screenMoreTitle} onClick={() => onMenu(menu === menuId ? null : menuId)} className={`${SMALL_BTN} ${menu === menuId ? 'bg-line' : ''}`}>
            ⋯
          </button>
          {menu === menuId && (
            <Menu up width="w-80" onClose={() => onMenu(null)}>
              <p className="truncate px-3 pt-1 pb-2 text-sm text-muted">{o.deck?.name}</p>
              <div className="px-2 pb-1">
                <ZoomControl o={o} />
              </div>
              <MenuItem onClick={() => { onMenu(null); window.presenter.toggleFullscreen(o.id) }}>{o.fullscreen ? t.exitFullScreen : t.fullScreen}</MenuItem>
              <MenuItem onClick={() => { onMenu(null); window.presenter.removeScreen(o.id) }}>{t.closeScreen}</MenuItem>
            </Menu>
          )}
        </span>
      )}
    </div>
  )
}

/** Multi-screen management. The next preview is not listed: it is selected by clicking its pane. */
export function ScreensBar({ state, menu, onMenu }: { state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const t = useT()
  const close = (): void => onMenu(null)
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2">
      <span className="mr-1 cursor-help text-sm text-muted" title={t.screensHint}>
        {t.screens}
      </span>
      {state.outputs
        .filter((o) => o.kind !== 'preview')
        .map((o) => (
          <ScreenChip key={o.id} o={o} state={state} menu={menu} onMenu={onMenu} />
        ))}
      <span className="relative">
        <button
          type="button"
          disabled={!state.mainDeck}
          onClick={() => onMenu(menu === 'add' ? null : 'add')}
          className="h-10 rounded-lg border-2 border-dashed border-line px-3 text-sm whitespace-nowrap text-muted hover:border-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          ＋ {t.addScreen}
        </button>
        {menu === 'add' && (
          <Menu up width="w-80" onClose={close}>
            <MenuItem onClick={() => { close(); window.presenter.addScreen(true) }}>{t.sameDeckWindow}</MenuItem>
            <MenuItem onClick={() => { close(); window.presenter.addScreen(false) }}>{t.otherDeckWindow}</MenuItem>
          </Menu>
        )}
      </span>
    </footer>
  )
}
