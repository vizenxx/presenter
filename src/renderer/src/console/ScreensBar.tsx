import type { AppState, OutputView, ReplaceSpec } from '../../../shared/types'
import { screenLabel, useT } from './i18n'
import { Menu, MenuItem, UiIcon, ZoomControl, useFlipped, type ConsoleMenu } from './ui'

const SMALL_BTN = 'grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-sm hover:bg-line'

/** Projector numbers in use: 1 always, then the extra ones. */
function projectorNumbers(state: AppState): number[] {
  return [1, ...state.projectors.map((p) => p.number)]
}

function nextProjectorNumber(state: AppState): number {
  let n = 2
  while (state.projectors.some((p) => p.number === n)) n++
  return n
}

/**
 * Where the audience sees this content: Projector 1, another projector, or nowhere. A projector
 * shows one content at a time; the content it showed before waits and keeps its page.
 */
function ProjectorPicker(props: { o: OutputView; state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const { o, state, menu, onMenu } = props
  const t = useT()
  const menuId: ConsoleMenu = `show:${o.id}`
  const on = o.shownOn
  const canShow = o.deck !== null || o.kind === 'capture'
  // Participants see Projector 1 only while projecting; other projectors are always shown.
  const live = on !== null && (on > 1 || state.projecting)
  const occupant = (n: number): string => {
    const id = n === 1 ? state.onAirId : (state.projectors.find((p) => p.number === n)?.contentId ?? null)
    const shown = id && id !== o.id ? state.outputs.find((x) => x.id === id) : undefined
    return shown ? t.nowShowing(screenLabel(t, shown)) : ''
  }
  const pick = (target: number | 'new' | null): void => {
    onMenu(null)
    window.presenter.showOn(o.id, target)
  }
  const extra = on !== null && on > 1 ? state.projectors.find((p) => p.number === on) : undefined
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={t.showOnTitle}
        disabled={!canShow}
        onClick={() => onMenu(menu === menuId ? null : menuId)}
        className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm whitespace-nowrap hover:bg-line disabled:opacity-40 ${on !== null ? 'text-link' : 'text-muted'} ${menu === menuId ? 'bg-line' : ''}`}
      >
        {on !== null && <span className={`h-2 w-2 rounded-full ${live ? 'bg-link' : 'bg-muted'}`} />}
        {on !== null ? t.projectorN(on) : t.notShown} ▾
      </button>
      {menu === menuId && (
        <Menu up width="w-96" onClose={() => onMenu(null)}>
          {projectorNumbers(state).map((n) => (
            <MenuItem key={n} onClick={() => pick(n)}>
              {on === n ? '✓ ' : ''}
              {t.projectorN(n)}
              <span className="text-muted group-hover:text-white/75">{occupant(n)}</span>
            </MenuItem>
          ))}
          <MenuItem onClick={() => pick('new')}>＋ {t.newProjector(nextProjectorNumber(state))}</MenuItem>
          <MenuItem onClick={() => pick(null)}>
            {on === null ? '✓ ' : ''}
            {t.notShownItem}
          </MenuItem>
          {extra && (
            <>
              <div className="my-1 h-px bg-line" />
              <MenuItem onClick={() => { onMenu(null); window.presenter.projectorFullscreen(extra.number) }}>{t.projectorFullScreen(extra.number, extra.fullscreen)}</MenuItem>
              <MenuItem onClick={() => { onMenu(null); window.presenter.closeProjector(extra.number) }}>{t.closeProjector(extra.number)}</MenuItem>
            </>
          )}
        </Menu>
      )}
    </span>
  )
}

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

/** One content, kept small: name, page, where it is shown, Linked, one-page moves; the rest sits in its ⋯ menu. */
function ScreenChip(props: { o: OutputView; state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void; onReplaceWindow: (id: string) => void }) {
  const { o, state, menu, onMenu, onReplaceWindow } = props
  const t = useT()
  const selected = o.id === state.selectedId
  const capture = o.kind === 'capture'
  const menuId: ConsoleMenu = `screen:${o.id}`
  const nameId: ConsoleMenu = `name:${o.id}`
  const replace = (spec: ReplaceSpec): void => {
    onMenu(null)
    window.presenter.replaceScreen(o.id, spec)
  }
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()
  const tip = capture ? t.windowCardTitle : [screenLabel(t, o), o.deck?.name, o.shownOn === 1 && !state.projecting ? t.notProjecting : ''].filter(Boolean).join(' · ')
  return (
    <div
      onClick={() => window.presenter.select(o.id)}
      title={tip}
      className={`relative flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-full pr-1.5 pl-3.5 ${selected ? 'bg-accent/15 ring-2 ring-accent' : 'bg-panel-2'}`}
    >
      {/* The name opens a list: another deck (a file, or one from Recent), a program window, a whiteboard. */}
      <span className="relative" onClick={stop}>
        <button
          type="button"
          title={t.screenNameTitle}
          onClick={() => {
            window.presenter.select(o.id)
            onMenu(menu === nameId ? null : nameId)
          }}
          className={`flex h-7 items-center gap-1.5 rounded-full px-1.5 text-sm font-semibold whitespace-nowrap hover:bg-line ${menu === nameId ? 'bg-line' : ''}`}
        >
          {capture && <UiIcon name="window" size={15} />}
          <span className="max-w-44 truncate">{screenLabel(t, o)}</span>
          <span className="text-muted">▾</span>
        </button>
        {menu === nameId && (
          <Menu up width="w-96" onClose={() => onMenu(null)}>
            <p className="px-3 pt-1 pb-1 text-sm text-muted">{t.screenNameHeading}</p>
            <MenuItem onClick={() => replace({ kind: 'dialog' })}>{t.screenOpenDeck}</MenuItem>
            <MenuItem
              onClick={() => {
                onMenu(null)
                onReplaceWindow(o.id)
              }}
            >
              {t.screenOpenWindow}
            </MenuItem>
            <MenuItem onClick={() => replace({ kind: 'whiteboard' })}>{t.screenOpenBoard}</MenuItem>
            {state.recent.length > 0 && (
              <>
                <div className="my-1 h-px bg-line" />
                <p className="px-3 pt-1 pb-1 text-sm text-muted">{t.recent}</p>
                {state.recent.slice(0, 8).map((d) => (
                  <MenuItem key={d.path} title={d.path} onClick={() => replace({ kind: 'deck', path: d.path })}>
                    {d.name}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        )}
      </span>
      {!capture && (
        <span className="min-w-12 px-1 text-center text-sm text-muted tabular-nums">
          <PageShort o={o} />
        </span>
      )}
      <ProjectorPicker o={o} state={state} menu={menu} onMenu={onMenu} />
      {!capture && <label onClick={stop} title={t.linkedTitle} className={`flex cursor-pointer items-center gap-1 px-1 text-sm ${o.linked ? 'text-link' : 'text-muted'}`}>
        <input type="checkbox" checked={o.linked} onChange={(e) => window.presenter.setLinked(o.id, e.target.checked)} className="h-4 w-4 accent-link" />
        {t.linked}
      </label>}
      {!capture && <button type="button" title={t.pageBackTitle} onClick={(e) => { stop(e); window.presenter.nudge(o.id, -1) }} className={SMALL_BTN}>
        −
      </button>}
      {!capture && <button type="button" title={t.pageNextTitle} onClick={(e) => { stop(e); window.presenter.nudge(o.id, 1) }} className={SMALL_BTN}>
        +
      </button>}
      {capture && (
        <button type="button" title={t.raiseWindowTitle} aria-label={t.raiseWindowTitle} onClick={(e) => { stop(e); window.presenter.raiseWindow(o.id) }} className={SMALL_BTN}>
          <UiIcon name="raise" size={15} />
        </button>
      )}
      {capture && (
        <button type="button" title={t.removeWindowScreen} onClick={(e) => { stop(e); window.presenter.removeScreen(o.id) }} className={`${SMALL_BTN} text-muted`}>
          ✕
        </button>
      )}
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
              <MenuItem onClick={() => { onMenu(null); window.presenter.removeScreen(o.id) }}>{t.closeScreen}</MenuItem>
            </Menu>
          )}
        </span>
      )}
    </div>
  )
}

/** Multi-screen management. The next preview is not listed: it is selected by clicking its pane. */
export function ScreensBar({ state, menu, onMenu, onPickWindow, onReplaceWindow }: { state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void; onPickWindow: () => void; onReplaceWindow: (id: string) => void }) {
  const t = useT()
  const flipped = useFlipped()
  const close = (): void => onMenu(null)
  return (
    <footer className={`flex flex-wrap items-center gap-2 border-t border-line/70 bg-panel px-3 py-2 ${flipped ? 'flex-row-reverse' : ''}`}>
      <span className="mr-1 cursor-help text-sm text-muted" title={t.screensHint}>
        {t.screens}
      </span>
      {state.outputs
        // Screen 1 gets a card once a deck is open; before that a program window can be the first content.
        .filter((o) => o.kind !== 'preview' && !(o.kind === 'projector' && !o.deck))
        .map((o) => (
          <ScreenChip key={o.id} o={o} state={state} menu={menu} onMenu={onMenu} onReplaceWindow={onReplaceWindow} />
        ))}
      <span className="relative">
        <button
          type="button"
          onClick={() => onMenu(menu === 'add' ? null : 'add')}
          className="h-10 rounded-full border-2 border-dashed border-line px-4 text-sm whitespace-nowrap text-tint hover:border-tint disabled:cursor-not-allowed disabled:opacity-40"
        >
          ＋ {t.addScreen}
        </button>
        {menu === 'add' && (
          <Menu up width="w-80" onClose={close}>
            {state.mainDeck && <MenuItem onClick={() => { close(); window.presenter.addScreen(true) }}>{t.sameDeckWindow}</MenuItem>}
            <MenuItem onClick={() => { close(); window.presenter.addScreen(false) }}>{t.otherDeckWindow}</MenuItem>
            <MenuItem onClick={() => { close(); onPickWindow() }}>{t.windowScreen}</MenuItem>
            <MenuItem onClick={() => { close(); window.presenter.addWhiteboard(false) }}>{t.whiteboardScreen}</MenuItem>
            {state.recent.length > 0 && (
              <>
                <div className="my-1 h-px bg-line" />
                <p className="px-3 pt-1 pb-1 text-sm text-muted">{t.recent}</p>
                {state.recent.slice(0, 8).map((d) => (
                  <MenuItem key={d.path} title={d.path} onClick={() => { close(); window.presenter.addScreen(false, d.path) }}>
                    {d.name}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        )}
      </span>
    </footer>
  )
}
