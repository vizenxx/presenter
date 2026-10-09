import { app, desktopCapturer, dialog, powerSaveBlocker, screen, session, systemPreferences, type BrowserWindow, type Rectangle, type WebContents, type WebContentsView } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { blankKey, commandKey, intentToAction, keyIntent, type BlankKind, type CommandKey } from '../shared/keys'
import { planMove, type NavOutput } from '../shared/nav'
import { DECK_EXTENSIONS, deckKind, deckTitle } from '../shared/deckKinds'
import { INK_COLORS, INK_TOOLS, InkScene, type InkOp, type InkSettings, type InkStroke, type InkTool } from '../shared/ink'
import { MAIN_STRINGS } from '../shared/lang'
import { mergeRecent } from '../shared/recentList'
import * as T from '../shared/timer'
import { stepZoom, zoomKey, type ZoomDirection } from '../shared/zoom'
import type { AppState, DeckRef, DeckStatus, KeyIntent, NavAction, OutputId, OutputKind, PreviewRect, RollerPlay, SpeakerTimerView, SpeakerMode, TimerView, UiTheme, WindowSource } from '../shared/types'
import type { GuideFile } from '../shared/guide'
import { ConsoleWindow } from './consoleWindow'
import { saveGuideFile } from './guide'
import { DeckError, prepareDeck, type PreparedDeck } from './convert'
import { consoleDisplay, projectorDisplay } from './displays'
import { Output, type DeckStateMsg, type OutputEvent } from './output'
import { IS_MAC } from './platform'
import { ProjectorWindow, WINDOWED } from './projectorWindow'
import { loadRecent, saveRecent } from './recent'
import { RollerController } from './roller'
import { RollerOverlay } from './rollerOverlay'
import { ProjectorScreen } from './projectorScreen'
import { startupLog } from './startupLog'
import { WindowsHelper, windowHandle } from './windowsHelper'
import { WindowTools } from './windowTools'
import { rememberZoom, zoomFor } from './zoomMemory'
import { loadTheme, saveTheme, themeBackground } from './themeMemory'
import { loadWarnings, saveWarnings } from './timerMemory'
import { loadMyTimer, saveMyTimer } from './myTimerMemory'
import { loadFolder, saveFolder } from './folderMemory'

export interface StorePaths {
  deckPreload: string
  consolePreload: string
  overlayPreload: string
  rollerPreload: string
  loadConsole: (win: BrowserWindow) => void
  loadOverlay: (view: WebContentsView) => void
  loadRoller: (view: WebContentsView) => void
  loadCapture: (view: WebContentsView) => void
  loadToolbar: (win: BrowserWindow) => void
  loadInkPad: (win: BrowserWindow) => void
}

const TICK_MS = 200
/** How often the program windows on projectors are checked (in front? moved?). */
const TRACK_MS = 250
const MIRROR_MS = 250
/** Ignore deck-side "not done" reports this soon after the alarm starts (they are stale echoes). */
const ALARM_GUARD_MS = 1500
/** Live decks in the console have the same round corners as their slot (rounded-xl); on a projector they are square. */
const CONSOLE_VIEW_RADIUS = 12
/** Ignore deck timer reports this soon after our own timer command. */
const DECK_TIMER_GUARD_MS = 1000

/** Single source of truth. Windows render its state and send intents back. */
export class Store {
  private readonly outputs = new Map<OutputId, Output>()
  /** Projector 2, 3 …: extra audience screens, each showing one content (or black). */
  private readonly extras = new Map<number, { screen: ProjectorScreen; roller: RollerOverlay; contentId: OutputId | null; displayId: number | null }>()
  private selectedId: OutputId = 'projector'
  /** The screen the next preview follows: the last selected real screen. */
  private previewOfId: OutputId = 'projector'
  /** The content on Projector 1 (before projecting: in the console's current pane); null = nothing. */
  private onAirId: OutputId | null = 'projector'
  /** Lists program windows (minimized ones too) and brings them forward; Windows and macOS. */
  private readonly windows = new WindowsHelper(
    process.platform === 'darwin' ? (app.isPackaged ? path.join(process.resourcesPath, 'presenter-window-helper') : path.join(app.getAppPath(), 'build', 'mac-helper', 'presenter-window-helper')) : null
  )
  /** macOS: Accessibility is asked for once per start, when the first window content is added. */
  private askedAccessibility = false
  private readonly iconCache = new Map<string, string>()
  private mainDeck: DeckRef | null = null
  private mainPrepared: PreparedDeck | null = null
  private deckStatus: DeckStatus = { state: 'ready' }
  private inkSettings: InkSettings = { tool: 'pointer', color: INK_COLORS[0] }
  /** Marks per content: a deck's clear on a page turn, a program window's only when cleared. */
  private readonly scenes = new Map<OutputId, InkScene>()
  /** The program window in front that the floating tools serve. */
  private activeWindowId: OutputId | null = null
  private tools!: WindowTools
  private tracking = false
  private speaker: SpeakerTimerView = { mode: 'up', minutes: 45, startedAt: null, heldMs: 0, periods: T.cleanPeriods(T.DEFAULT_PERIODS), clockExtra: null }
  private theme: UiTheme | null = null
  private warnings: T.TimerWarning[] = T.DEFAULT_WARNINGS.map((w) => ({ ...w }))
  /** Black or white projectors (B / W); null = the slides show. */
  private blank: BlankKind | null = null
  /** Keeps the screens from sleeping while a class needs them. */
  private awakeId: number | null = null
  /** Folder of the deck opened last; Open deck starts there. */
  private lastFolder: string | null = null
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

  constructor(private readonly paths: StorePaths) {}

  start(): void {
    this.recent = loadRecent()
    this.theme = loadTheme()
    this.warnings = loadWarnings()
    this.speaker = { ...loadMyTimer(), startedAt: null, heldMs: 0, clockExtra: null }
    this.lastFolder = loadFolder()
    const projector = this.createOutput('projector', 1, 'projector', 0)
    // The next preview is not a screen: it shows the slide after the selected screen's slide.
    const next = this.createOutput('next', 0, 'preview', 1)
    this.consoleWin = new ConsoleWindow(this.paths.consolePreload, this.paths.loadConsole, () => this.quit(), themeBackground(this.theme))
    this.roller = new RollerController(() => this.strings())
    this.projectorRoller = this.createRollerOverlay()
    this.projectorWin = new ProjectorWindow(this.paths.overlayPreload, this.paths.loadOverlay, () => this.stopProjecting(), this.projectorRoller.view)
    // Until the teacher starts projecting, the projector deck lives in the console's "current" pane.
    for (const view of [projector.view, next.view]) {
      this.consoleWin.win.contentView.addChildView(view)
      view.setVisible(false)
    }
    this.tools = new WindowTools({ consolePreload: this.paths.consolePreload, deckPreload: this.paths.deckPreload, loadToolbar: this.paths.loadToolbar, loadInkPad: this.paths.loadInkPad })
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
      const blank = blankKey(input.key, input)
      if (blank) {
        event.preventDefault()
        if (input.type === 'keyDown') this.setBlank(blank)
        return
      }
      if (!zoom && !command && !intent) return
      event.preventDefault()
      if (input.type !== 'keyDown') return
      if (zoom) this.zoom(this.onAirId ?? 'projector', zoom)
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
    setInterval(() => void this.trackWindows(), TRACK_MS)
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
    this.scene('projector').apply({ t: 'clear' })
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
    // Opening a deck means showing it: it goes on Projector 1 if another content was there.
    this.showOn('projector', 1)
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
    // A new content waits (it opens no window); its card's projector menu shows it somewhere.
    const o = this.createOutput(id, n, 'window', sameDeck ? this.projector().index : 0)
    o.followsMain = sameDeck
    o.setZoomPercent(zoomFor(deck.path))
    o.load(deck, prepared)
    this.emit()
  }

  removeScreen(id: OutputId): void {
    const o = this.outputs.get(id)
    if (!o || (o.kind !== 'window' && o.kind !== 'capture')) return
    const on = this.shownOn(o)
    if (on === 1 && this.hasContent(this.projector())) this.showOn('projector', 1)
    else if (on !== null) this.showOn(id, null)
    this.outputs.delete(id)
    if (this.selectedId === id) this.setSelected('projector')
    if (this.previewOfId === id) this.previewOfId = 'projector'
    this.followPreview()
    o.destroy()
    this.emit()
  }

  projectorFullscreen(n: number): void {
    this.extras.get(n)?.screen.toggleFullscreen()
  }

  /** Close Projector n (2, 3 …); its content waits, keeping its page. */
  closeProjector(n: number): void {
    this.extras.get(n)?.screen.close()
  }

  // ---------- projection ----------

  startProjecting(): void {
    const onAir = this.onAir()
    if (this.projecting || !onAir) return
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
    if (this.blank) this.setBlank(null)
    this.projecting = false
    const onAir = this.onAir()
    this.projectorWin.close()
    if (onAir) {
      onAir.escapeStops = false
      this.projectorWin.detach(onAir.view)
      this.consoleWin.win.contentView.addChildView(onAir.view)
    }
    this.mirrorVideo = false
    this.sendInkSettings()
    this.applyCurrent()
    this.applyPreview()
    this.syncTimer(true)
    this.emit()
  }

  /**
   * Show a content on Projector n (1 = the main projector), on a new projector ('new'), or
   * nowhere (null: it waits, keeping its page). A projector shows one content at a time; the one
   * it showed before waits. Only the card's projector menu does this: selecting a card never
   * changes what the audience sees, so a waiting deck can be browsed with the next preview.
   */
  showOn(id: OutputId, target: number | 'new' | null): void {
    const o = this.outputs.get(id)
    if (!o || o.kind === 'preview' || !this.hasContent(o)) return
    const to = target === 'new' ? this.nextProjectorNumber() : target
    const from = this.shownOn(o)
    if (to === from) return
    // Marks belong to where a content was shown: the moved content and the one it replaces lose theirs.
    const replaced = to === 1 ? this.onAirId : to !== null ? (this.extras.get(to)?.contentId ?? null) : null
    for (const id of [o.id, replaced]) if (id) this.applyInk(id, { t: 'clear' }, 'main')
    if (to !== null && to !== 1 && !this.extras.has(to)) {
      if (target !== 'new') return
      this.createProjector(to)
    }
    // Off where it was …
    if (from === 1) this.clearStage()
    else if (from !== null) this.setExtraContent(from, null)
    // … on where it goes; what was there waits.
    if (to === 1) {
      this.clearStage()
      this.onAirId = o.id
      this.enterStage(o)
    } else if (to !== null) this.setExtraContent(to, o)
    else o.view.setVisible(false)
    if (from === 1 || to === 1) this.afterStageChange()
    // A window shown on a projector comes to the front (restored if minimized), ready to use.
    if (to !== null && o.capture) this.windows.raise(o.capture.sourceId)
    this.sendInkSettings()
    this.emit()
  }

  /**
   * The program windows that could become window screens, like the lists in Zoom or Teams:
   * on Windows every Alt+Tab window, minimized ones included (Chromium's own list leaves those
   * out), with a live picture when there is one and the program icon otherwise. Presenter's own
   * windows are left out.
   */
  async listWindows(): Promise<WindowSource[]> {
    const own = new Set([this.consoleWin.win, this.projectorWin.win].map((w) => w.getMediaSourceId()))
    for (const x of this.extras.values()) own.add(x.screen.mediaSourceId())
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
  addWindowScreen(sourceId: string, name: string, show = false): void {
    if (!/^window:/.test(sourceId)) return
    const n = this.screenSeq++
    const id = `window-${n}`
    const o = this.createOutput(id, n, 'capture', 0)
    o.capture = { sourceId, name: name.slice(0, 80) }
    o.linked = false
    o.view.webContents.session.setDisplayMediaRequestHandler((_request, callback) => callback({ video: { id: sourceId, name } }))
    // The window is left as it is (minimized or not); it comes forward only when a projector shows it.
    this.paths.loadCapture(o.view)
    // macOS: raising one exact window (and un-minimizing it) needs Accessibility; ask now, while
    // setting up, not later in front of the class. Without it the whole program comes forward.
    if (IS_MAC && !this.askedAccessibility) {
      this.askedAccessibility = true
      systemPreferences.isTrustedAccessibilityClient(true)
    }
    // From the start screen (no deck yet) it is the first content: straight onto Projector 1.
    if (show) this.showOn(id, 1)
    this.emit()
  }

  onCommand(command: CommandKey): void {
    if (this.timer.alarming) {
      this.dismissAlarm()
      return
    }
    if (this.blank) {
      this.setBlank(null)
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
    for (const x of this.extras.values()) x.roller.hide()
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
    const leaving = tool === 'pointer' && this.inkSettings.tool !== 'pointer'
    this.inkSettings = { ...this.inkSettings, tool }
    this.sendInkSettings()
    if (leaving) this.returnKeysToWindow()
    this.emit()
  }

  /**
   * Drawing on a program window: the floating toolbar takes the keyboard, so Esc and Ctrl+Z
   * reach the marks and not the program under the pad.
   */
  padPointer(): void {
    const bar = this.tools.toolbar
    if (this.inkSettings.tool !== 'pointer' && this.activeWindowId && !bar.isDestroyed() && !bar.isFocused()) bar.focus()
  }

  /** Back to the pointer on a program window: the keyboard goes back to that window. */
  private returnKeysToWindow(): void {
    const o = this.activeWindowId ? this.outputs.get(this.activeWindowId) : undefined
    const bar = this.tools.toolbar
    if (o?.capture && !bar.isDestroyed() && bar.isFocused()) this.windows.raise(o.capture.sourceId)
  }

  /** Picking a colour also picks the pen when no drawing tool is active. */
  setInkColor(color: string): void {
    if (!INK_COLORS.includes(color)) return
    const drawing = this.inkSettings.tool === 'pen' || this.inkSettings.tool === 'highlighter' || this.inkSettings.tool === 'rect'
    this.inkSettings = { tool: drawing ? this.inkSettings.tool : 'pen', color }
    this.sendInkSettings()
    this.emit()
  }

  /**
   * origin = who already drew it: the Projector 1 page ('deck'), the console canvas, the ink pad
   * over a program window ('pad'), or nobody ('main'). Buttons and the pad mark the program window
   * in front when there is one, else Projector 1.
   */
  inkOp(op: InkOp, origin: 'deck' | 'console' | 'pad' | 'main'): void {
    const target = origin === 'deck' || origin === 'console' ? this.onAirId : this.inkTargetId()
    if (target) this.applyInk(target, op, origin)
  }

  inkSnapshot(): InkStroke[] {
    return this.onAirId ? this.scene(this.onAirId).strokes : []
  }

  /** A content page's marking layer is ready (after every load). */
  inkReady(o: Output): void {
    this.sendInkSettings()
    const wc = o.view.webContents
    if (!wc.isDestroyed()) wc.send('ink:snapshot', this.scene(o.id).strokes)
  }

  /** The ink pad over program windows is ready. */
  padReady(): void {
    this.sendPadSettings()
    if (!this.tools.pad.isDestroyed()) this.tools.pad.webContents.send('ink:snapshot', this.activeWindowId ? this.scene(this.activeWindowId).strokes : [])
  }

  isPad(wc: WebContents): boolean {
    return !this.tools.pad.isDestroyed() && wc === this.tools.pad.webContents
  }

  toolbarSize(width: number, height: number): void {
    this.tools.resizeToolbar(width, height)
  }

  // ---------- my timer (the speaker's own) ----------

  speakerMode(mode: SpeakerMode): void {
    if (!T.SPEAKER_MODES.includes(mode)) return
    this.speaker = { ...this.speaker, mode, startedAt: null, heldMs: 0 }
    this.saveSpeaker()
    this.emit()
  }

  speakerMinutes(minutes: number): void {
    this.speaker = { ...this.speaker, minutes: Math.min(240, Math.max(1, Math.round(Number(minutes)) || 1)) }
    this.saveSpeaker()
    this.emit()
  }

  /** My timer's class periods (From–to): during a period it counts down to its end by itself. */
  speakerPeriods(periods: unknown): void {
    // Today's ± change belongs to a period by its place in the list; a new list starts without it.
    this.speaker = { ...this.speaker, periods: T.cleanPeriods(periods), clockExtra: null }
    this.saveSpeaker()
    this.emit()
  }

  private saveSpeaker(): void {
    const { mode, minutes, periods } = this.speaker
    saveMyTimer({ mode, minutes, periods })
  }

  speakerToggle(): void {
    const s = this.speaker
    // Clock times start and stop by themselves.
    if (s.mode === 'clock') return
    const now = Date.now()
    this.speaker = s.startedAt === null ? { ...s, startedAt: now } : { ...s, startedAt: null, heldMs: s.heldMs + now - s.startedAt }
    this.emit()
  }

  speakerReset(): void {
    this.speaker = { ...this.speaker, startedAt: null, heldMs: 0 }
    this.emit()
  }

  /** Adds time to My timer (below zero: takes time away) once it has started. */
  speakerAdjust(deltaSec: number): void {
    this.speaker = T.adjustSpeaker(this.speaker, Number(deltaSec) || 0, Date.now())
    this.emit()
  }

  // ---------- look ----------

  setTheme(theme: UiTheme): void {
    if (theme !== 'light' && theme !== 'dark') return
    this.theme = theme
    saveTheme(theme)
    if (!this.consoleWin.win.isDestroyed()) this.consoleWin.win.setBackgroundColor(themeBackground(theme))
    this.emit()
  }

  isOnAir(o: Output | undefined): boolean {
    return o !== undefined && o.id === this.onAirId
  }

  /** A click on the projector window selects the content shown there. */
  onProjectorPointer(): void {
    if (this.onAirId) this.onPointer(this.onAirId)
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
    // A key while the projectors are black or white brings the slide back; it does not turn the page.
    if (this.blank) {
      this.setBlank(null)
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
    // A window content: clicking its card only selects it; the window comes forward when a
    // projector is chosen for it (the teacher's choice, 2026-10-01).
    if (o?.kind === 'capture') {
      this.selectedId = id
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
    // A click on a black or white projector brings the slide back.
    if (this.blank && this.shownOnAny(id)) this.setBlank(null)
    this.select(id)
  }

  /**
   * Black or white projectors (B / W, like PowerPoint): all audience screens go black or white;
   * the same key again, any other key, or a click brings the slides back. Only while something is
   * shown to the audience.
   */
  setBlank(kind: BlankKind | null): void {
    const audience = this.projecting || this.extras.size > 0
    const next = kind === null || kind === this.blank || !audience ? null : kind
    if (next === this.blank) return
    this.blank = next
    this.projectorWin.setBlank(next)
    for (const x of this.extras.values()) x.screen.setBlank(next)
    this.emit()
  }

  private shownOnAny(id: OutputId): boolean {
    const o = this.outputs.get(id)
    return !!o && this.shownOn(o) !== null && (this.projecting || this.shownOn(o) !== 1)
  }

  /** True while the screens are kept awake (for the end-to-end test). */
  keepsAwake(): boolean {
    return this.awakeId !== null && powerSaveBlocker.isStarted(this.awakeId)
  }

  /**
   * Keeps the laptop and projector screens from turning off while a class needs them: while
   * projecting, while a projector is open, or while a timer runs (also My timer's class period).
   */
  private updateKeepAwake(): void {
    const s = this.speaker
    const myTimer = s.startedAt !== null || (s.mode === 'clock' && T.clockNow(s, Date.now()).phase === 'during')
    const need = this.projecting || this.extras.size > 0 || this.timer.status === 'running' || this.timer.alarming || myTimer
    if (need && this.awakeId === null) this.awakeId = powerSaveBlocker.start('prevent-display-sleep')
    if (!need && this.awakeId !== null) {
      powerSaveBlocker.stop(this.awakeId)
      this.awakeId = null
    }
  }

  // ---------- timer ----------

  timerStart(sec: number): void {
    this.timer = T.start(this.timer, sec, Date.now())
    this.syncTimer(true)
  }

  /** Sets the class timer's time while it is stopped (not running or paused); Start then uses it. */
  timerSet(sec: number): void {
    if (this.timer.status === 'running' || this.timer.status === 'paused') return
    const seconds = Math.round(Number(sec))
    if (!(seconds >= 1)) return
    this.timer = T.reset(this.timer, Math.min(180 * 60 + 59, seconds))
    this.syncTimer(true)
  }

  /** Adds time to the class timer (below zero: takes time away) while it runs, is paused, or has rung. */
  timerAdjust(deltaSec: number): void {
    const next = T.adjust(this.timer, Number(deltaSec) || 0, Date.now())
    if (next === this.timer) return
    this.timer = next
    this.syncTimer(true)
  }

  timerToggle(): void {
    if (this.timer.alarming) {
      this.dismissAlarm()
      return
    }
    this.timer = T.toggle(this.timer, Date.now(), this.timer.durationSec)
    this.syncTimer(true)
  }

  timerReset(): void {
    this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
  }

  /** The class timer's warning bells: time left and number of beeps for each. */
  timerWarnings(list: unknown): void {
    this.warnings = T.cleanWarnings(list)
    saveWarnings(this.warnings)
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
      outputs: [...this.outputs.values()].map((o) => ({ ...o.toView(), shownOn: this.shownOn(o) })),
      selectedId: this.selectedId,
      mainDeck: this.mainDeck,
      slides: focus.slides,
      slidesOf: focus.id,
      onAirId: this.onAirId,
      projectors: [...this.extras].sort((a, b) => a[0] - b[0]).map(([number, x]) => ({ number, contentId: x.contentId, fullscreen: x.screen.isFullscreen() })),
      previewOf: this.previewSource().id,
      previewSize: this.layoutSize(this.previewSource()),
      milestones: onAir?.milestones ?? [],
      timer: this.timerView(),
      plannedMinutes: this.plannedMinutes(),
      recent: this.recent,
      hasExternalDisplay: projectorDisplay() !== null,
      projecting: this.projecting,
      projectorSize: this.targetSize(),
      roller: this.roller.view(),
      speaker: this.speaker,
      toolsFor: this.activeWindowId,
      deckStatus: this.deckStatus,
      ink: this.inkSettings,
      theme: this.theme,
      blank: this.blank
    }
  }

  // ---------- internals ----------

  /** Students' screens that show the 抽人 picture: the projector while projecting, plus every extra screen. */
  private audienceRollers(): RollerOverlay[] {
    return [...(this.projecting ? [this.projectorRoller] : []), ...[...this.extras.values()].map((x) => x.roller)]
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
      case 'ink-undo':
        this.inkOp({ t: 'undo' }, 'main')
        break
      case 'zoom':
        this.zoom(o.id, e.direction)
        break
      case 'anykey':
        if (this.timer.alarming) this.dismissAlarm()
        else if (this.blank) this.setBlank(null)
        break
      case 'blank':
        this.setBlank(e.kind)
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
    const onAir = this.onAir()
    const page = onAir?.shownIndex() ?? -1
    if (page === this.inkPage) return
    this.inkPage = page
    if (!onAir || onAir.kind === 'capture') return
    const marks = this.scene(onAir.id)
    if (marks.strokes.length > 0 || marks.laser) this.applyInk(onAir.id, { t: 'clear' }, 'main')
  }

  private sendInkSettings(): void {
    Output.inkTool = this.inkSettings.tool
    const onAir = this.onAir()
    for (const o of this.outputs.values()) {
      if (o.kind === 'preview') continue
      const wc = o.view.webContents
      if (wc.isDestroyed()) continue
      // A program window's page only shows its marks (they are drawn on the ink pad); a deck on
      // Projector 1 also takes marks drawn on the projector.
      const settings =
        o.kind === 'capture'
          ? { ...this.inkSettings, tool: 'pointer', projecting: false, active: this.shownOn(o) !== null }
          : { ...this.inkSettings, projecting: this.projecting, active: o === onAir }
      wc.send('ink:settings', settings)
    }
    this.sendPadSettings()
  }

  private sendPadSettings(): void {
    if (!this.tools || this.tools.pad.isDestroyed()) return
    const active = this.activeWindowId !== null
    this.tools.pad.webContents.send('ink:settings', { ...this.inkSettings, projecting: false, active })
    this.tools.setDrawing(active && this.inkSettings.tool !== 'pointer')
  }

  private scene(id: OutputId): InkScene {
    let s = this.scenes.get(id)
    if (!s) {
      s = new InkScene()
      this.scenes.set(id, s)
    }
    return s
  }

  /** Marks follow the program window in front; otherwise Projector 1. */
  private inkTargetId(): OutputId | null {
    return this.activeWindowId ?? this.onAirId
  }

  private applyInk(id: OutputId, op: InkOp, origin: 'deck' | 'console' | 'pad' | 'main'): void {
    this.scene(id).apply(op)
    const wc = this.outputs.get(id)?.view.webContents
    if (origin !== 'deck' && wc && !wc.isDestroyed()) wc.send('ink:op', op)
    if (origin !== 'console' && this.projecting && id === this.onAirId) this.consoleContents()?.send('ink:op', op)
    if (origin !== 'pad' && id === this.activeWindowId && !this.tools.pad.isDestroyed()) this.tools.pad.webContents.send('ink:op', op)
  }

  /**
   * Program windows on a projector: when one is in front (or the teacher is using the floating
   * toolbar), the toolbar and the ink pad come up over it; otherwise they hide (Windows only).
   */
  private async trackWindows(): Promise<void> {
    if (this.tracking || this.quitting || !this.tools) return
    const shown = [...this.outputs.values()].filter((o) => o.capture !== null && this.shownOn(o) !== null)
    if (shown.length === 0) {
      this.setActiveWindow(null, null)
      return
    }
    this.tracking = true
    try {
      const states = await this.windows.states(shown.map((o) => o.capture?.sourceId ?? ''))
      if (!states) {
        this.setActiveWindow(null, null)
        return
      }
      let active = shown.find((o) => windowHandle(o.capture?.sourceId ?? '') === states.fg) ?? null
      if (!active && this.activeWindowId && this.tools.handles().includes(states.fg)) active = shown.find((o) => o.id === this.activeWindowId) ?? null
      const place = active ? states.w.find((w) => w.h === windowHandle(active?.capture?.sourceId ?? '')) : undefined
      if (!active || !place || place.m) this.setActiveWindow(null, null)
      else this.setActiveWindow(active.id, { x: place.x, y: place.y, width: place.w, height: place.hh })
    } finally {
      this.tracking = false
    }
  }

  private setActiveWindow(id: OutputId | null, rect: Rectangle | null): void {
    const changed = id !== this.activeWindowId
    this.activeWindowId = id
    this.tools.place(id ? rect : null)
    if (!changed) return
    this.sendPadSettings()
    if (!this.tools.pad.isDestroyed()) this.tools.pad.webContents.send('ink:snapshot', id ? this.scene(id).strokes : [])
    this.emit()
  }

  private projectorContents(): WebContents | null {
    const wc = this.onAir()?.view.webContents
    return !wc || wc.isDestroyed() ? null : wc
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
    this.updateKeepAwake()
    const wasAlarming = this.timer.alarming
    this.timer = T.tick(this.timer, Date.now())
    if (this.timer.alarming && !wasAlarming) this.alarmSince = Date.now()
    this.syncTimer(false)
  }

  private syncTimer(force: boolean): void {
    if (!this.projectorWin) return
    const view = this.timerView()
    const key = `${view.status}|${view.remainingSec}|${view.alarming}|${view.durationSec}|${JSON.stringify(view.warnings)}`
    if (!force && key === this.lastTimerKey) return
    this.lastTimerKey = key
    if (force) this.lastTimerCmd = Date.now()
    const onAir = this.onAir()
    onAir?.sendTimer({ remaining: view.status === 'idle' ? null : view.remainingSec, isRunning: view.status === 'running', isDone: view.alarming })
    // UXD202 decks show the countdown in their own navbar; everything else gets the overlay.
    const deckShowsTimer = !!onAir && onAir.adapter === 'uxd202' && onAir.ownTimer
    this.projectorWin.setOverlayVisible(this.projecting && !deckShowsTimer && view.status !== 'idle')
    const overlay = this.projectorWin.overlay.webContents
    if (!overlay.isDestroyed()) overlay.send('timer', view)
    this.emit()
  }

  private timerView(): TimerView {
    return { status: this.timer.status, remainingSec: T.remainingSec(this.timer), durationSec: this.timer.durationSec, alarming: this.timer.alarming, warnings: this.warnings }
  }

  private plannedMinutes(): number | null {
    const p = this.onAir()
    if (!p) return null
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
    next.view.setBorderRadius(CONSOLE_VIEW_RADIUS)
    next.view.setVisible(true)
    next.setBaseZoom(r.width / Math.max(1, this.layoutSize(this.previewSource()).width))
  }

  /** The size a content's deck is laid out for: its projector's, else the main projector's. */
  private layoutSize(o: Output): { width: number; height: number } {
    const n = this.shownOn(o)
    const extra = n !== null && n > 1 ? this.extras.get(n) : undefined
    return extra ? extra.screen.contentSize() : this.targetSize()
  }

  /** Not projecting: the screen on air is shown live in the console's current pane. */
  private applyCurrent(): void {
    if (this.projecting) return
    const onAir = this.onAir()
    const r = this.currentRect
    if (!onAir) return
    if (!r || !this.hasContent(onAir)) {
      onAir.view.setVisible(false)
      return
    }
    onAir.view.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
    onAir.view.setBorderRadius(CONSOLE_VIEW_RADIUS)
    onAir.view.setVisible(true)
    onAir.setBaseZoom(r.width / Math.max(1, this.targetSize().width))
  }

  /** The content on Projector 1 (before projecting: in the current pane), if any. */
  private onAir(): Output | null {
    return this.onAirId ? (this.outputs.get(this.onAirId) ?? null) : null
  }

  /** The projector showing this content: 1, 2 …, or null while it waits. */
  private shownOn(o: Output): number | null {
    if (o.id === this.onAirId) return 1
    for (const [n, x] of this.extras) if (x.contentId === o.id) return n
    return null
  }

  private nextProjectorNumber(): number {
    let n = 2
    while (this.extras.has(n)) n++
    return n
  }

  /** Projector n opens full screen on a display nobody uses yet, else as a window. */
  private createProjector(n: number): void {
    const used = new Set<number>([consoleDisplay().id])
    const main = projectorDisplay()
    if (main) used.add(main.id)
    for (const x of this.extras.values()) if (x.displayId !== null) used.add(x.displayId)
    const display = screen.getAllDisplays().find((d) => !used.has(d.id)) ?? null
    const roller = this.createRollerOverlay()
    const screenWin = new ProjectorScreen(
      n,
      roller.view,
      this.strings().extraProjectorTitle(n),
      display,
      () => this.emit(),
      () => {
        const x = this.extras.get(n)
        const shown = x?.contentId ? this.outputs.get(x.contentId) : undefined
        if (shown && shown === this.previewSource()) this.applyPreview()
        this.emit()
      },
      () => this.onProjectorClosed(n)
    )
    this.extras.set(n, { screen: screenWin, roller, contentId: null, displayId: display?.id ?? null })
    // A projector opened while the others are black or white starts the same way.
    screenWin.setBlank(this.blank)
  }

  /** The teacher closed Projector n: its content waits, keeping its page. */
  private onProjectorClosed(n: number): void {
    const x = this.extras.get(n)
    if (!x) return
    this.extras.delete(n)
    const shown = x.contentId ? this.outputs.get(x.contentId) : undefined
    shown?.view.setVisible(false)
    x.roller.destroy()
    if (this.roller.showing && this.audienceRollers().length === 0) this.roller.showing = false
    this.emit()
  }

  private setExtraContent(n: number, o: Output | null): void {
    const x = this.extras.get(n)
    if (!x) return
    const before = x.contentId ? this.outputs.get(x.contentId) : undefined
    x.contentId = o?.id ?? null
    x.screen.show(o?.view ?? null)
    if (before && before !== o) before.view.setVisible(false)
    if (o) o.setBaseZoom(1)
  }

  /** Projector 1 shows nothing for a moment. */
  private clearStage(): void {
    const o = this.onAir()
    if (!o) return
    this.leaveStage(o)
    this.onAirId = null
  }

  /** Marks belong to what the audience saw on Projector 1; they clear when it shows something else. */
  private afterStageChange(): void {
    const onAir = this.onAir()
    if (onAir) this.applyInk(onAir.id, { t: 'clear' }, 'main')
    else if (this.projecting) this.consoleContents()?.send('ink:op', { t: 'clear' })
    this.inkPage = onAir?.shownIndex() ?? -1
    this.sendInkSettings()
    if (this.timer.status === 'idle') this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
    this.applyCurrent()
    setTimeout(() => void this.captureMirror(), 300)
  }

  private hasContent(o: Output): boolean {
    return o.deck !== null || o.capture !== null
  }

  /** Off Projector 1: it waits out of sight, keeping its page. */
  private leaveStage(o: Output): void {
    if (this.projecting) this.projectorWin.detach(o.view)
    else this.consoleWin.win.contentView.removeChildView(o.view)
    o.escapeStops = false
    o.view.setVisible(false)
  }

  private enterStage(o: Output): void {
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
      const onAir = this.onAir()
      if (!onAir) return
      const img = await onAir.view.webContents.capturePage()
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
    const r = await dialog.showOpenDialog(this.consoleWin.win, { title, defaultPath: this.deckFolder(), properties: ['openFile'], filters: [{ name: this.strings().deckFilter, extensions: DECK_EXTENSIONS }] })
    if (r.canceled || !r.filePaths[0]) return null
    const deck = this.toDeck(r.filePaths[0])
    this.rememberFolder(deck.path)
    return deck
  }

  /** Where Open deck starts: the folder of the deck opened last (any way: dialog, drop, Recent). */
  deckFolder(): string | undefined {
    if (this.lastFolder && fs.existsSync(this.lastFolder)) return this.lastFolder
    const recent = this.recent[0]?.path
    return recent ? path.dirname(recent) : undefined
  }

  private rememberFolder(deckPath: string): void {
    const folder = path.dirname(deckPath)
    if (folder === this.lastFolder) return
    this.lastFolder = folder
    saveFolder(folder)
  }

  /** One spelling per file (C:/a vs C:\a), so the recent list and zoom memory see the same deck. */
  private toDeck(filePath: string): DeckRef {
    const full = path.resolve(filePath)
    return { path: full, name: deckTitle(full) }
  }

  private remember(deck: DeckRef): void {
    this.recent = mergeRecent(this.recent, deck)
    saveRecent(this.recent)
    this.rememberFolder(deck.path)
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
    const state = this.getState()
    wc.send('state', state)
    const bar = this.tools?.toolbar.webContents
    if (bar && !bar.isDestroyed()) bar.send('state', state)
  }

  private quit(): void {
    if (this.quitting) return
    this.quitting = true
    this.windows.dispose()
    this.tools?.destroy()
    app.quit()
  }
}
