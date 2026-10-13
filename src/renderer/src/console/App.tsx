import { useCallback, useState } from 'react'
import { CurrentPane } from './CurrentPane'
import { GuideDialog } from './GuideDialog'
import { Header } from './Header'
import { useAppState, useConsoleKeys, useFileDrop, useMirror } from './hooks'
import { NextPane } from './NextPane'
import { ScreensBar } from './ScreensBar'
import { SlidePanel, type BarKind } from './SlideBar'
import { SpeakerTimer } from './SpeakerTimer'
import { TimerPanel } from './TimerPanel'
import { WindowPicker } from './WindowPicker'
import { useT } from './i18n'
import { DeckStatusBar, FlipContext, type ConsoleMenu } from './ui'

export function App() {
  const t = useT()
  const state = useAppState()
  const mirror = useMirror()
  const [menu, setMenu] = useState<ConsoleMenu>(null)
  // The slide bar (from the left): the slide list or the notes.
  const [bar, setBar] = useState<BarKind | null>(null)
  const [guide, setGuide] = useState(false)
  const closeGuide = useCallback(() => setGuide(false), [])
  // 'wait' = the window becomes a waiting content (＋ Add screen); 'show' = the start screen's first content, on Projector 1.
  const [picker, setPicker] = useState<'wait' | 'show' | `replace:${string}` | null>(null)
  const closePicker = useCallback(() => setPicker(null), [])
  const jump = useConsoleKeys(state?.timer.alarming ?? false, state?.ink.tool ?? 'pointer', !!state?.blank, !!state && (state.projecting || state.projectors.length > 0), !!state?.zoomed)
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
  // Turned left to right: the slide panel is at the right edge, the right column on the left, the timers swapped.
  const flipped = state.flipped
  const panelOpen = !!bar && !!state.mainDeck
  const columns = panelOpen
    ? flipped
      ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_18rem]'
      : 'grid-cols-[18rem_minmax(0,1.35fr)_minmax(0,1fr)]'
    : flipped
      ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]'
      : 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'
  const panel = bar && state.mainDeck ? <SlidePanel state={state} open={bar} onClose={() => setBar(null)} /> : null
  const current = nothingOnProjector ? (
    <section className="grid min-h-0 place-items-center rounded-card border-2 border-dashed border-line bg-panel p-6 text-center text-base text-muted">{t.projector1Empty}</section>
  ) : (
    <CurrentPane state={state} projector={projector} mirror={mirror} suspended={suspended} bar={bar} onBar={setBar} onGuide={() => setGuide(true)} onPickWindow={() => setPicker('show')} />
  )
  const side = (
    <div className="flex min-h-0 flex-col gap-3">
      {state.mainDeck ? <NextPane state={state} next={next} suspended={suspended} /> : <div className="flex-1" />}
      {/* Not about one slide: the two timers, side by side. */}
      <div className="grid shrink-0 grid-cols-2 gap-3">
        {flipped ? (
          <>
            <SpeakerTimer state={state} menu={menu} onMenu={setMenu} />
            <TimerPanel state={state} menu={menu} onMenu={setMenu} />
          </>
        ) : (
          <>
            <TimerPanel state={state} menu={menu} onMenu={setMenu} />
            <SpeakerTimer state={state} menu={menu} onMenu={setMenu} />
          </>
        )}
      </div>
    </div>
  )
  return (
    <FlipContext.Provider value={flipped}>
    <div
      className="flex h-full flex-col"
      onPointerDownCapture={() => {
        if (state.timer.alarming) window.presenter.timerDismiss()
      }}
    >
      <Header state={state} jump={jump} menu={menu} onMenu={setMenu} onGuide={() => setGuide(true)} />
      <DeckStatusBar status={state.deckStatus} />
      <main className={`grid min-h-0 flex-1 gap-3 p-3 ${columns}`}>
        {flipped ? (
          <>
            {side}
            {current}
            {panel}
          </>
        ) : (
          <>
            {panel}
            {current}
            {side}
          </>
        )}
      </main>
      <ScreensBar state={state} menu={menu} onMenu={setMenu} onPickWindow={() => setPicker('wait')} onReplaceWindow={(id) => setPicker(`replace:${id}`)} />
      {guide && <GuideDialog onClose={closeGuide} />}
      {picker && <WindowPicker show={picker === 'show'} replaceId={picker.startsWith('replace:') ? picker.slice('replace:'.length) : null} onClose={closePicker} />}
    </div>
    </FlipContext.Provider>
  )
}
