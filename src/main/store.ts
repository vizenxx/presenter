import { app, desktopCapturer, dialog, screen, session, systemPreferences, type BrowserWindow, type WebContents, type WebContentsView } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { commandKey, intentToAction, keyIntent, type CommandKey } from '../shared/keys'
import { planMove, type NavOutput } from '../shared/nav'
import { DECK_EXTENSIONS, deckKind, deckTitle } from '../shared/deckKinds'
import { INK_COLORS, INK_TOOLS, InkScene, type InkOp, type InkSettings, type InkStroke, type InkTool } from '../shared/ink'
import { MAIN_STRINGS } from '../shared/lang'
import { mergeRecent } from '../shared/recentList'
import * as T from '../shared/timer'
import { stepZoom, zoomKey, type ZoomDirection } from '../shared/zoom'
import type { AppState, DeckRef, DeckStatus, KeyIntent, NavAction, OutputId, OutputKind, PreviewRect, RollerPlay, TimerView, WindowSource } from '../shared/types'
import type { GuideFile } from '../shared/guide'
import { ConsoleWindow } from './consoleWindow'
import { saveGuideFile } from './guide'
import { DeckError, prepareDeck, type PreparedDeck } from './convert'
import { projectorDisplay } from './displays'
import { Output, type DeckStateMsg, type OutputEvent } from './output'
import { IS_MAC } from './platform'
import { ProjectorWindow, WINDOWED } from './projectorWindow'
import { loadRecent, saveRecent } from './recent'
import { RollerController } from './roller'
import { RollerOverlay } from './rollerOverlay'
import { ScreenWindow } from './screenWindow'
import { startupLog } from './startupLog'
import { WindowsHelper, windowHandle } from './windowsHelper'
import { rememberZoom, zoomFor } from './zoomMemory'

export interface StorePaths {
  deckPreload: string
  consolePreload: string
  overlayPreload: string
  rollerPreload: string
  loadConsole: (win: BrowserWindow) => void
  loadOverlay: (view: WebContentsView) => void
  loadRoller: (view: WebContentsView) => void
  loadCapture: (view: WebContentsView) => void
}

const TICK_MS = 200
const MIRROR_MS = 250
/** Ignore deck-side "not done" reports this soon after the alarm starts (they are stale echoes). */
const ALARM_GUARD_MS = 1500
/** Ignore deck timer reports this soon after our own timer command. */
const DECK_TIMER_GUARD_MS = 1000

/** Single source of truth. Windows render its state and send intents back. */
export class Store {
  private readonly outputs = new Map<OutputId, Output>()
  private readonly screens = new Map<OutputId, ScreenWindow>()
  private selectedId: OutputId = 'projector'
  /** The screen the next preview follows: the last selected real screen. */
  private previewOfId: OutputId = 'projector'
  /** The screen on the projector (before projecting: in the console's current pane). */
  private onAirId: OutputId = 'projector'
  /** Windows: lists program windows the Alt+Tab way and brings them forward. */
  private readonly windows = new WindowsHelper()
  private readonly iconCache = new Map<string, string>()
  private mainDeck: DeckRef | null = null
  private mainPrepared: PreparedDeck | null = null
  private deckStatus: DeckStatus = { state: 'ready' }
  private inkSettings: InkSettings = { tool: 'pointer', color: INK_COLORS[0] }
  private readonly inkScene = new InkScene()
  /** Projector page the marks belong to; marks clear when it changes. */
  private inkPage = -1
  /** The console shows a live video of the projector; JPEG snapshots are only a fallback. */
  private mirrorVideo = false
  /** Only the latest open request may load its result (conversions can finish out of order). */
  private openSeq = 0
  private timer = T.initialTimer(60)
  private alarmSince = 0
  private lastTimerCmd = 0
  private lastTimerKey = ''
  private recent: DeckRef[] = []
  private previewRect: PreviewRect | null = null
  private currentRect: PreviewRect | null = null
  private projecting = false
  private screenSeq = 2
  private emitQueued = false
  private mirrorBusy = false
  private quitting = false
  private projectorWin!: ProjectorWindow
  private consoleWin!: ConsoleWindow
  private roller!: RollerController
  private projectorRoller!: RollerOverlay
  private readonly screenRollers = new Map<OutputId, RollerOverlay>()

  constructor(private readonly paths: StorePaths) {}

  start(): void {
    this.recent = loadRecent()
    const projector = this.createOutput('projector', 1, 'projector', 0)
    // The next preview is not a screen: it shows the slide after the selected screen's slide.
    const next = this.createOutput('next', 0, 'preview', 1)
    this.consoleWin = new ConsoleWindow(this.paths.consolePreload, this.paths.loadConsole, () => this.quit())
    this.roller = new RollerController(() => this.strings())
    this.projectorRoller = this.createRollerOverlay()
    this.projectorWin = new ProjectorWindow(this.paths.overlayPreload, this.paths.loadOverlay, () => this.stopProjecting(), this.projectorRoller.view)
    // Until the teacher starts projecting, the projector deck lives in the console's "current" pane.
    for (const view of [projector.view, next.view]) {
      this.consoleWin.win.contentView.addChildView(view)
      view.setVisible(false)
    }
    this.consoleWin.win.webContents.on('did-finish-load', () => {
      startupLog('console page loaded; state sent')
      this.emitNow()
    })

    const overlay = this.projectorWin.overlay.webContents
    overlay.on('did-finish-load', () => this.syncTimer(true))
    overlay.on('before-input-event', (event, input) => {
      const zoom = zoomKey(input.key, input)
      const command = commandKey(input.key, input)
      const intent = keyIntent(input.key, input)
      if (!zoom && !command && !intent) return
      event.preventDefault()
      if (input.type !== 'keyDown') return
      if (zoom) this.zoom(this.onAirId, zoom)
      else if (command) this.onCommand(command)
      else if (intent) this.onKey(intent, this.onAirId)
    })

    screen.on('display-added', () => this.onDisplaysChanged())
    screen.on('display-removed', () => this.onDisplaysChanged())
    screen.on('display-metrics-changed', () => this.onDisplaysChanged())
    this.applyTitles()
    // Live mirror: the console captures the projector window as video (like screen sharing).
    // macOS allows that only with Screen Recording permission; without it the console keeps
    // the snapshot mirror instead of showing a system prompt in the middle of a lesson.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const fromConsole = request.frame?.url.includes('console.html') ?? false
      const allowed = !IS_MAC || systemPreferences.getMediaAccessStatus('screen') === 'granted'
      if (!fromConsole || !this.projecting || !allowed) {
        callback({})
        return
      }
      callback({ video: { id: this.projectorWin.win.getMediaSourceId(), name: 'Projector' } })
    })
    setInterval(() => this.tick(), TICK_MS)
    setInterval(() => void this.captureMirror(), MIRROR_MS)
  }

  // ---------- decks ----------

  async openDialog(): Promise<void> {
    const deck = await this.pickDeck(this.strings().openDeck)
    if (deck) await this.openMainDeck(deck.path)
  }

  /** Opens a deck on the projector (and screens that follow it). PowerPoint files are converted first. */
  async openMainDeck(filePath: string): Promise<void> {
    if (!deckKind(filePath)) return
    const deck = this.toDeck(filePath)
    const prepared = await this.prepare(deck)
    if (!prepared) return
    this.mainDeck = deck
    this.mainPrepared = prepared
    this.remember(deck)
    this.inkScene.apply({ t: 'clear' })
    this.inkPage = 0
    const zoom = zoomFor(deck.path)
    this.projector().index = 0
    for (const o of this.outputs.values()) {
      if (o.kind === 'preview' || (o.kind === 'window' && !o.followsMain)) continue
      if (o.kind === 'window') o.index = 0
      o.setZoomPercent(zoom)
      o.load(deck, prepared)
    }
    this.setSelected('projector')
    this.followPreview(true)
    // Opening a deck means showing it: it goes back on the projector if another screen was there.
    this.project('projector')
    this.emit()
  }

  private strings(): typeof MAIN_STRINGS {
    return MAIN_STRINGS
  }

  /** Window titles. */
  private applyTitles(): void {
    const s = this.strings()
    this.consoleWin.win.setTitle(s.consoleTitle)
    this.projectorWin.titles = { normal: s.projectorTitle, windowed: s.projectorWindowed }
    this.projectorWin.place()
    for (const [id, w] of this.screens) w.setTitle(s.screenTitle(this.outputs.get(id)?.screenNumber ?? 0))
  }

  saveGuideFile(which: GuideFile): Promise<string | null> {
    return saveGuideFile(this.consoleWin.win, which, this.strings().saveCopy)
  }

  dismissDeckStatus(): void {
    this.deckStatus = { state: 'ready' }
    this.emit()
  }

  /** Converts when needed; shows progress and plain-language errors in the console. Null = not loaded. */
  private async prepare(deck: DeckRef): Promise<PreparedDeck | null> {
    const seq = ++this.openSeq
    if (deckKind(deck.path) === 'slides') {
      this.deckStatus = { state: 'converting', name: deck.name }
      this.emit()
    }
    try {
      const prepared = await prepareDeck(deck.path, { cacheRoot: path.join(app.getPath('userData'), 'converted') })
      if (seq !== this.openSeq) return null
      this.deckStatus = { state: 'ready' }
      return prepared
    } catch (error) {
      if (seq === this.openSeq) {
        this.deckStatus = error instanceof DeckError ? { state: 'error', name: deck.name, code: error.code, detail: error.detail } : { state: 'error', name: deck.name, code: 'open-failed', detail: String(error) }
        this.emit()
      }
      return null
    }
  }

  async addScreen(sameDeck: boolean): Promise<void> {
    const deck = sameDeck ? this.mainDeck : await this.pickDeck(this.strings().pickScreenDeck)
    if (!deck) return
    const prepared = sameDeck ? this.mainPrepared : await this.prepare(deck)
    if (!prepared) return
    if (!sameDeck) this.remember(deck)
    const n = this.screenSeq++
    const id = `screen-${n}`
    const o = this.createOutput(id, n, 'window', sameDeck ? this.projector().index : 0)
    o.followsMain = sameDeck
    o.setZoomPercent(zoomFor(deck.path))
    const roller = this.createRollerOverlay()
    this.screenRollers.set(id, roller)
    this.screens.set(
      id,
      new ScreenWindow(
        o,
        () => this.removeScreen(id),
        (full) => {
          o.fullscreen = full
          this.emit()
        },
        roller.view,
        this.strings().screenTitle(n),
        () => {
          if (this.previewSource() !== o) return
          this.applyPreview()
          this.emit()
        }
      )
    )
    o.load(deck, prepared)
    this.emit()
  }

  removeScreen(id: OutputId): void {
    const o = this.outputs.get(id)
    if (!o || (o.kind !== 'window' && o.kind !== 'capture')) return
    if (this.onAirId === id) {
      if (this.hasContent(this.projector())) this.project('projector')
      else {
        if (this.projecting) this.stopProjecting()
        this.leaveStage(o)
        this.onAirId = 'projector'
      }
    }
    const w = this.screens.get(id)
    this.screens.delete(id)
    this.outputs.delete(id)
    if (this.selectedId === id) this.setSelected('projector')
    if (this.previewOfId === id) this.previewOfId = 'projector'
    this.followPreview()
    this.screenRollers.get(id)?.destroy()
    this.screenRollers.delete(id)
    if (this.roller.showing && this.audienceRollers().length === 0) this.roller.showing = false
    w?.close()
    o.destroy()
    this.emit()
  }

  toggleFullscreen(id: OutputId): void {
    this.screens.get(id)?.toggleFullscreen()
  }

  // ---------- projection ----------

  startProjecting(): void {
    const onAir = this.onAir()
    if (this.projecting || !this.hasContent(onAir)) return
    this.projecting = true
    this.consoleWin.win.contentView.removeChildView(onAir.view)
    this.projectorWin.attach(onAir.view)
    onAir.view.setVisible(true)
    onAir.setBaseZoom(1)
    onAir.escapeStops = true
    this.projectorWin.open()
    this.sendInkSettings()
    this.applyPreview()
    this.syncTimer(true)
    this.emit()
    setTimeout(() => void this.captureMirror(), 300)
  }

  stopProjecting(): void {
    if (!this.projecting) return
    if (this.roller.showing) this.rollerHide()
    this.projecting = false
    const onAir = this.onAir()
    onAir.escapeStops = false
    this.projectorWin.close()
    this.projectorWin.detach(onAir.view)
    this.consoleWin.win.contentView.addChildView(onAir.view)
    this.mirrorVideo = false
    this.sendInkSettings()
    this.applyCurrent()
    this.applyPreview()
    this.syncTimer(true)
    this.emit()
  }

  /**
   * Put another screen on the projector (before projecting: in the current pane). Only this
   * button does it; selecting a screen does not, so the teacher can browse another deck with
   * the next preview while students keep seeing the same screen.
   */
  project(id: OutputId): void {
    const next = this.outputs.get(id)
    if (!next || next.kind === 'preview' || !this.hasContent(next) || next.id === this.onAirId) return
    this.leaveStage(this.onAir())
    this.onAirId = next.id
    this.enterStage(next)
    // Marks belong to what students saw; they clear with the change.
    this.inkScene.apply({ t: 'clear' })
    this.inkPage = next.shownIndex()
    this.sendInkSettings()
    if (this.projecting) this.consoleContents()?.send('ink:op', { t: 'clear' })
    if (this.timer.status === 'idle') this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
    this.emit()
    setTimeout(() => void this.captureMirror(), 300)
  }

  /**
   * The program windows that could become window screens, like the lists in Zoom or Teams:
   * on Windows every Alt+Tab window, minimized ones included (Chromium's own list leaves those
   * out), with a live picture when there is one and the program icon otherwise. Presenter's own
   * windows are left out.
   */
  async listWindows(): Promise<WindowSource[]> {
    const own = new Set([this.consoleWin.win, this.projectorWin.win].map((w) => w.getMediaSourceId()))
    for (const w of this.screens.values()) own.add(w.mediaSourceId())
    const [programs, sources] = await Promise.all([this.windows.list(), desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 200 } })])
    const pictures = new Map(sources.map((s) => [s.id, s]))
    if (programs.length === 0) {
      // A Mac, or Windows could not be asked: Chromium's list (open windows only).
      return sources.filter((s) => !own.has(s.id) && s.name.trim() !== '').map((s) => ({ id: s.id, name: s.name, app: '', thumbnail: s.thumbnail.toDataURL(), icon: '', minimized: false }))
    }
    const list: WindowSource[] = []
    for (const w of programs) {
      const id = `window:${w.h}:0`
      if (own.has(id)) continue
      const picture = pictures.get(id)?.thumbnail
      list.push({
        id,
        name: w.t,
        app: w.d || path.win32.basename(w.p, '.exe'),
        thumbnail: !w.m && picture && !picture.isEmpty() ? picture.toDataURL() : '',
        icon: w.p ? await this.iconOf(w.p) : '',
        minimized: w.m
      })
    }
    return list
  }

  private async iconOf(file: string): Promise<string> {
    const known = this.iconCache.get(file)
    if (known !== undefined) return known
    let icon = ''
    try {
      icon = (await app.getFileIcon(file, { size: 'large' })).toDataURL()
    } catch {
      // No icon: the card shows the program name only.
    }
    this.iconCache.set(file, icon)
    return icon
  }

  /** A window screen: another program's window, shown live on the projector (like screen sharing). */
  addWindowScreen(sourceId: string, name: string): void {
    if (!/^window:/.test(sourceId)) return
    const n = this.screenSeq++
    const id = `window-${n}`
    const o = this.createOutput(id, n, 'capture', 0)
    o.capture = { sourceId, name: name.slice(0, 80) }
    o.linked = false
    o.view.webContents.session.setDisplayMediaRequestHandler((_request, callback) => callback({ video: { id: sourceId, name } }))
    // A minimized window has no picture: restore it (without taking the focus) first.
    if (windowHandle(sourceId) !== null) this.windows.restore(sourceId)
    this.paths.loadCapture(o.view)
    this.emit()
  }

  onCommand(command: CommandKey): void {
    if (this.timer.alarming) {
      this.dismissAlarm()
      return
    }
    if (this.roller.showing) {
      this.closeRollerByUser()
      return
    }
    // Esc first leaves a marking tool (like PowerPoint's pen), then stops projecting.
    if (command === 'stop-project' && this.inkSettings.tool !== 'pointer') {
      this.setInkTool('pointer')
      return
    }
    if (command === 'project') this.startProjecting()
    else this.stopProjecting()
  }

  // ---------- 抽人 ----------

  /** Pick one person; every students' screen plays the same rolling highlight. */
  rollerRoll(): void {
    const roll = this.roller.roll()
    if (roll) {
      const payload: RollerPlay = { people: this.roller.peopleView(), path: roll.path, winner: roll.winner, startAt: roll.startAt, sound: false }
      const targets = this.audienceRollers()
      targets.forEach((overlay, i) => overlay.play({ ...payload, sound: i === 0 }))
      this.roller.showing = targets.length > 0
    }
    this.emit()
  }

  rollerHide(): void {
    this.projectorRoller.hide()
    for (const overlay of this.screenRollers.values()) overlay.hide()
    this.roller.showing = false
    this.emit()
  }

  rollerPointer(): void {
    this.closeRollerByUser()
  }

  /** Start over: nobody in the active list counts as picked. */
  rollerReset(): void {
    if (this.roller.showing) this.rollerHide()
    this.roller.reset()
    this.emit()
  }

  rollerSetSuperLucky(on: boolean): void {
    this.roller.setSuperLucky(on)
    this.emit()
  }

  rollerSelectList(id: string): void {
    if (this.roller.showing) this.rollerHide()
    this.roller.selectList(id)
    this.emit()
  }

  rollerSaveList(id: string | null, name: string, text: string): void {
    if (this.roller.showing) this.rollerHide()
    this.roller.saveList(id, name, text)
    this.emit()
  }

  rollerDeleteList(id: string): void {
    if (this.roller.showing) this.rollerHide()
    this.roller.deleteList(id)
    this.emit()
  }

  // ---------- marks (ink) ----------

  setInkTool(tool: InkTool): void {
    if (!INK_TOOLS.includes(tool)) return
    if (this.inkSettings.tool === 'laser' && tool !== 'laser') this.inkOp({ t: 'laser-off' }, 'main')
    this.inkSettings = { ...this.inkSettings, tool }
    this.sendInkSettings()
    this.emit()
  }

  /** Picking a colour also picks the pen when no drawing tool is active. */
  setInkColor(color: string): void {
    if (!INK_COLORS.includes(color)) return
    const drawing = this.inkSettings.tool === 'pen' || this.inkSettings.tool === 'highlighter' || this.inkSettings.tool === 'rect'
    this.inkSettings = { tool: drawing ? this.inkSettings.tool : 'pen', color }
    this.sendInkSettings()
    this.emit()
  }

  /** origin = who already drew it: the projector page, the console canvas, or nobody. */
  inkOp(op: InkOp, origin: 'deck' | 'console' | 'main'): void {
    this.inkScene.apply(op)
    if (origin !== 'deck') this.projectorContents()?.send('ink:op', op)
    if (origin !== 'console' && this.projecting) this.consoleContents()?.send('ink:op', op)
  }

  inkSnapshot(): InkStroke[] {
    return this.inkScene.strokes
  }

  /** A deck page's marking layer is ready (after every load); only the screen on the projector draws. */
  inkReady(o: Output): void {
    this.sendInkSettings()
    if (o === this.onAir()) this.projectorContents()?.send('ink:snapshot', this.inkScene.strokes)
  }

  isOnAir(o: Output | undefined): boolean {
    return o !== undefined && o === this.onAir()
  }

  /** A click on the projector window selects the screen shown there. */
  onProjectorPointer(): void {
    this.onPointer(this.onAirId)
  }

  setMirrorMode(mode: 'video' | 'snapshot'): void {
    this.mirrorVideo = mode === 'video'
  }

  // ---------- zoom (字号) ----------

  /** Zoom a screen like a browser page. The next preview follows the screen it previews. */
  zoom(id: OutputId | null, direction: ZoomDirection): void {
    const requested = this.outputs.get(id ?? this.selectedId)
    const target = requested?.kind === 'preview' ? this.previewSource() : requested
    if (!target || !target.deck) return
    const percent = stepZoom(target.zoomPercent, direction)
    target.setZoomPercent(percent)
    rememberZoom(target.deck.path, percent)
    this.followPreview()
    this.emit()
  }

  // ---------- navigation ----------

  onKey(intent: KeyIntent, sourceId: OutputId | null): void {
    if (this.timer.alarming) {
      this.dismissAlarm()
      return
    }
    // A page key first closes the 抽人 picture; it does not also turn the page.
    if (this.roller.showing) {
      this.closeRollerByUser()
      return
    }
    // A key pressed inside a screen (or the next preview) selects it first; window screens
    // have no pages (the key belongs to their own program).
    const source = sourceId ? this.outputs.get(sourceId) : undefined
    if (source && source.kind !== 'capture') this.select(source.id)
    this.navigate(intentToAction(intent))
  }

  navigate(action: NavAction): void {
    const selected = this.outputs.get(this.selectedId)
    // The selected next preview turns alone: the teacher looks ahead; students see nothing change.
    if (selected?.kind === 'preview') {
      this.applyMoves(planMove([{ id: selected.id, index: selected.index, total: selected.total, linked: false }], selected.id, action))
      return
    }
    this.applyMoves(planMove(this.navOutputs(), this.selectedId, action))
  }

  /** −/+ on a screen card: move only that screen, whatever its link state. */
  nudge(id: OutputId, delta: number): void {
    const solo = this.navOutputs().map((o) => ({ ...o, linked: false }))
    this.applyMoves(planMove(solo, id, { type: 'step', delta }))
  }

  /**
   * Selecting the next preview lets the teacher page through it alone. Selecting a real
   * screen brings the preview back to the slide after that screen's slide.
   */
  select(id: OutputId): void {
    const o = this.outputs.get(id)
    // A window screen: its window comes to the front and it goes on the projector (the
    // teacher's choice, 2026-09-30); the next preview keeps following the last deck screen.
    if (o?.kind === 'capture' && o.capture) {
      this.selectedId = id
      this.project(id)
      this.windows.raise(o.capture.sourceId)
      this.emit()
      return
    }
    if (!o || !o.deck) return
    // From the deck end, browsing starts on the last slide (not one past it).
    if (o.kind === 'preview' && this.selectedId !== id) o.index = o.shownIndex()
    this.setSelected(id)
    this.followPreview()
    this.emit()
  }

  setLinked(id: OutputId, linked: boolean): void {
    const o = this.outputs.get(id)
    if (!o || o.kind === 'preview') return
    o.linked = linked
    this.emit()
  }

  onPointer(id: OutputId): void {
    if (this.timer.alarming) this.dismissAlarm()
    this.select(id)
  }

  // ---------- timer ----------

  timerStart(sec: number): void {
    this.timer = T.start(this.timer, sec, Date.now())
    this.syncTimer(true)
  }

  timerToggle(): void {
    if (this.timer.alarming) {
      this.dismissAlarm()
      return
    }
    this.timer = T.toggle(this.timer, Date.now(), this.defaultDuration())
    this.syncTimer(true)
  }

  timerReset(): void {
    this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
  }

  dismissAlarm(): void {
    this.timer = T.dismiss(this.timer)
    if (this.timer.status === 'idle') this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
  }

  // ---------- layout and state ----------

  layoutPreview(rect: PreviewRect | null): void {
    this.previewRect = rect
    this.applyPreview()
  }

  layoutCurrent(rect: PreviewRect | null): void {
    this.currentRect = rect
    this.applyCurrent()
  }

  getState(): AppState {
    const onAir = this.onAir()
    const selected = this.outputs.get(this.selectedId)
    const focus = selected && selected.deck ? selected : this.projector()
    return {
      outputs: [...this.outputs.values()].map((o) => o.toView()),
      selectedId: this.selectedId,
      mainDeck: this.mainDeck,
      slides: focus.slides,
      slidesOf: focus.id,
      onAirId: onAir.id,
      previewOf: this.previewSource().id,
      previewSize: this.layoutSize(this.previewSource()),
      milestones: onAir.milestones,
      timer: this.timerView(),
      plannedMinutes: this.plannedMinutes(),
      recent: this.recent,
      hasExternalDisplay: projectorDisplay() !== null,
      projecting: this.projecting,
      projectorSize: this.targetSize(),
      roller: this.roller.view(),
      deckStatus: this.deckStatus,
      ink: this.inkSettings
    }
  }

  // ---------- internals ----------

  /** Students' screens that show the 抽人 picture: the projector while projecting, plus every extra screen. */
  private audienceRollers(): RollerOverlay[] {
    return [...(this.projecting ? [this.projectorRoller] : []), ...this.screenRollers.values()]
  }

  /** Keys and clicks close the picture only after the highlight has landed. */
  private closeRollerByUser(): void {
    if (!this.roller.busy()) this.rollerHide()
  }

  private createRollerOverlay(): RollerOverlay {
    const overlay = new RollerOverlay(this.paths.rollerPreload, this.paths.loadRoller)
    overlay.view.webContents.on('before-input-event', (event, input) => {
      event.preventDefault()
      if (input.type === 'keyDown') this.closeRollerByUser()
    })
    return overlay
  }

  private createOutput(id: OutputId, screenNumber: number, kind: OutputKind, index: number): Output {
    const o = new Output({ id, screenNumber, kind, linked: true, index, preload: this.paths.deckPreload, onEvent: (out, e) => this.onOutputEvent(out, e) })
    this.outputs.set(id, o)
    return o
  }

  private onOutputEvent(o: Output, e: OutputEvent): void {
    switch (e.type) {
      case 'key':
        this.onKey(e.intent, o.id)
        break
      case 'command':
        this.onCommand(e.command)
        break
      case 'zoom':
        this.zoom(o.id, e.direction)
        break
      case 'anykey':
        if (this.timer.alarming) this.dismissAlarm()
        break
      case 'state':
        this.onDeckState(o, e.msg, e.userMoved)
        break
      case 'loaded':
        if (o.kind === 'preview') this.applyPreview()
        if (o === this.onAir() && !this.projecting) this.applyCurrent()
        this.emit()
        break
      case 'changed':
        if (o === this.onAir()) this.syncTimer(true)
        this.emit()
        break
    }
  }

  private onDeckState(o: Output, msg: DeckStateMsg, userMoved: boolean): void {
    if (o.kind === 'preview') {
      // Paging inside the preview counts only while it is selected; otherwise it goes back.
      if (userMoved) {
        if (this.selectedId === o.id) o.acceptIndex(msg.currentSlide)
        else o.moveTo(o.index)
      }
      this.emit()
      return
    }
    if (userMoved) {
      this.setSelected(o.id)
      const moves = planMove(this.navOutputs(), o.id, { type: 'goto', index: msg.currentSlide })
      if (moves.size === 0) o.acceptIndex(msg.currentSlide)
      for (const [id, idx] of moves) {
        const target = this.outputs.get(id)
        if (target === o) target.acceptIndex(idx)
        else target?.moveTo(idx)
      }
      this.afterMove()
    }
    if (o === this.onAir() && msg.timer) this.adoptDeckTimer(msg.timer)
    // The page count may have just arrived, which moves "the slide after" at the deck end.
    if (o === this.previewSource()) this.followPreview()
    this.emit()
  }

  /** The teacher may use the deck's own timer buttons on the projector; follow them. */
  private adoptDeckTimer(t: NonNullable<DeckStateMsg['timer']>): void {
    const now = Date.now()
    if (this.timer.alarming) {
      if (now - this.alarmSince > ALARM_GUARD_MS && !t.isDone) this.dismissAlarm()
      return
    }
    if (now - this.lastTimerCmd < DECK_TIMER_GUARD_MS) return
    const ours = this.timer.status
    if (t.isRunning && ours !== 'running' && typeof t.remaining === 'number' && t.remaining > 0) {
      this.timerStart(t.remaining)
    } else if (!t.isRunning && !t.isDone && ours === 'running' && typeof t.remaining === 'number') {
      this.timer = T.pause(this.timer, now)
      this.syncTimer(true)
    } else if (t.remaining === null && !t.isDone && (ours === 'running' || ours === 'paused')) {
      this.timerReset()
    }
  }

  private applyMoves(moves: Map<OutputId, number>): void {
    for (const [id, idx] of moves) this.outputs.get(id)?.moveTo(idx)
    if (moves.size > 0) this.afterMove()
  }

  /** Marks are temporary: they clear when the projector shows another page. */
  private clearInkIfPageChanged(): void {
    const page = this.onAir().shownIndex()
    if (page === this.inkPage) return
    this.inkPage = page
    if (this.inkScene.strokes.length > 0 || this.inkScene.laser) this.inkOp({ t: 'clear' }, 'main')
  }

  private sendInkSettings(): void {
    const onAir = this.onAir()
    for (const o of this.outputs.values()) {
      if (o.kind === 'preview' || o.kind === 'capture') continue
      const wc = o.view.webContents
      if (!wc.isDestroyed()) wc.send('ink:settings', { ...this.inkSettings, projecting: this.projecting, active: o === onAir })
    }
  }

  private projectorContents(): WebContents | null {
    const wc = this.onAir().view.webContents
    return wc.isDestroyed() ? null : wc
  }

  private consoleContents(): WebContents | null {
    const wc = this.consoleWin?.win.webContents
    return !wc || wc.isDestroyed() ? null : wc
  }

  private afterMove(): void {
    this.clearInkIfPageChanged()
    this.followPreview()
    if (this.timer.status === 'idle') this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
    this.emit()
    setTimeout(() => void this.captureMirror(), 150)
  }

  /** Screens that turn pages. The next preview is not one: it follows the selection instead. */
  private navOutputs(): NavOutput[] {
    return [...this.outputs.values()]
      .filter((o) => o.deck !== null && o.kind !== 'preview')
      .map((o) => ({ id: o.id, index: o.index, total: o.total, linked: o.linked }))
  }

  private tick(): void {
    const wasAlarming = this.timer.alarming
    this.timer = T.tick(this.timer, Date.now())
    if (this.timer.alarming && !wasAlarming) this.alarmSince = Date.now()
    this.syncTimer(false)
  }

  private syncTimer(force: boolean): void {
    if (!this.projectorWin) return
    const view = this.timerView()
    const key = `${view.status}|${view.remainingSec}|${view.alarming}|${view.durationSec}`
    if (!force && key === this.lastTimerKey) return
    this.lastTimerKey = key
    if (force) this.lastTimerCmd = Date.now()
    const onAir = this.onAir()
    onAir.sendTimer({ remaining: view.status === 'idle' ? null : view.remainingSec, isRunning: view.status === 'running', isDone: view.alarming })
    // UXD202 decks show the countdown in their own navbar; every other screen gets the overlay.
    const deckShowsTimer = onAir.adapter === 'uxd202' && onAir.ownTimer
    this.projectorWin.setOverlayVisible(this.projecting && !deckShowsTimer && view.status !== 'idle')
    const overlay = this.projectorWin.overlay.webContents
    if (!overlay.isDestroyed()) overlay.send('timer', view)
    this.emit()
  }

  private timerView(): TimerView {
    return { status: this.timer.status, remainingSec: T.remainingSec(this.timer), durationSec: this.timer.durationSec, alarming: this.timer.alarming }
  }

  private plannedMinutes(): number | null {
    const p = this.onAir()
    const minutes = p.slides[p.shownIndex()]?.minutes
    return typeof minutes === 'number' && minutes > 0 ? minutes : null
  }

  private defaultDuration(): number {
    const planned = this.plannedMinutes()
    return planned ? planned * 60 : this.timer.durationSec
  }

  private setSelected(id: OutputId): void {
    this.selectedId = id
    if (this.outputs.get(id)?.kind !== 'preview') this.previewOfId = id
  }

  /** The screen the next preview follows: the last selected real screen, else the projector. */
  private previewSource(): Output {
    const o = this.outputs.get(this.previewOfId)
    return o && o.deck && o.kind !== 'preview' ? o : this.projector()
  }

  /**
   * The next preview shows the slide after the one its screen shows, with the same deck and
   * text size. While the teacher pages through the preview itself (selected), it stays put.
   */
  private followPreview(reload = false): void {
    const next = this.next()
    const source = this.previewSource()
    if (!source.deck || !source.prepared) return
    next.setZoomPercent(source.zoomPercent)
    const target = source.shownIndex() + 1
    const sameDeck = next.prepared?.folder === source.prepared.folder && next.prepared?.entry === source.prepared.entry
    if (reload || !sameDeck || !next.deck) {
      next.index = target
      next.load(source.deck, source.prepared)
    } else if (this.selectedId !== next.id && next.index !== target) next.moveTo(target)
    this.applyPreview()
  }

  private applyPreview(): void {
    const next = this.next()
    const r = this.previewRect
    if (!r || !next.deck) {
      next.view.setVisible(false)
      return
    }
    next.view.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
    next.view.setVisible(true)
    next.setBaseZoom(r.width / Math.max(1, this.layoutSize(this.previewSource()).width))
  }

  /** The size a screen's deck is laid out for. */
  private layoutSize(o: Output): { width: number; height: number } {
    if (o.kind === 'window' && o !== this.onAir()) return this.screens.get(o.id)?.contentSize() ?? { ...WINDOWED }
    return this.targetSize()
  }

  /** Not projecting: the screen on air is shown live in the console's current pane. */
  private applyCurrent(): void {
    if (this.projecting) return
    const onAir = this.onAir()
    const r = this.currentRect
    if (!r || !this.hasContent(onAir)) {
      onAir.view.setVisible(false)
      return
    }
    onAir.view.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
    onAir.view.setVisible(true)
    onAir.setBaseZoom(r.width / Math.max(1, this.targetSize().width))
  }

  /** The screen on the projector (before projecting: in the current pane). */
  private onAir(): Output {
    return this.outputs.get(this.onAirId) ?? this.projector()
  }

  private hasContent(o: Output): boolean {
    return o.deck !== null || o.capture !== null
  }

  /** Off the projector: an extra deck screen returns to its own window; others wait out of sight. */
  private leaveStage(o: Output): void {
    if (this.projecting) this.projectorWin.detach(o.view)
    else this.consoleWin.win.contentView.removeChildView(o.view)
    o.escapeStops = false
    const home = this.screens.get(o.id)
    if (home) {
      o.setBaseZoom(1)
      home.takeBack()
    } else o.view.setVisible(false)
  }

  private enterStage(o: Output): void {
    this.screens.get(o.id)?.lend()
    if (this.projecting) {
      this.projectorWin.attach(o.view)
      o.view.setVisible(true)
      o.setBaseZoom(1)
      o.escapeStops = true
    } else {
      this.consoleWin.win.contentView.addChildView(o.view)
      this.applyCurrent()
    }
  }

  /** The size decks are laid out for: the projector window, else the external display, else 1280x720. */
  private targetSize(): { width: number; height: number } {
    if (this.projecting) return this.projectorWin.contentSize()
    const d = projectorDisplay()
    return d ? { width: d.bounds.width, height: d.bounds.height } : { ...WINDOWED }
  }

  private async captureMirror(): Promise<void> {
    if (this.mirrorBusy || this.quitting || !this.projecting || this.mirrorVideo) return
    const cw = this.consoleWin.win
    if (cw.isDestroyed() || cw.isMinimized() || !cw.isVisible()) return
    this.mirrorBusy = true
    try {
      const img = await this.onAir().view.webContents.capturePage()
      if (!img.isEmpty() && !cw.isDestroyed()) cw.webContents.send('mirror', img.resize({ width: 1280, quality: 'good' }).toJPEG(80))
    } catch {
      // The projector page is between loads; the next tick retries.
    } finally {
      this.mirrorBusy = false
    }
  }

  private onDisplaysChanged(): void {
    this.projectorWin.place()
    this.consoleWin.place()
    this.applyCurrent()
    this.applyPreview()
    this.emit()
  }

  private async pickDeck(title: string): Promise<DeckRef | null> {
    const r = await dialog.showOpenDialog(this.consoleWin.win, { title, properties: ['openFile'], filters: [{ name: this.strings().deckFilter, extensions: DECK_EXTENSIONS }] })
    return r.canceled || !r.filePaths[0] ? null : this.toDeck(r.filePaths[0])
  }

  /** One spelling per file (C:/a vs C:\a), so the recent list and zoom memory see the same deck. */
  private toDeck(filePath: string): DeckRef {
    const full = path.resolve(filePath)
    return { path: full, name: deckTitle(full) }
  }

  private remember(deck: DeckRef): void {
    this.recent = mergeRecent(this.recent, deck)
    saveRecent(this.recent)
  }

  private projector(): Output {
    return this.outputs.get('projector') as Output
  }

  private next(): Output {
    return this.outputs.get('next') as Output
  }

  private emit(): void {
    if (this.emitQueued) return
    this.emitQueued = true
    setTimeout(() => {
      this.emitQueued = false
      this.emitNow()
    }, 16)
  }

  private emitNow(): void {
    const wc = this.consoleWin?.win.webContents
    if (!wc || wc.isDestroyed()) return
    wc.send('state', this.getState())
  }

  private quit(): void {
    if (this.quitting) return
    this.quitting = true
    this.windows.dispose()
    app.quit()
  }
}
