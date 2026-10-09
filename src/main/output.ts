import { WebContentsView, session, shell } from 'electron'
import { inkKeyAction, type InkTool } from '../shared/ink'
import { blankKey, commandKey, keyIntent, type BlankKind, type CommandKey } from '../shared/keys'
import { clampIndex } from '../shared/nav'
import { zoomKey, type ZoomDirection } from '../shared/zoom'
import type { AdapterKind, DeckRef, KeyIntent, Milestone, OutputKind, OutputView, SlideMeta } from '../shared/types'
import { deckKind } from '../shared/deckKinds'
import { FRAMEWORK_BRIDGE } from './bridges'
import type { PreparedDeck } from './convert'
import { deckUrl } from './deckPaths'
import { installDeckProtocol, registerDeckFolder } from './deckProtocol'
import { IS_MAC } from './platform'

/** SLIDE_STATE as sent by the UXD202 FloatingNavbar. */
export interface DeckStateMsg {
  currentSlide: number
  totalSlides: number
  currentTitle?: string
  metadata?: SlideMeta[]
  milestones?: Milestone[]
  timer?: { remaining: number | null; isRunning: boolean; isDone: boolean }
  /** False for decks without their own timer display (the built-in PDF/PPT viewer). */
  ownTimer?: boolean
  /** The shown slide's videos and sounds (built-in viewer), and the one playing. */
  media?: { kinds: Array<'video' | 'audio'>; playing: number | null }
}

export interface TimerSync {
  remaining: number | null
  isRunning: boolean
  isDone: boolean
}

export type OutputEvent =
  | { type: 'key'; intent: KeyIntent }
  | { type: 'command'; command: CommandKey }
  | { type: 'ink-undo' }
  | { type: 'blank'; kind: BlankKind }
  | { type: 'zoom'; direction: ZoomDirection }
  | { type: 'anykey' }
  | { type: 'state'; msg: DeckStateMsg; userMoved: boolean }
  | { type: 'loaded' }
  | { type: 'changed' }

export interface OutputOptions {
  id: string
  screenNumber: number
  kind: OutputKind
  linked: boolean
  index: number
  preload: string
  onEvent: (output: Output, event: OutputEvent) => void
}

/** Wait this long for a UXD202 answer before falling back to arrow keys. */
const DETECT_MS = 3000
/** A GOTO may take this long; mismatching reports inside the window are echoes, not user moves. */
const PENDING_MS = 1500
/** Injected keys reach before-input-event within this window. */
const BYPASS_MS = 1000
const ARROWS = {
  next: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
  prev: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 }
}

let sessionSeq = 0

export class Output {
  static readonly byContents = new Map<number, Output>()
  /** The marking tool in use (set by the store); Esc leaves it on any screen. */
  static inkTool: InkTool = 'pointer'

  readonly id: string
  readonly kind: OutputKind
  readonly view: WebContentsView
  readonly screenNumber: number
  linked: boolean
  index: number
  deck: DeckRef | null = null
  /** The files actually shown (a PowerPoint deck shows its converted copy). */
  prepared: PreparedDeck | null = null
  adapter: AdapterKind = 'none'
  total: number | null = null
  slides: SlideMeta[] = []
  /** The shown slide's videos and sounds (built-in viewer); null = none. */
  media: { kinds: Array<'video' | 'audio'>; playing: number | null } | null = null
  milestones: Milestone[] = []
  editing = false
  fullscreen = false
  /** Extra screens opened with "same deck" reload when the main deck changes. */
  followsMain = false
  /** True while this deck is on the projector: Esc then stops projecting instead of reaching the deck. */
  escapeStops = false
  /** Window screens: the program window shown live. */
  capture: { sourceId: string; name: string } | null = null
  /** Teacher-chosen page zoom in percent (字号). */
  zoomPercent = 100
  /** The deck shows the countdown itself (UXD202 navbar); otherwise the projector overlay does. */
  ownTimer = true
  /** Fit factor from the place the view is shown (a small console pane shrinks a full-size deck). */
  private baseZoom = 1

  private readonly emit: (event: OutputEvent) => void
  private readonly contentsId: number
  private pendingTarget: number | null = null
  private pendingUntil = 0
  private keysAt = 0
  private bypass = 0
  private bypassUntil = 0
  private detectTimer: NodeJS.Timeout | null = null

  constructor(opts: OutputOptions) {
    this.id = opts.id
    this.kind = opts.kind
    this.screenNumber = opts.screenNumber
    this.linked = opts.linked
    this.index = opts.index
    this.emit = (event) => opts.onEvent(this, event)

    const ses = session.fromPartition(`out-${opts.id}-${sessionSeq++}`)
    installDeckProtocol(ses)
    this.view = new WebContentsView({
      webPreferences: { session: ses, preload: opts.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
    })
    this.view.setBackgroundColor('#000000')
    const wc = this.view.webContents
    this.contentsId = wc.id
    Output.byContents.set(wc.id, this)

    wc.on('before-input-event', (event, input) => {
      if (this.bypass > 0 && Date.now() < this.bypassUntil && (input.key === 'ArrowRight' || input.key === 'ArrowLeft')) {
        this.bypass--
        return
      }
      const zoom = zoomKey(input.key, input)
      if (zoom) {
        event.preventDefault()
        if (input.type === 'keyDown') this.emit({ type: 'zoom', direction: zoom })
        return
      }
      if (this.editing) return
      // Marks: Ctrl+Z (⌘Z) undoes; Esc leaves a drawing tool, also on a slide in the console before projecting.
      const ink = inkKeyAction(input.key, input, IS_MAC, Output.inkTool)
      if (ink?.type === 'undo' || (ink?.type === 'pointer' && input.key === 'Escape')) {
        event.preventDefault()
        if (input.type === 'keyDown') this.emit(ink.type === 'undo' ? { type: 'ink-undo' } : { type: 'command', command: 'stop-project' })
        return
      }
      // B / W on a projector: black or white screen (as in PowerPoint).
      const blank = this.escapeStops ? blankKey(input.key, input) : null
      if (blank) {
        event.preventDefault()
        if (input.type === 'keyDown') this.emit({ type: 'blank', kind: blank })
        return
      }
      const command = commandKey(input.key, input)
      if (command === 'project' || (command === 'stop-project' && this.escapeStops)) {
        event.preventDefault()
        if (input.type === 'keyDown') this.emit({ type: 'command', command })
        return
      }
      const intent = keyIntent(input.key, input)
      if (!intent) {
        if (input.type === 'keyDown') this.emit({ type: 'anykey' })
        return
      }
      event.preventDefault()
      if (input.type === 'keyDown') this.emit({ type: 'key', intent })
    })
    // Ctrl + mouse wheel.
    wc.on('zoom-changed', (_event, direction) => this.emit({ type: 'zoom', direction: direction === 'in' ? 'in' : 'out' }))
    wc.on('did-finish-load', () => {
      this.applyZoom()
      // HTML decks built with Reveal.js, remark, impress.js or Marp get connected by their own APIs.
      if (this.deck && deckKind(this.deck.path) === 'html') void wc.executeJavaScript(FRAMEWORK_BRIDGE).catch(() => undefined)
      this.emit({ type: 'loaded' })
      if (this.detectTimer) clearTimeout(this.detectTimer)
      this.detectTimer = setTimeout(() => {
        if (this.adapter === 'loading') this.setAdapter('keys')
      }, DETECT_MS)
    })
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    wc.on('will-navigate', (event, url) => {
      if (url.startsWith('deck://')) return
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    })
  }

  setBaseZoom(factor: number): void {
    this.baseZoom = factor
    this.applyZoom()
  }

  setZoomPercent(percent: number): void {
    this.zoomPercent = percent
    this.applyZoom()
  }

  shownIndex(): number {
    return clampIndex(this.index, this.total)
  }

  load(deck: DeckRef, prepared: PreparedDeck): void {
    const { host, url } = deckUrl(prepared.folder, prepared.entry, this.id)
    registerDeckFolder(host, prepared.folder)
    this.deck = deck
    this.prepared = prepared
    this.ownTimer = true
    this.adapter = 'loading'
    this.total = null
    this.slides = []
    this.milestones = []
    this.keysAt = 0
    this.pendingTarget = null
    void this.view.webContents.loadURL(url)
    this.emit({ type: 'changed' })
  }

  /** Move to a logical index and drive the deck there. */
  moveTo(logical: number): void {
    this.index = logical
    this.sync()
  }

  /** Accept an index the deck already shows (the teacher clicked inside the deck). */
  acceptIndex(index: number): void {
    this.index = index
    this.keysAt = index
  }

  receiveState(msg: DeckStateMsg): void {
    if (typeof msg.totalSlides === 'number') this.total = msg.totalSlides
    this.media = msg.media && msg.media.kinds.length > 0 ? msg.media : null
    if (msg.metadata && msg.metadata.length > 0) this.slides = msg.metadata
    if (msg.milestones) this.milestones = msg.milestones
    this.ownTimer = msg.ownTimer !== false
    if (this.adapter !== 'uxd202') this.setAdapter('uxd202')
    const current = msg.currentSlide
    if (this.pendingTarget !== null) {
      if (current === this.pendingTarget) this.pendingTarget = null
      else if (Date.now() < this.pendingUntil) {
        this.emit({ type: 'state', msg, userMoved: false })
        return
      } else this.pendingTarget = null
    }
    this.emit({ type: 'state', msg, userMoved: current !== this.shownIndex() })
  }

  sendTimer(t: TimerSync): void {
    if (this.adapter === 'uxd202') this.send({ type: 'SYNC_TIMER', ...t })
  }

  toView(): OutputView {
    const shown = this.shownIndex()
    return {
      id: this.id,
      screenNumber: this.screenNumber,
      kind: this.kind,
      deck: this.deck,
      adapter: this.adapter,
      index: this.index,
      shownIndex: shown,
      total: this.total,
      linked: this.linked,
      title: this.slides[shown]?.title ?? '',
      fullscreen: this.fullscreen,
      zoomPercent: this.zoomPercent,
      deckKind: this.deck ? deckKind(this.deck.path) : null,
      captureName: this.capture?.name ?? null,
      media: this.media,
      shownOn: null
    }
  }

  destroy(): void {
    if (this.detectTimer) clearTimeout(this.detectTimer)
    Output.byContents.delete(this.contentsId)
    const wc = this.view.webContents
    if (!wc.isDestroyed()) {
      if (wc.debugger.isAttached()) wc.debugger.detach()
      wc.close()
    }
  }

  /** Chromium accepts zoom factors from 0.25 to 5. */
  private applyZoom(): void {
    const wc = this.view.webContents
    if (wc.isDestroyed()) return
    wc.setZoomFactor(Math.min(5, Math.max(0.25, (this.baseZoom * this.zoomPercent) / 100)))
  }

  private setAdapter(kind: AdapterKind): void {
    if (this.detectTimer) {
      clearTimeout(this.detectTimer)
      this.detectTimer = null
    }
    this.adapter = kind
    if (kind === 'keys') this.keysAt = 0
    this.sync()
    this.emit({ type: 'changed' })
  }

  private sync(): void {
    const target = this.shownIndex()
    if (this.adapter === 'uxd202') {
      this.pendingTarget = target
      this.pendingUntil = Date.now() + PENDING_MS
      this.send({ type: 'GOTO', slideIndex: target })
    } else if (this.adapter === 'keys') {
      const delta = target - this.keysAt
      this.keysAt = target
      void this.pressKeys(delta)
    }
  }

  /** Play or pause a video or sound of the shown slide (built-in viewer). */
  toggleMedia(index: number): void {
    this.send({ type: 'MEDIA', action: 'toggle', index })
  }

  private send(cmd: Record<string, unknown>): void {
    const wc = this.view.webContents
    if (!wc.isDestroyed()) wc.send('deck:cmd', cmd)
  }

  /** Trusted arrow keys over the DevTools protocol; works without window focus. */
  private async pressKeys(delta: number): Promise<void> {
    const wc = this.view.webContents
    if (delta === 0 || wc.isDestroyed()) return
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      const key = delta > 0 ? ARROWS.next : ARROWS.prev
      for (let i = 0; i < Math.abs(delta); i++) {
        this.bypass += 2
        this.bypassUntil = Date.now() + BYPASS_MS
        await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
        await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
      }
    } catch {
      // The deck closed or reloaded mid-press; the next move re-syncs from keysAt.
    }
  }
}
