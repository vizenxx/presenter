import { useCallback, useState } from 'react'
import { CurrentPane } from './CurrentPane'
import { Drawer, type DrawerTab } from './Drawer'
import { GuideDialog } from './GuideDialog'
import { Header } from './Header'
import { useAppState, useConsoleKeys, useFileDrop, useMirror } from './hooks'
import { NextPane } from './NextPane'
import { ScreensBar } from './ScreensBar'
import { TimerPanel } from './TimerPanel'
import { useT } from './i18n'
import { DeckStatusBar, type ConsoleMenu } from './ui'

export function App() {
  const t = useT()
  const state = useAppState()
  const mirror = useMirror()
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const [menu, setMenu] = useState<ConsoleMenu>(null)
  const [guide, setGuide] = useState(false)
  const closeGuide = useCallback(() => setGuide(false), [])
  useConsoleKeys(state?.timer.alarming ?? false, state?.ink.tool ?? 'pointer')
  useFileDrop()
  if (!state) return <div className="grid h-full place-items-center text-base text-muted">{t.starting}</div>
  const projector = state.outputs.find((o) => o.id === 'projector')
  const next = state.outputs.find((o) => o.id === 'next')
  if (!projector || !next) return null
  // Native deck views draw above the page, so they step aside while a menu or the guide is open.
  const suspended = menu !== null || guide
  const cols = drawer ? 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_20rem]' : 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'
  return (
    <div
      className="flex h-full flex-col"
      onPointerDownCapture={() => {
        if (state.timer.alarming) window.presenter.timerDismiss()
      }}
    >
      <Header state={state} menu={menu} onMenu={setMenu} rollerOpen={drawer === 'roller'} onRoller={() => setDrawer(drawer === 'roller' ? null : 'roller')} onGuide={() => setGuide(true)} />
      <DeckStatusBar status={state.deckStatus} />
      <main className={`grid min-h-0 flex-1 gap-3 p-3 ${cols}`}>
        <CurrentPane state={state} projector={projector} mirror={mirror} suspended={suspended} drawer={drawer} onDrawer={setDrawer} onGuide={() => setGuide(true)} />
        <div className="flex min-h-0 flex-col gap-3">
          {state.mainDeck ? <NextPane state={state} next={next} suspended={suspended} /> : <div className="flex-1" />}
          <TimerPanel state={state} />
        </div>
        {drawer && <Drawer state={state} tab={drawer} onTab={setDrawer} />}
      </main>
      <ScreensBar state={state} menu={menu} onMenu={setMenu} />
      {guide && <GuideDialog onClose={closeGuide} />}
    </div>
  )
}
