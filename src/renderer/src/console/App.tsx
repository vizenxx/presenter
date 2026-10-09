import { useCallback, useState } from 'react'
import { CurrentPane } from './CurrentPane'
import { Drawer, type DrawerTab } from './Drawer'
import { GuideDialog } from './GuideDialog'
import { Header } from './Header'
import { useAppState, useConsoleKeys, useFileDrop, useMirror } from './hooks'
import { NextPane } from './NextPane'
import { ScreensBar } from './ScreensBar'
import { SpeakerTimer } from './SpeakerTimer'
import { TimerPanel } from './TimerPanel'
import { WindowPicker } from './WindowPicker'
import { TimerTools } from './TimerTools'
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
  // 'wait' = the window becomes a waiting content (＋ Add screen); 'show' = the start screen's first content, on Projector 1.
  const [picker, setPicker] = useState<'wait' | 'show' | null>(null)
  const closePicker = useCallback(() => setPicker(null), [])
  useConsoleKeys(state?.timer.alarming ?? false, state?.ink.tool ?? 'pointer')
  useFileDrop()
  if (!state) return <div className="grid h-full place-items-center text-base text-muted">{t.starting}</div>
  // The current pane shows what is on Projector 1 (it can be another content than the main deck).
  const onAir = state.outputs.find((o) => o.id === state.onAirId)
  const projector = onAir ?? state.outputs.find((o) => o.id === 'projector')
  const next = state.outputs.find((o) => o.id === 'next')
  if (!projector || !next) return null
  const nothingOnProjector = !onAir && state.mainDeck !== null
  // Native deck views draw above the page, so they step aside while a menu or the guide is open.
  const suspended = menu !== null || guide || picker !== null
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
        {nothingOnProjector ? (
          <section className="grid min-h-0 place-items-center rounded-card border-2 border-dashed border-line bg-panel p-6 text-center text-base text-muted">{t.projector1Empty}</section>
        ) : (
          <CurrentPane state={state} projector={projector} mirror={mirror} suspended={suspended} drawer={drawer} onDrawer={setDrawer} onGuide={() => setGuide(true)} onPickWindow={() => setPicker('show')} />
        )}
        <div className="flex min-h-0 flex-col gap-3">
          {state.mainDeck ? <NextPane state={state} next={next} suspended={suspended} /> : <div className="flex-1" />}
          <TimerPanel state={state} />
          <SpeakerTimer speaker={state.speaker} />
          <TimerTools state={state} />
        </div>
        {drawer && <Drawer state={state} tab={drawer} onTab={setDrawer} />}
      </main>
      <ScreensBar state={state} menu={menu} onMenu={setMenu} onPickWindow={() => setPicker('wait')} />
      {guide && <GuideDialog onClose={closeGuide} />}
      {picker && <WindowPicker show={picker === 'show'} onClose={closePicker} />}
    </div>
  )
}
