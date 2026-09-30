import type { DeckKind } from './deckKinds'
import type { GuideFile } from './guide'
import type { InkOp, InkSettings, InkStroke, InkTool } from './ink'
import type { DeckErrorCode } from './lang'
import type { RollStep } from './roller'
import type { ZoomDirection } from './zoom'

export type OutputId = string
export type OutputKind = 'projector' | 'preview' | 'window'
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
  /** The roll is on the students' screens right now. */
  showing: boolean
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

export interface AppState {
  outputs: OutputView[]
  selectedId: OutputId
  mainDeck: DeckRef | null
  /** Slide list and notes of the selected screen (the projector when the selection has no deck). */
  slides: SlideMeta[]
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
  removeScreen(id: OutputId): void
  toggleFullscreen(id: OutputId): void
  timerStart(sec: number): void
  timerToggle(): void
  timerReset(): void
  timerDismiss(): void
  layoutPreview(rect: PreviewRect | null): void
  layoutCurrent(rect: PreviewRect | null): void
  startProjecting(): void
  stopProjecting(): void
  /** id null = the selected screen. */
  zoom(id: OutputId | null, direction: ZoomDirection): void
  rollerRoll(): void
  rollerHide(): void
  rollerReset(): void
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
}
