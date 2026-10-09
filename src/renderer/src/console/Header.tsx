import type { ReactNode } from 'react'
import type { AppState, UiTheme } from '../../../shared/types'
import { useDarkLook } from './hooks'
import { useT } from './i18n'
import { Btn, Menu, MenuItem, type ConsoleMenu } from './ui'

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

/** Something to show: the screen on air has a deck, or is a window screen. */
function canProject(state: AppState): boolean {
  const onAir = state.outputs.find((o) => o.id === state.onAirId)
  return !!onAir && (onAir.deck !== null || onAir.kind === 'capture')
}

/** menu = the console menu that is open; native deck views hide while one is open. */
export function Header(props: {
  state: AppState
  menu: ConsoleMenu
  onMenu: (m: ConsoleMenu) => void
  rollerOpen: boolean
  onRoller: () => void
  onGuide: () => void
}) {
  const { state, menu, onMenu, rollerOpen, onRoller, onGuide } = props
  const t = useT()
  const close = (): void => onMenu(null)
  return (
    <header className="flex items-center gap-3 border-b border-line/70 bg-panel px-4 py-2.5">
      <span className="text-[17px] font-semibold tracking-tight">Presenter</span>
      <span className="max-w-[22rem] truncate text-sm" title={state.mainDeck?.path}>
        {state.mainDeck?.name ?? t.noDeck}
      </span>
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
      <Btn tone={rollerOpen ? 'primary' : 'default'} title={t.rollerButtonTitle} onClick={onRoller}>
        {t.rollerButton}
      </Btn>
      <Btn title={t.guideButtonTitle} onClick={onGuide}>
        {t.guideButton}
      </Btn>
      <ThemeSwitch theme={state.theme} />
      <ProjectStatus state={state} />
      {(state.projecting || state.projectors.length > 0) && (
        <Btn tone={state.blank ? 'primary' : 'default'} title={t.blankTitle} onClick={() => window.presenter.setBlank(state.blank ? null : 'black')}>
          {state.blank ? t.blankOff : t.blankOn}
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
