import type { AppState } from '../../../shared/types'
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
    <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
      <span className="text-base font-bold tracking-wide text-accent">Presenter</span>
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
      <ProjectStatus state={state} />
      <Btn title={t.langButtonTitle} onClick={() => window.presenter.setLanguage(state.language === 'en' ? 'zh' : 'en')}>
        🌐 {t.langButton}
      </Btn>
      {state.projecting ? (
        <Btn title={t.stopProjectingTitle} onClick={() => window.presenter.stopProjecting()}>
          {t.stopProjecting}
        </Btn>
      ) : (
        <Btn tone="primary" title={t.startProjectingTitle} disabled={!state.mainDeck} onClick={() => window.presenter.startProjecting()}>
          {t.startProjecting}
        </Btn>
      )}
    </header>
  )
}
