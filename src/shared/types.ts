import type { TimerWarning } from './timer'
import type { DeckKind } from './deckKinds'
import type { GuideFile } from './guide'
import type { InkOp, InkSettings, InkStroke, InkTool } from './ink'
import type { DeckErrorCode } from './lang'
import type { RollStep } from './roller'
import type { ZoomDirection } from './zoom'

export type OutputId = string
/** projector = the main deck (Screen 1) · window = an extra deck screen · capture = another program's window, shown live · preview = the next-slide preview */
export type OutputKind = 'projector' | 'preview' | 'window' | 'capture'
/** none = no deck · loading = waiting for the deck to answer · uxd202 = UXD202 sync protocol · keys = any HTML, arrow keys only */
export type AdapterKind = 'none' | 'loading' | 'uxd202' | 'keys'

export interface DeckRef {
  path: string
  name: string
}

export interface SlideMeta {
  title?: string
  section?: string
  sectionLabel?: string
  minutes?: number
  notes?: string
}

export interface Milestone {
  id?: string
  label: string
  slideIndex: number
  range?: [number, number]
}

export interface OutputView {
  id: OutputId
  kind: OutputKind
  /** 1 = projector; extra screens are numbered from 2. The next preview is not a screen (0). */
  screenNumber: number
  deck: DeckRef | null
  adapter: AdapterKind
  /** Logical index; may run past the deck end to keep a linked offset. */
  index: number
  /** Index the deck actually shows. */
  shownIndex: number
  total: number | null
  linked: boolean
  title: string
  fullscreen: boolean
  /** Page zoom in percent (字号); the next preview follows the screen it previews. */
  zoomPercent: number
  deckKind: DeckKind | null
  /** Window screens: the title of the program window they show. */
  captureName: string | null
  /** The projector showing this content (1 = main projector), or null while it waits. */
  shownOn: number | null
}

/** The speaker's own timer (never shown to the audience). Times are Date.now() values. */
export interface SpeakerTimerView {
  /** up = count up, down = count down from minutes, clock = from a start clock time to an end clock time (it starts by itself). */
  mode: SpeakerMode
  minutes: number
  startedAt: number | null
  heldMs: number
  /** Class periods for mode 'clock' (From–to). */
  periods: ClockPeriod[]
  /** Today's change of one period's end with ± (seconds; not remembered). key = date#period. */
  clockExtra: { key: string; sec: number } | null
}

/** A class period: on these weekdays (0 = Sunday … 6 = Saturday), from a clock time to a clock time (seconds after midnight). */
export interface ClockPeriod {
  days: number[]
  fromSec: number
  untilSec: number
}

export type SpeakerMode = 'up' | 'down' | 'clock'

/** Projector 2, 3 …: extra audience screens the teacher opened. */
export interface ProjectorView {
  number: number
  contentId: OutputId | null
  fullscreen: boolean
}

/** A program window that can become a window screen. */
export interface WindowSource {
  id: string
  /** Window title. */
  name: string
  /** Program name, e.g. "Microsoft Edge" ('' when unknown). */
  app: string
  /** Live picture as a PNG data URL; '' for a minimized window (it has no picture). */
  thumbnail: string
  /** Program icon as a PNG data URL ('' when unknown). */
  icon: string
  minimized: boolean
}

/** Opening a deck: PowerPoint files are converted first, which takes a moment. */
export interface DeckStatus {
  state: 'ready' | 'converting' | 'error'
  name?: string
  code?: DeckErrorCode
  /** Technical detail for an error (shown small). */
  detail?: string
}

export interface TimerView {
  status: 'idle' | 'running' | 'paused' | 'done'
  remainingSec: number
  durationSec: number
  alarming: boolean
  /** Warning bells: beep a set number of times when a set time is left. Empty = no bells. */
  warnings: TimerWarning[]
}

export interface RollerListInfo {
  id: string
  name: string
  count: number
}

export interface RollerPersonView {
  id: string
  name: string
  /** Times picked in this app session. */
  wins: number
}

export interface RollerRoll {
  rollId: number
  path: RollStep[]
  winner: number
  /** Wall-clock start, shared by every screen so they roll in step. */
  startAt: number
}

/** 抽人 state for the console. */
export interface RollerView {
  lists: RollerListInfo[]
  activeListId: string | null
  activeText: string
  people: RollerPersonView[]
  superLucky: boolean
  roll: RollerRoll | null
  /** The roll (or the groups) is on the students' screens right now. */
  showing: boolean
  /** The last random groups (names), until another roll, list or reset. */
  groups: string[][] | null
}

/** What a students' screen needs to play one roll. */
export interface RollerPlay {
  people: RollerPersonView[]
  path: RollStep[]
  winner: number
  startAt: number
  /** Only one screen plays the sound. */
  sound: boolean
}

/** The console's look. */
export type UiTheme = 'light' | 'dark'

export interface AppState {
  outputs: OutputView[]
  selectedId: OutputId
  mainDeck: DeckRef | null
  /** Slide list and notes of the selected screen (the projector when the selection has no deck). */
  slides: SlideMeta[]
  /** The content on Projector 1 (before projecting: in the current pane); null = nothing. Selecting a card does not change it. */
  onAirId: OutputId | null
  /** Projector 2, 3 … in number order. */
  projectors: ProjectorView[]
  speaker: SpeakerTimerView
  /** The program window in front that the floating tools serve (null = tools hidden). */
  toolsFor: OutputId | null
  /** The screen `slides` belongs to: the selected one (the next preview counts), else the projector. */
  slidesOf: OutputId
  /** The screen the next preview follows: the last selected real screen. */
  previewOf: OutputId
  /** Size the previewed screen's deck is laid out for (sets the preview's shape). */
  previewSize: { width: number; height: number }
  /** Jump points of the projector deck. */
  milestones: Milestone[]
  timer: TimerView
  plannedMinutes: number | null
  recent: DeckRef[]
  hasExternalDisplay: boolean
  /** True while the projector window shows the deck; false = the deck lives in the console only. */
  projecting: boolean
  /** Size the deck is laid out for (projector content, external display, or 1280x720). */
  projectorSize: { width: number; height: number }
  roller: RollerView
  deckStatus: DeckStatus
  /** Marking tool and colour, shared by the console toolbar and the projector palette. */
  ink: InkSettings
  /** Part of the slide (or window) on Projector 1 is enlarged with the zoom tool. */
  zoomed: boolean
  /** Light or dark console; null = follow the computer's setting. */
  theme: UiTheme | null
  /** The projectors are black or white (B / W); null = the slides show. */
  blank: 'black' | 'white' | null
  /** The main deck opened again on the page it showed last (0-based), for a short notice; null otherwise. */
  resumedAt: number | null
}

export type NavAction =
  | { type: 'step'; delta: number }
  | { type: 'goto'; index: number }
  | { type: 'first' }
  | { type: 'last' }

export type KeyIntent = 'next' | 'prev' | 'first' | 'last'

export interface PreviewRect {
  x: number
  y: number
  width: number
  height: number
}

/** API the console preload exposes as window.presenter. */
export interface ConsoleApi {
  onState(cb: (state: AppState) => void): void
  /** Show a content on Projector n, on a new projector, or nowhere (null: it waits, keeping its page). */
  showOn(id: OutputId, target: number | 'new' | null): void
  projectorFullscreen(n: number): void
  speakerMode(mode: SpeakerMode): void
  /** My timer's class periods (From–to). Remembered. */
  speakerPeriods(periods: ClockPeriod[]): void
  speakerMinutes(minutes: number): void
  speakerToggle(): void
  speakerReset(): void
  /** Adds seconds to My timer (negative: takes them away). */
  speakerAdjust(deltaSec: number): void
  /** Sets the class timer's time while it is stopped. */
  timerSet(sec: number): void
  /** Adds seconds to the class timer (negative: takes them away). */
  timerAdjust(deltaSec: number): void
  setTheme(theme: UiTheme): void
  /** Black or white projectors (null = show the slides again). The same kind again also shows them again. */
  setBlank(kind: 'black' | 'white' | null): void
  /** The floating toolbar page reports its size. */
  toolbarSize(width: number, height: number): void
  closeProjector(n: number): void
  listWindows(): Promise<WindowSource[]>
  /** show = put it on Projector 1 at once (the start screen's choice); otherwise it waits. */
  addWindowScreen(id: string, name: string, show?: boolean): void
  onMirror(cb: (jpeg: Uint8Array) => void): void
  openDialog(): void
  openPath(path: string): void
  pathForFile(file: File): string
  navigate(action: NavAction): void
  key(intent: KeyIntent): void
  select(id: OutputId): void
  setLinked(id: OutputId, linked: boolean): void
  nudge(id: OutputId, delta: number): void
  addScreen(sameDeck: boolean): void
  /** A whiteboard (blank pages to draw on); show = straight onto Projector 1. */
  addWhiteboard(show?: boolean): void
  removeScreen(id: OutputId): void
  timerStart(sec: number): void
  timerToggle(): void
  timerReset(): void
  timerDismiss(): void
  /** The class timer's warning bells (time left and number of beeps each). Remembered. */
  timerWarnings(list: TimerWarning[]): void
  layoutPreview(rect: PreviewRect | null): void
  layoutCurrent(rect: PreviewRect | null): void
  startProjecting(): void
  stopProjecting(): void
  /** id null = the selected screen. */
  zoom(id: OutputId | null, direction: ZoomDirection): void
  rollerRoll(): void
  rollerHide(): void
  rollerReset(): void
  /** Random groups of the active list, shown on the students' screens. */
  rollerGroups(count: number): void
  rollerSetSuperLucky(on: boolean): void
  rollerSelectList(id: string): void
  /** id null = a new list. */
  rollerSaveList(id: string | null, name: string, text: string): void
  rollerDeleteList(id: string): void
  dismissDeckStatus(): void
  setInkTool(tool: InkTool): void
  setInkColor(color: string): void
  /** fromCanvas: the console's own canvas already drew it. */
  inkOp(op: InkOp, fromCanvas: boolean): void
  onInkOp(cb: (op: InkOp) => void): () => void
  inkSnapshot(): Promise<InkStroke[]>
  /** The console reports whether the live video mirror works; otherwise snapshots are sent. */
  mirrorMode(mode: 'video' | 'snapshot'): void
  /** Deck guide: the paste-ready request for AI assistants. */
  guide(): Promise<{ aiRequest: string }>
  copyText(text: string): void
  /** Save dialog; resolves to the saved path, or null when cancelled. */
  saveGuideFile(which: GuideFile): Promise<string | null>
  /** Saves what Projector 1 shows, with its marks, as a PNG (a save dialog); the path, or null. */
  savePicture(): Promise<string | null>
}
