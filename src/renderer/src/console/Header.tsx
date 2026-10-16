import type { ReactNode } from 'react'
import type { AppState, UiTheme } from '../../../shared/types'
import { useDarkLook } from './hooks'
import { useT } from './i18n'
import { RollerPanel } from './RollerPanel'
import { Btn, IconLabel, Menu, MenuItem, UiIcon, useFlipped, type ConsoleMenu } from './ui'

function ProjectStatus({ state }: { state: AppState }) {
  const t = useT()
  const text = state.projecting ? (state.hasExternalDisplay ? t.projectingExternal : t.projectingWindow) : state.hasExternalDisplay ? t.externalFound : t.noExternal
  return (
    <span className={`ml-auto flex min-w-0 items-center gap-2 text-sm ${state.projecting ? 'text-link' : 'text-muted'}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.projecting ? 'animate-pulse bg-link' : 'bg-muted'}`} />
      <span className="truncate">{text}</span>
    </span>
  )
}

const SUN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
const MOON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
)

/** Light or dark look: two segments, the current one filled. Without a choice it follows the computer. */
function ThemeSwitch({ theme }: { theme: AppState['theme'] }) {
  const t = useT()
  const dark = useDarkLook(theme)
  const segment = (value: UiTheme, icon: ReactNode, label: string) => {
    const on = dark === (value === 'dark')
    return (
      <button type="button" aria-label={label} aria-pressed={on} title={label} onClick={() => window.presenter.setTheme(value)} className={`grid h-7 w-8 place-items-center rounded-full ${on ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
        {icon}
      </button>
    )
  }
  return (
    <span className="flex shrink-0 rounded-full bg-panel-2 p-0.5" title={t.themeTitle}>
      {segment('light', SUN, t.themeLight)}
      {segment('dark', MOON, t.themeDark)}
    </span>
  )
}

/** Swaps the left and the right side of the console (and the floating toolbar). */
function FlipSwitch({ flipped }: { flipped: boolean }) {
  const t = useT()
  return (
    <button
      type="button"
      aria-label={t.flipLabel}
      aria-pressed={flipped}
      title={t.flipTitle}
      onClick={() => window.presenter.setFlipped(!flipped)}
      className={`grid h-8 w-9 shrink-0 place-items-center rounded-full ${flipped ? 'bg-accent text-white' : 'bg-panel-2 text-ink hover:bg-line'}`}
    >
      <UiIcon name="swap" size={17} />
    </button>
  )
}

/** Version, the check for a newer version and the GitHub links. A small label; the pop-up opens only when it is clicked. */
function About({ state, menu, onMenu }: { state: AppState; menu: ConsoleMenu; onMenu: (m: ConsoleMenu) => void }) {
  const t = useT()
  const u = state.update
  const open = menu === 'about'
  const line =
    u.status === 'checking' ? t.aboutChecking : u.status === 'error' ? t.aboutError(u.error ?? '') : u.status === 'ok' && u.latest ? (u.newer ? t.aboutNewer(u.latest) : t.aboutUpToDate(state.version)) : t.aboutIdle
  return (
    <span className="relative">
      <button
        type="button"
        title={u.newer && u.latest ? t.aboutNewer(u.latest) : t.aboutTitle}
        onClick={() => onMenu(open ? null : 'about')}
        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-sm tabular-nums hover:bg-line ${open ? 'bg-line text-ink' : 'text-muted'}`}
      >
        v{state.version}
        {u.newer && <span className="h-2 w-2 rounded-full bg-accent" aria-label={t.aboutNewer(u.latest ?? '')} />}
      </button>
      {open && (
        <Menu width="w-[23rem]" onClose={() => onMenu(null)}>
          <div className="flex flex-col gap-3 p-3 text-sm">
            <div>
              <p className="text-base font-semibold">{t.aboutVersion(state.version)}</p>
              <p className={u.newer ? 'font-semibold text-link' : u.status === 'error' ? 'text-alarm' : 'text-muted'} role="status">
                {line}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => window.presenter.checkUpdate()} disabled={u.status === 'checking'}>
                {t.aboutCheck}
              </Btn>
              {u.newer && (
                <Btn tone="primary" onClick={() => window.presenter.openLink('download')}>
                  {t.aboutDownload(u.downloadMb)}
                </Btn>
              )}
              {u.newer && <Btn onClick={() => window.presenter.openLink('latest')}>{t.aboutWhatsNew}</Btn>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(
                [
                  ['github', t.aboutGithub],
                  ['releases', t.aboutReleases],
                  ['issues', t.aboutIssues]
                ] as const
              ).map(([kind, label]) => (
                <button key={kind} type="button" onClick={() => window.presenter.openLink(kind)} className="text-tint hover:underline">
                  {label} ↗
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={u.auto} onChange={(e) => window.presenter.setAutoUpdate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-link" />
              <span>{t.aboutAuto}</span>
            </label>
            <p className="text-muted">{t.aboutPrivacy}</p>
          </div>
        </Menu>
      )}
    </span>
  )
}

/** Something to show: the screen on air has a deck, or is a window screen. */
function canProject(state: AppState): boolean {
  const onAir = state.outputs.find((o) => o.id === state.onAirId)
  return !!onAir && (onAir.deck !== null || onAir.kind === 'capture')
}

/** menu = the console menu that is open; native deck views hide while one is open. */
export function Header(props: {
  state: AppState
  /** A slide number being typed (Enter jumps there). */
  jump: string
  menu: ConsoleMenu
  onMenu: (m: ConsoleMenu) => void
  onGuide: () => void
}) {
  const { state, jump, menu, onMenu, onGuide } = props
  const t = useT()
  const flipped = useFlipped()
  const close = (): void => onMenu(null)
  return (
    <header className={`flex items-center gap-3 border-b border-line/70 bg-panel px-4 py-2.5 ${flipped ? 'flex-row-reverse' : ''}`}>
      <span className="text-[17px] font-semibold tracking-tight">Presenter</span>
      <About state={state} menu={menu} onMenu={onMenu} />
      <span className="max-w-[22rem] truncate text-sm" title={state.mainDeck?.path}>
        {state.mainDeck?.name ?? t.noDeck}
      </span>
      {jump && (
        <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white tabular-nums" role="status">
          {t.jumpTo(jump)}
        </span>
      )}
      <Btn tone={state.mainDeck ? 'default' : 'primary'} onClick={() => window.presenter.openDialog()}>
        {t.openDeck}
      </Btn>
      <span className="relative">
        <Btn onClick={() => onMenu(menu === 'recent' ? null : 'recent')} disabled={state.recent.length === 0}>
          {t.recent}
        </Btn>
        {menu === 'recent' && (
          <Menu onClose={close}>
            {state.recent.map((d) => (
              <MenuItem key={d.path} title={d.path} onClick={() => { close(); window.presenter.openPath(d.path) }}>
                {d.name}
              </MenuItem>
            ))}
          </Menu>
        )}
      </span>
      <span className="relative">
        <Btn tone={menu === 'participants' ? 'primary' : 'default'} title={t.rollerButtonTitle} onClick={() => onMenu(menu === 'participants' ? null : 'participants')}>
          <IconLabel icon="users">{t.participants}</IconLabel>
        </Btn>
        {menu === 'participants' && (
          <Menu width="w-[26rem]" onClose={close}>
            <div className="max-h-[70vh] overflow-y-auto p-1.5">
              <RollerPanel state={state} />
            </div>
          </Menu>
        )}
      </span>
      <Btn title={t.guideButtonTitle} onClick={onGuide}>
        <IconLabel icon="book">{t.guideButton}</IconLabel>
      </Btn>
      <ThemeSwitch theme={state.theme} />
      <FlipSwitch flipped={state.flipped} />
      <ProjectStatus state={state} />
      {(state.projecting || state.projectors.length > 0) && (
        <Btn tone={state.blank ? 'primary' : 'default'} title={t.blankTitle} onClick={() => window.presenter.setBlank(state.blank ? null : 'black')}>
          <IconLabel icon={state.blank ? 'play' : 'blank'} size={15}>
            {state.blank ? t.blankOff : t.blankOn}
          </IconLabel>
        </Btn>
      )}
      {state.projecting ? (
        <Btn title={t.stopProjectingTitle} onClick={() => window.presenter.stopProjecting()}>
          {t.stopProjecting}
        </Btn>
      ) : (
        <Btn tone="primary" title={t.startProjectingTitle} disabled={!canProject(state)} onClick={() => window.presenter.startProjecting()}>
          {t.startProjecting}
        </Btn>
      )}
    </header>
  )
}
