# Presenter Phase 1 (HTML decks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows desktop app that shows any HTML slide deck full-screen on the projector, with a laptop console (projector mirror, next-slide preview, timer, slide list, notes, extra linked screens).

**Architecture:** Electron main process owns all state (outputs, selection, timer). Each screen is an `Output` = a `WebContentsView` with its own session, loaded through a `deck://` protocol. UXD202 decks are driven through their existing `UXD202_SLIDES_SYNC` BroadcastChannel via a preload; any other HTML is driven with trusted arrow keys over the DevTools protocol. A React console renders state pushed from main.

**Tech Stack:** Electron 44, electron-vite 5 (Vite 7), React 19, Tailwind CSS 4, TypeScript 7, Vitest 5, playwright-core (Electron e2e).

**Spec:** `docs/specs/2026-09-27-presenter-design.md`

## Global Constraints

- Vite must stay `^7` (electron-vite 5 peer range ends at 7).
- Preloads build with `externalizeDeps: false` and share no runtime modules (only `import type` from shared), so each bundles to one file and runs sandboxed. (`isolatedEntries` crashes electron-vite 5 when stdout is not a TTY.)
- Deck views: `contextIsolation: true`, `sandbox: true`, own session partition, `backgroundThrottling: false`.
- No network at runtime: no CDN scripts, fonts, or styles.
- Console UI text is Chinese; smallest text is `text-sm` (14 px).
- Never modify anything under `2026-Autumn/UXD202/` (decks are read-only inputs).
- Code blocks whose first line is an `@file <path>` marker are extracted verbatim with `node tools/extract-plan.mjs <plan> <path-prefix>`.

## File map

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | All cross-process types and the console API contract |
| `src/shared/nav.ts` | `planMove` page-turn rule (selected + linked screens) |
| `src/shared/keys.ts` | Key → intent → action mapping |
| `src/shared/timer.ts` | Pure timer state machine |
| `src/shared/format.ts`, `recentList.ts`, `displays.ts` | Small pure helpers |
| `src/main/deckPaths.ts` | `deck://` URL building and path-traversal guard |
| `src/main/deckProtocol.ts` | Scheme registration and per-session handler |
| `src/main/output.ts` | One screen: view, adapter detection, GOTO/keys driving, key interception |
| `src/main/projectorWindow.ts`, `consoleWindow.ts`, `screenWindow.ts` | Window placement and layout |
| `src/main/displays.ts`, `recent.ts` | Display picking, recent-file persistence |
| `src/main/store.ts` | Single source of truth; navigation, timer, mirror, IPC targets |
| `src/main/index.ts` | App bootstrap and IPC wiring |
| `src/preload/deck.ts`, `console.ts`, `overlay.ts` | Bridges for decks, console UI, projector timer overlay |
| `src/renderer/**` | Console React UI and the timer overlay page |
| `test/*.test.ts` | Unit tests for pure modules |
| `e2e/smoke.mjs`, `e2e/fixtures/plain-deck.html` | End-to-end smoke test |

---

### Task 1: Tooling scaffold

**Files:**
- Create: `tools/extract-plan.mjs`, `.gitignore`, `electron.vite.config.ts`, `tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm test`, `npm run build`, `npm run typecheck`, `npm run e2e`; extractor CLI.

- [ ] **Step 1: Write the extractor** (write this file by hand; it cannot extract itself)

```js
// @file tools/extract-plan.mjs
// Writes every code block whose first line is an "@file <path>" marker.
// Usage: node tools/extract-plan.mjs <plan.md> [path-prefix ...]
import fs from 'node:fs'
import path from 'node:path'

const [plan, ...prefixes] = process.argv.slice(2)
const text = fs.readFileSync(plan, 'utf8')
// Fences only count at the start of a line, so backticks inside code do not break alignment.
const block = /^```[a-z]*\r?\n([\s\S]*?)^```[ \t]*$/gm
const marker = /^\s*(?:\/\/|#|<!--|\/\*)\s*@file\s+(.+?)\s*(?:-->|\*\/)?\s*$/
let written = 0
for (const match of text.matchAll(block)) {
  const [first, ...rest] = match[1].split(/\r?\n/)
  const hit = marker.exec(first)
  if (!hit) continue
  const file = hit[1]
  if (prefixes.length && !prefixes.some((p) => file === p || file.startsWith(p))) continue
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, rest.join('\n'))
  console.log('wrote', file)
  written++
}
if (!written) {
  console.error('no @file blocks matched', prefixes)
  process.exit(1)
}
```

- [ ] **Step 2: Extract scaffold files**

```gitignore
# @file .gitignore
node_modules/
out/
dist/
e2e/out/
spike/out/
```

```ts
// @file electron.vite.config.ts
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          deck: resolve(__dirname, 'src/preload/deck.ts'),
          console: resolve(__dirname, 'src/preload/console.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts')
        }
      },
      externalizeDeps: false
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          console: resolve(__dirname, 'src/renderer/console.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        }
      }
    }
  }
})
```

Run: `node tools/extract-plan.mjs docs/superpowers/plans/2026-09-27-presenter-phase1.md .gitignore electron.vite.config.ts`

- [ ] **Step 3: Write `tsconfig.json` and the `package.json` scripts** (JSON has no comment marker; write directly)

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["node"],
    "lib": ["ES2023", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "test"]
}
```

`package.json` scripts:
```json
{
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "start": "electron-vite preview",
  "test": "vitest run",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "e2e": "electron-vite build && node e2e/smoke.mjs"
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold electron-vite project and plan extractor"
```

### Task 2: Pure core — navigation, keys, timer, helpers

**Files:**
- Create: `src/shared/types.ts`, `src/shared/nav.ts`, `src/shared/keys.ts`, `src/shared/timer.ts`, `src/shared/format.ts`, `src/shared/recentList.ts`, `src/shared/displays.ts`
- Test: `test/nav.test.ts`, `test/keys.test.ts`, `test/timer.test.ts`, `test/misc.test.ts`

**Interfaces:**
- Produces: `planMove(outputs: NavOutput[], selectedId: string, action: NavAction): Map<string, number>`, `clampIndex(i, total)`, `keyIntent(key, mods?)`, `intentToAction(intent)`, timer functions `initialTimer/start/pause/resume/toggle/reset/tick/dismiss/remainingSec`, `mmss(sec)`, `mergeRecent(list, deck)`, `RECENT_MAX`, `pickDisplayIds(all, primaryId)`, and all types in `types.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// @file test/nav.test.ts
import { describe, expect, it } from 'vitest'
import { clampIndex, planMove, type NavOutput } from '../src/shared/nav'

const outs = (...o: Array<Partial<NavOutput> & { id: string }>): NavOutput[] =>
  o.map((x) => ({ index: 0, total: 10, linked: true, ...x }))

describe('clampIndex', () => {
  it('keeps the index inside the deck', () => {
    expect(clampIndex(-3, 10)).toBe(0)
    expect(clampIndex(12, 10)).toBe(9)
    expect(clampIndex(4, 10)).toBe(4)
  })
  it('has no upper bound when the total is unknown', () => {
    expect(clampIndex(40, null)).toBe(40)
    expect(clampIndex(-1, null)).toBe(0)
  })
})

describe('planMove', () => {
  it('moves every linked screen when the selected screen is linked', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3 }, { id: 'extra', linked: false })
    expect([...planMove(o, 'projector', { type: 'step', delta: 1 })]).toEqual([['projector', 3], ['next', 4]])
  })
  it('moves only the selected screen when it is not linked', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3, linked: false })
    expect([...planMove(o, 'next', { type: 'step', delta: 1 })]).toEqual([['next', 4]])
  })
  it('leaves linked screens alone when an unlinked screen is selected', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3 }, { id: 'extra', index: 5, linked: false })
    expect([...planMove(o, 'extra', { type: 'step', delta: -1 })]).toEqual([['extra', 4]])
  })
  it('blocks a step past the last page of the selected deck', () => {
    const o = outs({ id: 'projector', index: 9 }, { id: 'next', index: 10 })
    expect(planMove(o, 'projector', { type: 'step', delta: 1 }).size).toBe(0)
  })
  it('blocks a step before the first page', () => {
    const o = outs({ id: 'projector', index: 0 }, { id: 'next', index: 1 })
    expect(planMove(o, 'projector', { type: 'step', delta: -1 }).size).toBe(0)
  })
  it('keeps the offset of a linked screen that runs past its deck end', () => {
    const o = outs({ id: 'projector', index: 8 }, { id: 'next', index: 9 })
    expect([...planMove(o, 'projector', { type: 'step', delta: 1 })]).toEqual([['projector', 9], ['next', 10]])
  })
  it('goto clamps the target and moves the group by the same delta', () => {
    const o = outs({ id: 'projector', index: 2 }, { id: 'next', index: 3 })
    expect([...planMove(o, 'projector', { type: 'goto', index: 20 })]).toEqual([['projector', 9], ['next', 10]])
  })
  it('first and last use the selected deck range', () => {
    const o = outs({ id: 'projector', index: 4 }, { id: 'next', index: 5 })
    expect([...planMove(o, 'projector', { type: 'first' })]).toEqual([['projector', 0], ['next', 1]])
    expect([...planMove(o, 'projector', { type: 'last' })]).toEqual([['projector', 9], ['next', 10]])
  })
  it('allows steps without limit when the total is unknown', () => {
    const o = outs({ id: 'projector', index: 50, total: null })
    expect([...planMove(o, 'projector', { type: 'step', delta: 1 })]).toEqual([['projector', 51]])
    expect(planMove(o, 'projector', { type: 'last' }).size).toBe(0)
  })
  it('returns nothing for an unknown selected screen', () => {
    expect(planMove(outs({ id: 'projector' }), 'nope', { type: 'step', delta: 1 }).size).toBe(0)
  })
})
```

```ts
// @file test/keys.test.ts
import { describe, expect, it } from 'vitest'
import { intentToAction, keyIntent } from '../src/shared/keys'

describe('keyIntent', () => {
  it('maps clicker and arrow keys', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ']) expect(keyIntent(k)).toBe('next')
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) expect(keyIntent(k)).toBe('prev')
    expect(keyIntent('Home')).toBe('first')
    expect(keyIntent('End')).toBe('last')
  })
  it('ignores other keys and shortcuts with modifiers', () => {
    expect(keyIntent('a')).toBeNull()
    expect(keyIntent('ArrowRight', { control: true })).toBeNull()
    expect(keyIntent('PageDown', { alt: true })).toBeNull()
  })
  it('turns intents into navigation actions', () => {
    expect(intentToAction('next')).toEqual({ type: 'step', delta: 1 })
    expect(intentToAction('prev')).toEqual({ type: 'step', delta: -1 })
    expect(intentToAction('first')).toEqual({ type: 'first' })
    expect(intentToAction('last')).toEqual({ type: 'last' })
  })
})
```

```ts
// @file test/timer.test.ts
import { describe, expect, it } from 'vitest'
import * as T from '../src/shared/timer'

describe('timer', () => {
  it('starts running with an end time', () => {
    expect(T.start(T.initialTimer(60), 90, 1000)).toMatchObject({ status: 'running', durationSec: 90, endAt: 91000, alarming: false })
  })
  it('counts down from the end time on tick', () => {
    expect(T.remainingSec(T.tick(T.start(T.initialTimer(), 10, 0), 3500))).toBe(7)
  })
  it('pauses and resumes without losing time', () => {
    let s = T.pause(T.start(T.initialTimer(), 10, 0), 4000)
    expect(s).toMatchObject({ status: 'paused', remainingMs: 6000, endAt: null })
    s = T.resume(s, 100000)
    expect(s.endAt).toBe(106000)
  })
  it('turns done and alarming at zero', () => {
    expect(T.tick(T.start(T.initialTimer(), 5, 0), 5000)).toMatchObject({ status: 'done', remainingMs: 0, alarming: true })
  })
  it('dismiss after done returns to idle with the same duration', () => {
    expect(T.dismiss(T.tick(T.start(T.initialTimer(), 5, 0), 6000))).toMatchObject({ status: 'idle', durationSec: 5, remainingMs: 5000, alarming: false })
  })
  it('toggle starts the default duration when idle', () => {
    expect(T.toggle(T.initialTimer(60), 0, 480)).toMatchObject({ status: 'running', durationSec: 480 })
  })
  it('toggle pauses a running timer and resumes a paused one', () => {
    let s = T.toggle(T.start(T.initialTimer(), 10, 0), 2000, 60)
    expect(s.status).toBe('paused')
    s = T.toggle(s, 5000, 60)
    expect(s).toMatchObject({ status: 'running', endAt: 13000 })
  })
  it('reset returns to idle with a new duration', () => {
    expect(T.reset(T.start(T.initialTimer(), 10, 0), 300)).toMatchObject({ status: 'idle', durationSec: 300, remainingMs: 300000 })
  })
  it('never starts with less than one second', () => {
    expect(T.start(T.initialTimer(), 0, 0).durationSec).toBe(1)
  })
})
```

```ts
// @file test/misc.test.ts
import { describe, expect, it } from 'vitest'
import { pickDisplayIds } from '../src/shared/displays'
import { mmss } from '../src/shared/format'
import { mergeRecent } from '../src/shared/recentList'

describe('mmss', () => {
  it('formats minutes and seconds', () => {
    expect(mmss(0)).toBe('00:00')
    expect(mmss(65)).toBe('01:05')
    expect(mmss(754)).toBe('12:34')
    expect(mmss(-4)).toBe('00:00')
  })
})

describe('mergeRecent', () => {
  it('puts the newest deck first without duplicates', () => {
    const a = { path: 'C:/a.html', name: 'a' }
    const b = { path: 'C:/b.html', name: 'b' }
    expect(mergeRecent([a, b], { path: 'c:/B.html', name: 'b' }).map((d) => d.name)).toEqual(['b', 'a'])
  })
  it('keeps at most ten decks', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ path: `C:/${i}.html`, name: `${i}` }))
    expect(mergeRecent(many, { path: 'C:/new.html', name: 'new' })).toHaveLength(10)
  })
})

describe('pickDisplayIds', () => {
  it('uses one display for everything when only one exists', () => {
    expect(pickDisplayIds([{ id: 1 }], 1)).toEqual({ consoleId: 1, projectorId: null })
  })
  it('puts the console on the internal laptop display', () => {
    expect(pickDisplayIds([{ id: 7, internal: false }, { id: 3, internal: true }], 7)).toEqual({ consoleId: 3, projectorId: 7 })
  })
  it('falls back to the primary display for the console', () => {
    expect(pickDisplayIds([{ id: 1 }, { id: 2 }], 1)).toEqual({ consoleId: 1, projectorId: 2 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, modules `../src/shared/*` not found.

- [ ] **Step 3: Write the implementation**

```ts
// @file src/shared/types.ts
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
  label: string
  kind: OutputKind
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
}

export interface TimerView {
  status: 'idle' | 'running' | 'paused' | 'done'
  remainingSec: number
  durationSec: number
  alarming: boolean
}

export interface AppState {
  outputs: OutputView[]
  selectedId: OutputId
  mainDeck: DeckRef | null
  slides: SlideMeta[]
  milestones: Milestone[]
  timer: TimerView
  plannedMinutes: number | null
  recent: DeckRef[]
  hasExternalDisplay: boolean
  projectorSize: { width: number; height: number }
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
}
```

```ts
// @file src/shared/nav.ts
import type { NavAction } from './types'

export interface NavOutput {
  id: string
  index: number
  total: number | null
  linked: boolean
}

export function clampIndex(index: number, total: number | null): number {
  const last = total === null ? Infinity : Math.max(0, total - 1)
  return Math.min(Math.max(0, index), last)
}

/**
 * The page-turn rule: the selected screen always moves; when it is linked,
 * every other linked screen moves by the same delta. Returns the new logical
 * index for each screen that moves (empty = nothing moves).
 */
export function planMove(outputs: NavOutput[], selectedId: string, action: NavAction): Map<string, number> {
  const moves = new Map<string, number>()
  const selected = outputs.find((o) => o.id === selectedId)
  if (!selected) return moves
  const last = selected.total === null ? null : Math.max(0, selected.total - 1)

  let delta: number
  switch (action.type) {
    case 'step': {
      const target = selected.index + action.delta
      if (action.delta > 0 && last !== null && target > last) return moves
      if (action.delta < 0 && target < 0) return moves
      delta = action.delta
      break
    }
    case 'goto':
      delta = clampIndex(action.index, selected.total) - selected.index
      break
    case 'first':
      delta = -selected.index
      break
    case 'last':
      if (last === null) return moves
      delta = last - selected.index
      break
  }
  if (delta === 0) return moves

  const movers = selected.linked ? outputs.filter((o) => o.linked) : [selected]
  for (const o of movers) moves.set(o.id, o.index + delta)
  return moves
}
```

```ts
// @file src/shared/keys.ts
import type { KeyIntent, NavAction } from './types'

export interface KeyMods {
  control?: boolean
  alt?: boolean
  meta?: boolean
}

/** Keys a presenter clicker or keyboard uses to turn pages. */
export function keyIntent(key: string, mods: KeyMods = {}): KeyIntent | null {
  if (mods.control || mods.alt || mods.meta) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'prev'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    default:
      return null
  }
}

export function intentToAction(intent: KeyIntent): NavAction {
  switch (intent) {
    case 'next':
      return { type: 'step', delta: 1 }
    case 'prev':
      return { type: 'step', delta: -1 }
    case 'first':
      return { type: 'first' }
    case 'last':
      return { type: 'last' }
  }
}
```

```ts
// @file src/shared/timer.ts
export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export interface TimerState {
  status: TimerStatus
  durationSec: number
  remainingMs: number
  /** Wall-clock end time while running; null otherwise. */
  endAt: number | null
  alarming: boolean
}

export function initialTimer(durationSec = 60): TimerState {
  return { status: 'idle', durationSec, remainingMs: durationSec * 1000, endAt: null, alarming: false }
}

export function start(_s: TimerState, durationSec: number, now: number): TimerState {
  const d = Math.max(1, Math.round(durationSec))
  return { status: 'running', durationSec: d, remainingMs: d * 1000, endAt: now + d * 1000, alarming: false }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.endAt === null) return s
  return { ...s, status: 'paused', remainingMs: Math.max(0, s.endAt - now), endAt: null }
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s
  return { ...s, status: 'running', endAt: now + s.remainingMs }
}

export function reset(s: TimerState, durationSec = s.durationSec): TimerState {
  return initialTimer(Math.max(1, Math.round(durationSec)))
}

export function toggle(s: TimerState, now: number, defaultSec: number): TimerState {
  switch (s.status) {
    case 'running':
      return pause(s, now)
    case 'paused':
      return resume(s, now)
    case 'idle':
      return start(s, defaultSec, now)
    case 'done':
      return reset(s)
  }
}

export function tick(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.endAt === null) return s
  const remainingMs = Math.max(0, s.endAt - now)
  if (remainingMs === 0) return { ...s, status: 'done', remainingMs: 0, endAt: null, alarming: true }
  return { ...s, remainingMs }
}

export function dismiss(s: TimerState): TimerState {
  return s.status === 'done' ? reset(s) : { ...s, alarming: false }
}

export function remainingSec(s: TimerState): number {
  return Math.ceil(s.remainingMs / 1000)
}
```

```ts
// @file src/shared/format.ts
export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
```

```ts
// @file src/shared/recentList.ts
import type { DeckRef } from './types'

export const RECENT_MAX = 10

export function mergeRecent(list: DeckRef[], deck: DeckRef): DeckRef[] {
  const key = deck.path.toLowerCase()
  return [deck, ...list.filter((d) => d.path.toLowerCase() !== key)].slice(0, RECENT_MAX)
}
```

```ts
// @file src/shared/displays.ts
export interface DisplayLike {
  id: number
  internal?: boolean
}

/** Console goes on the laptop (internal) display; the projector is any other display. */
export function pickDisplayIds(all: DisplayLike[], primaryId: number): { consoleId: number; projectorId: number | null } {
  if (all.length < 2) return { consoleId: primaryId, projectorId: null }
  const internal = all.find((d) => d.internal)
  const consoleId = internal ? internal.id : primaryId
  const projector = all.find((d) => d.id !== consoleId)
  return { consoleId, projectorId: projector ? projector.id : null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (4 files).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure navigation, key, timer and helper modules with tests"
```

### Task 3: Deck paths and `deck://` protocol

**Files:**
- Create: `src/main/deckPaths.ts`, `src/main/deckProtocol.ts`
- Test: `test/deckPaths.test.ts`

**Interfaces:**
- Produces: `deckHostId(folder): string`, `deckUrl(filePath, outputId): { host, folder, url }`, `resolveDeckRequest(folder, pathname): string | null`, `registerDeckScheme()`, `registerDeckFolder(host, folder)`, `installDeckProtocol(session)`.

- [ ] **Step 1: Write the failing test**

```ts
// @file test/deckPaths.test.ts
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { deckHostId, deckUrl, resolveDeckRequest } from '../src/main/deckPaths'

const folder = path.resolve('C:/decks/week 8')

describe('deck paths', () => {
  it('maps a deck file to a deck:// url on its own host', () => {
    const r = deckUrl(path.join(folder, 'Week 8.html'), 'projector')
    expect(r.folder).toBe(folder)
    expect(r.host).toMatch(/^[0-9a-f]{16}$/)
    expect(r.url).toBe(`deck://${r.host}/Week%208.html?tabId=projector`)
  })
  it('gives the same host to the same folder in any letter case', () => {
    expect(deckHostId('C:/Decks/A')).toBe(deckHostId('c:/decks/a'))
  })
  it('resolves files and sub-folders inside the deck folder', () => {
    expect(resolveDeckRequest(folder, '/Week%208.html')).toBe(path.join(folder, 'Week 8.html'))
    expect(resolveDeckRequest(folder, '/assets/img%201.png')).toBe(path.join(folder, 'assets', 'img 1.png'))
  })
  it('rejects paths that leave the deck folder', () => {
    expect(resolveDeckRequest(folder, '/%2e%2e/secret.txt')).toBeNull()
    expect(resolveDeckRequest(folder, '/..%5C..%5Cwindows%5Cwin.ini')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- deckPaths` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// @file src/main/deckPaths.ts
import crypto from 'node:crypto'
import path from 'node:path'

/** One stable, valid host name per deck folder (so each folder is its own origin). */
export function deckHostId(folder: string): string {
  return crypto.createHash('sha1').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0, 16)
}

export function deckUrl(filePath: string, outputId: string): { host: string; folder: string; url: string } {
  const full = path.resolve(filePath)
  const folder = path.dirname(full)
  const host = deckHostId(folder)
  const url = `deck://${host}/${encodeURIComponent(path.basename(full))}?tabId=${encodeURIComponent(outputId)}`
  return { host, folder, url }
}

/** Maps a request path to a file inside the deck folder; null when it would leave the folder. */
export function resolveDeckRequest(folder: string, pathname: string): string | null {
  let rel: string
  try {
    rel = decodeURIComponent(pathname).replace(/^[/\\]+/, '')
  } catch {
    return null
  }
  const root = path.resolve(folder)
  const full = path.resolve(root, rel)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}
```

```ts
// @file src/main/deckProtocol.ts
import { net, protocol, type Session } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveDeckRequest } from './deckPaths'

export const DECK_SCHEME = 'deck'
const folders = new Map<string, string>()

/** Must run before app 'ready'. */
export function registerDeckScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: DECK_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
  ])
}

export function registerDeckFolder(host: string, folder: string): void {
  folders.set(host, folder)
}

export function installDeckProtocol(ses: Session): void {
  if (ses.protocol.isProtocolHandled(DECK_SCHEME)) return
  ses.protocol.handle(DECK_SCHEME, async (request) => {
    const url = new URL(request.url)
    const folder = folders.get(url.hostname)
    if (!folder) return new Response('Unknown deck', { status: 404 })
    const file = resolveDeckRequest(folder, url.pathname)
    if (!file) return new Response('Forbidden', { status: 403 })
    try {
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
```

- [ ] **Step 4: Run tests** — `npm test` — Expected: PASS (5 files).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: deck:// protocol with path guard"`

### Task 4: Output (one screen) and the deck preload

**Files:**
- Create: `src/preload/deck.ts`, `src/main/output.ts`

**Interfaces:**
- Consumes: `clampIndex`, `keyIntent`, `deckUrl`, `installDeckProtocol`, `registerDeckFolder`, types.
- Produces: `class Output` with `static byContents: Map<number, Output>`, fields `id, kind, view, label, linked, index, deck, adapter, total, slides, milestones, editing, fullscreen, followsMain`, methods `shownIndex()`, `load(deck)`, `moveTo(logical)`, `acceptIndex(i)`, `receiveState(msg)`, `sendTimer(t)`, `toView()`, `destroy()`; `OutputEvent` union `key | anykey | state | loaded | changed`; `DeckStateMsg`; `TimerSync`. IPC from deck preload: `deck:state`, `deck:editing`, `deck:pointer`; to deck: `deck:cmd`.

- [ ] **Step 1: Implement the deck preload**

```ts
// @file src/preload/deck.ts
// Runs inside every deck page (isolated world). Bridges the UXD202 sync channel
// to the main process and reports focus/pointer facts the key router needs.
import { ipcRenderer } from 'electron'

const tabId = new URLSearchParams(location.search).get('tabId') ?? ''
const channel = new BroadcastChannel('UXD202_SLIDES_SYNC')
let answered = false

channel.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data
  if (!msg || msg.type !== 'SLIDE_STATE' || msg.tabId !== tabId) return
  answered = true
  ipcRenderer.send('deck:state', msg)
})

ipcRenderer.on('deck:cmd', (_event, cmd: Record<string, unknown>) => {
  channel.postMessage({ ...cmd, targetTabId: tabId })
})

for (const delay of [300, 1000, 2000]) {
  setTimeout(() => {
    if (!answered) channel.postMessage({ type: 'PING', targetTabId: tabId })
  }, delay)
}

const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'])
function isEditable(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

window.addEventListener('focusin', () => ipcRenderer.send('deck:editing', isEditable(document.activeElement)), true)
window.addEventListener('focusout', () => setTimeout(() => ipcRenderer.send('deck:editing', isEditable(document.activeElement)), 0), true)
window.addEventListener('pointerdown', () => ipcRenderer.send('deck:pointer'), true)
```

- [ ] **Step 2: Implement Output**

```ts
// @file src/main/output.ts
import { WebContentsView, session, shell } from 'electron'
import { keyIntent } from '../shared/keys'
import { clampIndex } from '../shared/nav'
import type { AdapterKind, DeckRef, KeyIntent, Milestone, OutputKind, OutputView, SlideMeta } from '../shared/types'
import { deckUrl } from './deckPaths'
import { installDeckProtocol, registerDeckFolder } from './deckProtocol'

/** SLIDE_STATE as sent by the UXD202 FloatingNavbar. */
export interface DeckStateMsg {
  currentSlide: number
  totalSlides: number
  currentTitle?: string
  metadata?: SlideMeta[]
  milestones?: Milestone[]
  timer?: { remaining: number | null; isRunning: boolean; isDone: boolean }
}

export interface TimerSync {
  remaining: number | null
  isRunning: boolean
  isDone: boolean
}

export type OutputEvent =
  | { type: 'key'; intent: KeyIntent }
  | { type: 'anykey' }
  | { type: 'state'; msg: DeckStateMsg; userMoved: boolean }
  | { type: 'loaded' }
  | { type: 'changed' }

export interface OutputOptions {
  id: string
  label: string
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

  readonly id: string
  readonly kind: OutputKind
  readonly view: WebContentsView
  label: string
  linked: boolean
  index: number
  deck: DeckRef | null = null
  adapter: AdapterKind = 'none'
  total: number | null = null
  slides: SlideMeta[] = []
  milestones: Milestone[] = []
  editing = false
  fullscreen = false
  /** Extra screens opened with "same deck" reload when the main deck changes. */
  followsMain = false

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
    this.label = opts.label
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
      if (this.editing) return
      const intent = keyIntent(input.key, input)
      if (!intent) {
        if (input.type === 'keyDown') this.emit({ type: 'anykey' })
        return
      }
      event.preventDefault()
      if (input.type === 'keyDown') this.emit({ type: 'key', intent })
    })
    wc.on('did-finish-load', () => {
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

  shownIndex(): number {
    return clampIndex(this.index, this.total)
  }

  load(deck: DeckRef): void {
    const { host, folder, url } = deckUrl(deck.path, this.id)
    registerDeckFolder(host, folder)
    this.deck = deck
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
    if (msg.metadata && msg.metadata.length > 0) this.slides = msg.metadata
    if (msg.milestones) this.milestones = msg.milestones
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
      label: this.label,
      kind: this.kind,
      deck: this.deck,
      adapter: this.adapter,
      index: this.index,
      shownIndex: shown,
      total: this.total,
      linked: this.linked,
      title: this.slides[shown]?.title ?? '',
      fullscreen: this.fullscreen
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
```

- [ ] **Step 3: Build to verify it compiles** — `npm run build` (entries missing until Task 5–6 → run after Task 6). Commit after Task 6.

### Task 5: Windows, displays, recent files, store, bootstrap

**Files:**
- Create: `src/main/displays.ts`, `src/main/recent.ts`, `src/main/projectorWindow.ts`, `src/main/consoleWindow.ts`, `src/main/screenWindow.ts`, `src/main/store.ts`, `src/main/index.ts`

**Interfaces:**
- Consumes: `Output`, `planMove`, `intentToAction`, `keyIntent`, timer functions, `mergeRecent`, `pickDisplayIds`, `registerDeckScheme`.
- Produces: `Store` public methods used by IPC and e2e: `start, openDialog, openMainDeck(path), addScreen(sameDeck), removeScreen(id), toggleFullscreen(id), onKey(intent, sourceId|null), navigate(action), nudge(id, delta), select(id), setLinked(id, linked), onPointer(id), timerStart(sec), timerToggle(), timerReset(), dismissAlarm(), layoutPreview(rect), getState()`. IPC channels `console:*`, `overlay:pointer`; renderer events `state`, `mirror`, `timer`. Test hook `globalThis.__presenter` when `PRESENTER_TEST=1`; `PRESENTER_OPEN=<path>` opens a deck at start.

- [ ] **Step 1: Implement**

```ts
// @file src/main/displays.ts
import { screen, type Display } from 'electron'
import { pickDisplayIds } from '../shared/displays'

function pick(): { console: Display; projector: Display | null } {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const ids = pickDisplayIds(all, primary.id)
  return {
    console: all.find((d) => d.id === ids.consoleId) ?? primary,
    projector: all.find((d) => d.id === ids.projectorId) ?? null
  }
}

export const consoleDisplay = (): Display => pick().console
export const projectorDisplay = (): Display | null => pick().projector
```

```ts
// @file src/main/recent.ts
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { RECENT_MAX } from '../shared/recentList'
import type { DeckRef } from '../shared/types'

const file = (): string => path.join(app.getPath('userData'), 'recent.json')

export function loadRecent(): DeckRef[] {
  try {
    const list = JSON.parse(fs.readFileSync(file(), 'utf8')) as DeckRef[]
    return list.filter((d) => d && typeof d.path === 'string' && fs.existsSync(d.path)).slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

export function saveRecent(list: DeckRef[]): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(list, null, 2))
  } catch {
    // The recent list is a convenience; a failed write must not stop a class.
  }
}
```

```ts
// @file src/main/projectorWindow.ts
import { BaseWindow, WebContentsView, screen } from 'electron'
import { projectorDisplay } from './displays'
import type { Output } from './output'

const OVERLAY = { width: 320, height: 120, margin: 24 }

/** The students' screen: full-screen deck on the external display, timer overlay on top. */
export class ProjectorWindow {
  readonly win: BaseWindow
  readonly overlay: WebContentsView
  private overlayVisible = false

  constructor(
    private readonly output: Output,
    overlayPreload: string,
    loadOverlay: (view: WebContentsView) => void,
    onClosed: () => void
  ) {
    this.win = new BaseWindow({ width: 960, height: 540, backgroundColor: '#000000', title: '投影屏 · Presenter', autoHideMenuBar: true, show: false })
    this.win.contentView.addChildView(output.view)
    this.overlay = new WebContentsView({ webPreferences: { preload: overlayPreload, contextIsolation: true, sandbox: true, backgroundThrottling: false } })
    this.overlay.setBackgroundColor('#00000000')
    this.overlay.setVisible(false)
    this.win.contentView.addChildView(this.overlay)
    loadOverlay(this.overlay)
    this.win.on('resize', () => this.layout())
    this.win.on('enter-full-screen', () => this.layout())
    this.win.on('leave-full-screen', () => this.layout())
    this.win.on('closed', onClosed)
    this.place()
    this.win.show()
  }

  place(): void {
    const target = projectorDisplay()
    if (this.win.isFullScreen()) this.win.setFullScreen(false)
    if (target) {
      this.win.setBounds(target.bounds)
      this.win.setFullScreen(true)
      this.win.setTitle('投影屏 · Presenter')
    } else {
      // No projector: a 1280x720 page (the size decks are designed for) at the right edge.
      const area = screen.getPrimaryDisplay().workArea
      this.win.setContentBounds({ x: area.x + Math.max(0, area.width - 1300), y: area.y + 40, width: 1280, height: 720 })
      this.win.setTitle('投影屏（未检测到第二块屏幕）· Presenter')
    }
    this.layout()
  }

  layout(): void {
    if (this.win.isDestroyed()) return
    const { width, height } = this.contentSize()
    this.output.view.setBounds({ x: 0, y: 0, width, height })
    this.overlay.setBounds({
      x: Math.max(0, width - OVERLAY.width - OVERLAY.margin),
      y: Math.max(0, height - OVERLAY.height - OVERLAY.margin),
      width: OVERLAY.width,
      height: OVERLAY.height
    })
  }

  contentSize(): { width: number; height: number } {
    if (this.win.isDestroyed()) return { width: 1280, height: 720 }
    const b = this.win.getContentBounds()
    return { width: b.width, height: b.height }
  }

  setOverlayVisible(visible: boolean): void {
    if (visible === this.overlayVisible) return
    this.overlayVisible = visible
    this.overlay.setVisible(visible)
  }
}
```

```ts
// @file src/main/consoleWindow.ts
import { BrowserWindow } from 'electron'
import { consoleDisplay } from './displays'

/** The teacher's control window on the laptop display. */
export class ConsoleWindow {
  readonly win: BrowserWindow

  constructor(preload: string, load: (win: BrowserWindow) => void, onClosed: () => void) {
    const area = consoleDisplay().workArea
    this.win = new BrowserWindow({
      ...area,
      minWidth: 1024,
      minHeight: 620,
      title: 'Presenter · 控制台',
      backgroundColor: '#0b0f17',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false }
    })
    this.win.webContents.on('will-navigate', (event) => event.preventDefault())
    this.win.once('ready-to-show', () => {
      this.win.maximize()
      this.win.show()
    })
    this.win.on('closed', onClosed)
    load(this.win)
  }

  place(): void {
    if (this.win.isDestroyed()) return
    if (this.win.isMaximized()) this.win.unmaximize()
    this.win.setBounds(consoleDisplay().workArea)
    this.win.maximize()
  }
}
```

```ts
// @file src/main/screenWindow.ts
import { BaseWindow, screen } from 'electron'
import type { Output } from './output'

/** An extra screen the teacher adds; can be dragged to any display and made full-screen. */
export class ScreenWindow {
  private readonly win: BaseWindow

  constructor(
    private readonly output: Output,
    onClosed: () => void,
    onFullscreen: (full: boolean) => void
  ) {
    const area = screen.getPrimaryDisplay().workArea
    this.win = new BaseWindow({ x: area.x + 80, y: area.y + 80, width: 960, height: 540, title: `${output.label} · Presenter`, backgroundColor: '#000000', autoHideMenuBar: true })
    this.win.contentView.addChildView(output.view)
    this.win.on('resize', () => this.layout())
    this.win.on('enter-full-screen', () => {
      this.layout()
      onFullscreen(true)
    })
    this.win.on('leave-full-screen', () => {
      this.layout()
      onFullscreen(false)
    })
    this.win.on('closed', onClosed)
    this.layout()
  }

  toggleFullscreen(): void {
    if (!this.win.isDestroyed()) this.win.setFullScreen(!this.win.isFullScreen())
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.close()
  }

  private layout(): void {
    if (this.win.isDestroyed()) return
    const b = this.win.getContentBounds()
    this.output.view.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
  }
}
```

```ts
// @file src/main/store.ts
import { app, dialog, screen, type BrowserWindow, type WebContentsView } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { intentToAction, keyIntent } from '../shared/keys'
import { planMove, type NavOutput } from '../shared/nav'
import { mergeRecent } from '../shared/recentList'
import * as T from '../shared/timer'
import type { AppState, DeckRef, KeyIntent, NavAction, OutputId, OutputKind, PreviewRect, TimerView } from '../shared/types'
import { ConsoleWindow } from './consoleWindow'
import { projectorDisplay } from './displays'
import { Output, type DeckStateMsg, type OutputEvent } from './output'
import { ProjectorWindow } from './projectorWindow'
import { loadRecent, saveRecent } from './recent'
import { ScreenWindow } from './screenWindow'

export interface StorePaths {
  deckPreload: string
  consolePreload: string
  overlayPreload: string
  loadConsole: (win: BrowserWindow) => void
  loadOverlay: (view: WebContentsView) => void
}

const TICK_MS = 200
const MIRROR_MS = 250
/** Ignore deck-side "not done" reports this soon after the alarm starts (they are stale echoes). */
const ALARM_GUARD_MS = 1500
/** Ignore deck timer reports this soon after our own timer command. */
const DECK_TIMER_GUARD_MS = 1000
const DECK_FILE = /\.html?$/i

/** Single source of truth. Windows render its state and send intents back. */
export class Store {
  private readonly outputs = new Map<OutputId, Output>()
  private readonly screens = new Map<OutputId, ScreenWindow>()
  private selectedId: OutputId = 'projector'
  private mainDeck: DeckRef | null = null
  private timer = T.initialTimer(60)
  private alarmSince = 0
  private lastTimerCmd = 0
  private lastTimerKey = ''
  private recent: DeckRef[] = []
  private previewRect: PreviewRect | null = null
  private screenSeq = 3
  private emitQueued = false
  private mirrorBusy = false
  private quitting = false
  private projectorWin!: ProjectorWindow
  private consoleWin!: ConsoleWindow

  constructor(private readonly paths: StorePaths) {}

  start(): void {
    this.recent = loadRecent()
    const projector = this.createOutput('projector', '投影屏', 'projector', 0)
    const next = this.createOutput('next', '下一页预览', 'preview', 1)
    this.consoleWin = new ConsoleWindow(this.paths.consolePreload, this.paths.loadConsole, () => this.quit())
    this.projectorWin = new ProjectorWindow(projector, this.paths.overlayPreload, this.paths.loadOverlay, () => this.quit())
    this.consoleWin.win.contentView.addChildView(next.view)
    next.view.setVisible(false)
    this.consoleWin.win.webContents.on('did-finish-load', () => this.emitNow())

    const overlay = this.projectorWin.overlay.webContents
    overlay.on('did-finish-load', () => this.syncTimer(true))
    overlay.on('before-input-event', (event, input) => {
      const intent = keyIntent(input.key, input)
      if (!intent) return
      event.preventDefault()
      if (input.type === 'keyDown') this.onKey(intent, 'projector')
    })

    screen.on('display-added', () => this.onDisplaysChanged())
    screen.on('display-removed', () => this.onDisplaysChanged())
    screen.on('display-metrics-changed', () => this.onDisplaysChanged())
    setInterval(() => this.tick(), TICK_MS)
    setInterval(() => void this.captureMirror(), MIRROR_MS)
  }

  // ---------- decks ----------

  async openDialog(): Promise<void> {
    const deck = await this.pickDeck('打开课件')
    if (deck) this.openMainDeck(deck.path)
  }

  openMainDeck(filePath: string): void {
    if (!DECK_FILE.test(filePath) || !fs.existsSync(filePath)) return
    const deck = this.toDeck(filePath)
    this.mainDeck = deck
    this.remember(deck)
    this.projector().index = 0
    this.next().index = 1
    this.projector().load(deck)
    this.next().load(deck)
    for (const o of this.outputs.values()) {
      if (o.kind === 'window' && o.followsMain) {
        o.index = 0
        o.load(deck)
      }
    }
    this.selectedId = 'projector'
    this.emit()
  }

  async addScreen(sameDeck: boolean): Promise<void> {
    const deck = sameDeck ? this.mainDeck : await this.pickDeck('选择新屏幕要显示的课件')
    if (!deck) return
    if (!sameDeck) this.remember(deck)
    const n = this.screenSeq++
    const id = `screen-${n}`
    const o = this.createOutput(id, `屏幕 ${n}`, 'window', sameDeck ? this.projector().index : 0)
    o.followsMain = sameDeck
    this.screens.set(
      id,
      new ScreenWindow(o, () => this.removeScreen(id), (full) => {
        o.fullscreen = full
        this.emit()
      })
    )
    o.load(deck)
    this.emit()
  }

  removeScreen(id: OutputId): void {
    const o = this.outputs.get(id)
    if (!o || o.kind !== 'window') return
    const w = this.screens.get(id)
    this.screens.delete(id)
    this.outputs.delete(id)
    if (this.selectedId === id) this.selectedId = 'projector'
    w?.close()
    o.destroy()
    this.emit()
  }

  toggleFullscreen(id: OutputId): void {
    this.screens.get(id)?.toggleFullscreen()
  }

  // ---------- navigation ----------

  onKey(intent: KeyIntent, sourceId: OutputId | null): void {
    if (this.timer.alarming) {
      this.dismissAlarm()
      return
    }
    if (sourceId && this.outputs.has(sourceId)) this.selectedId = sourceId
    this.navigate(intentToAction(intent))
  }

  navigate(action: NavAction): void {
    this.applyMoves(planMove(this.navOutputs(), this.selectedId, action))
  }

  /** −/+ on a screen card: move only that screen, whatever its link state. */
  nudge(id: OutputId, delta: number): void {
    const solo = this.navOutputs().map((o) => ({ ...o, linked: false }))
    this.applyMoves(planMove(solo, id, { type: 'step', delta }))
  }

  select(id: OutputId): void {
    if (!this.outputs.has(id)) return
    this.selectedId = id
    this.emit()
  }

  setLinked(id: OutputId, linked: boolean): void {
    const o = this.outputs.get(id)
    if (!o) return
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

  getState(): AppState {
    const projector = this.projector()
    return {
      outputs: [...this.outputs.values()].map((o) => o.toView()),
      selectedId: this.selectedId,
      mainDeck: this.mainDeck,
      slides: projector.slides,
      milestones: projector.milestones,
      timer: this.timerView(),
      plannedMinutes: this.plannedMinutes(),
      recent: this.recent,
      hasExternalDisplay: projectorDisplay() !== null,
      projectorSize: this.projectorWin.contentSize()
    }
  }

  // ---------- internals ----------

  private createOutput(id: OutputId, label: string, kind: OutputKind, index: number): Output {
    const o = new Output({ id, label, kind, linked: true, index, preload: this.paths.deckPreload, onEvent: (out, e) => this.onOutputEvent(out, e) })
    this.outputs.set(id, o)
    return o
  }

  private onOutputEvent(o: Output, e: OutputEvent): void {
    switch (e.type) {
      case 'key':
        this.onKey(e.intent, o.id)
        break
      case 'anykey':
        if (this.timer.alarming) this.dismissAlarm()
        break
      case 'state':
        this.onDeckState(o, e.msg, e.userMoved)
        break
      case 'loaded':
        if (o.kind === 'preview') this.applyPreview()
        this.emit()
        break
      case 'changed':
        if (o.kind === 'projector') this.syncTimer(true)
        this.emit()
        break
    }
  }

  private onDeckState(o: Output, msg: DeckStateMsg, userMoved: boolean): void {
    if (userMoved) {
      this.selectedId = o.id
      const moves = planMove(this.navOutputs(), o.id, { type: 'goto', index: msg.currentSlide })
      if (moves.size === 0) o.acceptIndex(msg.currentSlide)
      for (const [id, idx] of moves) {
        const target = this.outputs.get(id)
        if (target === o) target.acceptIndex(idx)
        else target?.moveTo(idx)
      }
      this.afterMove()
    }
    if (o.kind === 'projector' && msg.timer) this.adoptDeckTimer(msg.timer)
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

  private afterMove(): void {
    if (this.timer.status === 'idle') this.timer = T.reset(this.timer, this.defaultDuration())
    this.syncTimer(true)
    this.emit()
    setTimeout(() => void this.captureMirror(), 150)
  }

  private navOutputs(): NavOutput[] {
    return [...this.outputs.values()]
      .filter((o) => o.deck !== null)
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
    const projector = this.projector()
    projector.sendTimer({ remaining: view.status === 'idle' ? null : view.remainingSec, isRunning: view.status === 'running', isDone: view.alarming })
    this.projectorWin.setOverlayVisible(projector.adapter !== 'uxd202' && view.status !== 'idle')
    const overlay = this.projectorWin.overlay.webContents
    if (!overlay.isDestroyed()) overlay.send('timer', view)
    this.emit()
  }

  private timerView(): TimerView {
    return { status: this.timer.status, remainingSec: T.remainingSec(this.timer), durationSec: this.timer.durationSec, alarming: this.timer.alarming }
  }

  private plannedMinutes(): number | null {
    const p = this.projector()
    const minutes = p.slides[p.shownIndex()]?.minutes
    return typeof minutes === 'number' && minutes > 0 ? minutes : null
  }

  private defaultDuration(): number {
    const planned = this.plannedMinutes()
    return planned ? planned * 60 : this.timer.durationSec
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
    const width = this.projectorWin.contentSize().width
    next.view.webContents.setZoomFactor(Math.max(0.25, r.width / Math.max(1, width)))
  }

  private async captureMirror(): Promise<void> {
    if (this.mirrorBusy || this.quitting) return
    const cw = this.consoleWin.win
    if (cw.isDestroyed() || cw.isMinimized() || !cw.isVisible()) return
    this.mirrorBusy = true
    try {
      const img = await this.projector().view.webContents.capturePage()
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
    this.applyPreview()
    this.emit()
  }

  private async pickDeck(title: string): Promise<DeckRef | null> {
    const r = await dialog.showOpenDialog(this.consoleWin.win, { title, properties: ['openFile'], filters: [{ name: '课件（HTML）', extensions: ['html', 'htm'] }] })
    return r.canceled || !r.filePaths[0] ? null : this.toDeck(r.filePaths[0])
  }

  private toDeck(filePath: string): DeckRef {
    return { path: filePath, name: path.basename(filePath).replace(DECK_FILE, '') }
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
    app.quit()
  }
}
```

```ts
// @file src/main/index.ts
import { app, ipcMain, Menu, type WebContents } from 'electron'
import path from 'node:path'
import type { KeyIntent, NavAction, OutputId, PreviewRect } from '../shared/types'
import { registerDeckScheme } from './deckProtocol'
import { Output, type DeckStateMsg } from './output'
import { Store } from './store'

registerDeckScheme()
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const preload = (name: string): string => path.join(__dirname, `../preload/${name}.js`)

function loadPage(wc: WebContents, name: string): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && dev) void wc.loadURL(`${dev}/${name}.html`)
  else void wc.loadFile(path.join(__dirname, `../renderer/${name}.html`))
}

function wireIpc(store: Store): void {
  const outputOf = (wc: WebContents): Output | undefined => Output.byContents.get(wc.id)
  ipcMain.on('deck:state', (e, msg: DeckStateMsg) => outputOf(e.sender)?.receiveState(msg))
  ipcMain.on('deck:editing', (e, editing: boolean) => {
    const o = outputOf(e.sender)
    if (o) o.editing = editing
  })
  ipcMain.on('deck:pointer', (e) => {
    const o = outputOf(e.sender)
    if (o) store.onPointer(o.id)
  })
  ipcMain.on('overlay:pointer', () => store.onPointer('projector'))
  ipcMain.on('console:open-dialog', () => void store.openDialog())
  ipcMain.on('console:open-path', (_e, p: string) => store.openMainDeck(p))
  ipcMain.on('console:navigate', (_e, action: NavAction) => store.navigate(action))
  ipcMain.on('console:key', (_e, intent: KeyIntent) => store.onKey(intent, null))
  ipcMain.on('console:select', (_e, id: OutputId) => store.select(id))
  ipcMain.on('console:set-linked', (_e, id: OutputId, linked: boolean) => store.setLinked(id, linked))
  ipcMain.on('console:nudge', (_e, id: OutputId, delta: number) => store.nudge(id, delta))
  ipcMain.on('console:add-screen', (_e, sameDeck: boolean) => void store.addScreen(sameDeck))
  ipcMain.on('console:remove-screen', (_e, id: OutputId) => store.removeScreen(id))
  ipcMain.on('console:fullscreen', (_e, id: OutputId) => store.toggleFullscreen(id))
  ipcMain.on('console:timer-start', (_e, sec: number) => store.timerStart(sec))
  ipcMain.on('console:timer-toggle', () => store.timerToggle())
  ipcMain.on('console:timer-reset', () => store.timerReset())
  ipcMain.on('console:timer-dismiss', () => store.dismissAlarm())
  ipcMain.on('console:layout-preview', (_e, rect: PreviewRect | null) => store.layoutPreview(rect))
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const store = new Store({
    deckPreload: preload('deck'),
    consolePreload: preload('console'),
    overlayPreload: preload('overlay'),
    loadConsole: (win) => loadPage(win.webContents, 'console'),
    loadOverlay: (view) => loadPage(view.webContents, 'overlay')
  })
  store.start()
  wireIpc(store)
  if (process.env['PRESENTER_TEST'] === '1') (globalThis as Record<string, unknown>)['__presenter'] = store
  const initial = process.env['PRESENTER_OPEN'] ?? process.argv.find((a) => /\.html?$/i.test(a))
  if (initial) store.openMainDeck(initial)
})

app.on('window-all-closed', () => app.quit())
```

### Task 6: Console and overlay renderers

**Files:**
- Create: `src/preload/console.ts`, `src/preload/overlay.ts`, `src/renderer/console.html`, `src/renderer/overlay.html`, `src/renderer/src/styles.css`, `src/renderer/src/env.d.ts`, `src/renderer/src/chime.ts`, `src/renderer/src/overlay/main.ts`, `src/renderer/src/console/{main,App,hooks,ui,Header,CurrentPane,NextPane,TimerPanel,ScreensBar,Drawer}.tsx|ts`

**Interfaces:**
- Consumes: `ConsoleApi`, `AppState`, `OutputView`, `TimerView`, `keyIntent`, `mmss`.
- Produces: `window.presenter` (console), `window.overlay` (overlay).

- [ ] **Step 1: Preloads**

```ts
// @file src/preload/console.ts
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppState, ConsoleApi } from '../shared/types'

const api: ConsoleApi = {
  onState: (cb) => {
    ipcRenderer.on('state', (_e, state: AppState) => cb(state))
  },
  onMirror: (cb) => {
    ipcRenderer.on('mirror', (_e, jpeg: Uint8Array) => cb(jpeg))
  },
  openDialog: () => ipcRenderer.send('console:open-dialog'),
  openPath: (p) => ipcRenderer.send('console:open-path', p),
  pathForFile: (file) => webUtils.getPathForFile(file),
  navigate: (action) => ipcRenderer.send('console:navigate', action),
  key: (intent) => ipcRenderer.send('console:key', intent),
  select: (id) => ipcRenderer.send('console:select', id),
  setLinked: (id, linked) => ipcRenderer.send('console:set-linked', id, linked),
  nudge: (id, delta) => ipcRenderer.send('console:nudge', id, delta),
  addScreen: (sameDeck) => ipcRenderer.send('console:add-screen', sameDeck),
  removeScreen: (id) => ipcRenderer.send('console:remove-screen', id),
  toggleFullscreen: (id) => ipcRenderer.send('console:fullscreen', id),
  timerStart: (sec) => ipcRenderer.send('console:timer-start', sec),
  timerToggle: () => ipcRenderer.send('console:timer-toggle'),
  timerReset: () => ipcRenderer.send('console:timer-reset'),
  timerDismiss: () => ipcRenderer.send('console:timer-dismiss'),
  layoutPreview: (rect) => ipcRenderer.send('console:layout-preview', rect)
}

contextBridge.exposeInMainWorld('presenter', api)
```

```ts
// @file src/preload/overlay.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { TimerView } from '../shared/types'

contextBridge.exposeInMainWorld('overlay', {
  onTimer: (cb: (t: TimerView) => void) => {
    ipcRenderer.on('timer', (_e, t: TimerView) => cb(t))
  },
  pointer: () => ipcRenderer.send('overlay:pointer')
})
```

- [ ] **Step 2: Pages, styles, shared renderer helpers**

```html
<!-- @file src/renderer/console.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Presenter · 控制台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/console/main.tsx"></script>
  </body>
</html>
```

```html
<!-- @file src/renderer/overlay.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>timer</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
      body { display: flex; align-items: flex-end; justify-content: flex-end; font-family: "Cascadia Mono", Consolas, monospace; }
      #pill { padding: 10px 24px; border-radius: 9999px; background: rgba(17, 24, 39, 0.88); color: #f9fafb; font-size: 52px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); }
      #pill[data-state="paused"] { color: #fbbf24; }
      #pill[data-state="alarm"] { background: #dc2626; animation: blink 1s steps(2, start) infinite; }
      @keyframes blink { to { opacity: 0.55; } }
    </style>
  </head>
  <body>
    <div id="pill">00:00</div>
    <script type="module" src="./src/overlay/main.ts"></script>
  </body>
</html>
```

```css
/* @file src/renderer/src/styles.css */
@import "tailwindcss";

@theme {
  --font-sans: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
  --font-mono: "Cascadia Mono", Consolas, ui-monospace, monospace;
  /* accent = the selected screen and primary actions */
  --color-accent: #f59e0b;
  --color-accent-strong: #d97706;
  /* link = a screen that turns pages together with the selected one */
  --color-link: #34d399;
  /* alarm = the timer reached zero */
  --color-alarm: #ef4444;
  --color-panel: #111827;
  --color-panel-2: #1f2937;
  --color-line: #374151;
  --color-ink: #f3f4f6;
  --color-muted: #9ca3af;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: #0b0f17;
  color: var(--color-ink);
  font-family: var(--font-sans);
  user-select: none;
}
```

```ts
// @file src/renderer/src/env.d.ts
import type { ConsoleApi, TimerView } from '../../shared/types'

declare global {
  interface Window {
    presenter: ConsoleApi
    overlay: { onTimer(cb: (t: TimerView) => void): void; pointer(): void }
  }
}

export {}
```

```ts
// @file src/renderer/src/assets.d.ts
// Side-effect style imports are bundled by Vite.
declare module '*.css'
```

```ts
// @file src/renderer/src/chime.ts
let ctx: AudioContext | null = null

/** Three rising notes; repeated by the caller while the alarm is on. */
export function chime(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const audio = ctx
    ;[880, 988, 1175].forEach((freq, i) => {
      const t0 = audio.currentTime + i * 0.28
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t0)
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
      osc.connect(gain).connect(audio.destination)
      osc.start(t0)
      osc.stop(t0 + 0.55)
    })
  } catch {
    // No audio device; the red flashing timer still shows the alarm.
  }
}
```

```ts
// @file src/renderer/src/overlay/main.ts
import { mmss } from '../../../shared/format'
import { chime } from '../chime'

const pill = document.getElementById('pill') as HTMLDivElement
let alarm: number | null = null

window.overlay.onTimer((t) => {
  pill.textContent = mmss(t.remainingSec)
  pill.dataset['state'] = t.alarming ? 'alarm' : t.status
  if (t.alarming && alarm === null) {
    chime()
    alarm = window.setInterval(chime, 1200)
  }
  if (!t.alarming && alarm !== null) {
    window.clearInterval(alarm)
    alarm = null
  }
})

window.addEventListener('pointerdown', () => window.overlay.pointer())
```

- [ ] **Step 3: Console React UI**

```tsx
// @file src/renderer/src/console/main.tsx
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { App } from './App'

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
```

```ts
// @file src/renderer/src/console/hooks.ts
import { useEffect, useState } from 'react'
import { keyIntent } from '../../../shared/keys'
import type { AppState } from '../../../shared/types'

export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => window.presenter.onState(setState), [])
  return state
}

/** Object URL of the latest projector frame. */
export function useMirror(): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let previous: string | null = null
    window.presenter.onMirror((jpeg) => {
      const next = URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }))
      setUrl(next)
      if (previous) URL.revokeObjectURL(previous)
      previous = next
    })
  }, [])
  return url
}

const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && el.type !== 'checkbox') ||
  (el instanceof HTMLElement && el.isContentEditable)

/** Page-turn keys in the console go to the main process; any key stops a ringing alarm. */
export function useConsoleKeys(alarming: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTextField(e.target)) return
      const intent = keyIntent(e.key, { control: e.ctrlKey, alt: e.altKey, meta: e.metaKey })
      if (intent) {
        e.preventDefault()
        window.presenter.key(intent)
        return
      }
      if (alarming) window.presenter.timerDismiss()
    }
    // A clicked button keeps focus and would react to Space; drop focus after each click.
    const onPointerUp = (): void => {
      const a = document.activeElement
      if (a instanceof HTMLButtonElement || (a instanceof HTMLInputElement && a.type === 'checkbox')) a.blur()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [alarming])
}

export function useFileDrop(): void {
  useEffect(() => {
    const over = (e: DragEvent): void => e.preventDefault()
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (file) window.presenter.openPath(window.presenter.pathForFile(file))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
}
```

```tsx
// @file src/renderer/src/console/ui.tsx
import type { ReactNode } from 'react'
import type { AppState, OutputView } from '../../../shared/types'

type Tone = 'default' | 'primary' | 'quiet'
const TONES: Record<Tone, string> = {
  default: 'bg-panel-2 text-ink hover:bg-line',
  primary: 'bg-accent font-semibold text-black hover:bg-accent-strong',
  quiet: 'text-muted hover:bg-panel-2 hover:text-ink'
}

export function Btn(props: { children: ReactNode; onClick?: () => void; tone?: Tone; title?: string; disabled?: boolean }) {
  const { children, onClick, tone = 'default', title, disabled } = props
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]}`}
    >
      {children}
    </button>
  )
}

export function goToSlide(index: number): void {
  window.presenter.select('projector')
  window.presenter.navigate({ type: 'goto', index })
}

export function PageText({ o }: { o: OutputView }) {
  if (!o.deck) return <>未打开课件</>
  if (o.adapter === 'loading') return <>正在连接课件…</>
  const page = o.shownIndex + 1
  if (o.total) return <>第 {page} / {o.total} 页</>
  return (
    <>
      第 {page} 页
      <span title="这份课件没有接入同步协议。程序用方向键翻页，所以不知道总页数。" className="ml-1.5 rounded bg-panel-2 px-1.5 text-muted">
        按键模式
      </span>
    </>
  )
}

export function Milestones({ state, index }: { state: AppState; index: number }) {
  if (state.milestones.length === 0) return null
  return (
    <div className="ml-auto flex shrink-0 gap-1.5">
      {state.milestones.map((m) => {
        const [from, to] = m.range ?? [m.slideIndex, m.slideIndex]
        const active = index >= from && index <= to
        return (
          <button
            key={`${m.label}-${m.slideIndex}`}
            type="button"
            title={`跳到 ${m.label}`}
            onClick={() => goToSlide(m.slideIndex)}
            className={`rounded-full px-2.5 py-0.5 text-sm ${active ? 'bg-accent font-semibold text-black' : 'bg-panel-2 text-muted hover:text-ink'}`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
```

```tsx
// @file src/renderer/src/console/Header.tsx
import { useEffect, useState, type ReactNode } from 'react'
import type { AppState } from '../../../shared/types'
import { Btn } from './ui'

function Menu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [onClose])
  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="absolute top-full left-0 z-20 mt-1 w-96 rounded-xl border border-line bg-panel-2 p-1.5 shadow-2xl">
      {children}
    </div>
  )
}

function MenuItem({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-line">
      {children}
    </button>
  )
}

export function Header({ state }: { state: AppState }) {
  const [menu, setMenu] = useState<'recent' | 'add' | null>(null)
  const close = (): void => setMenu(null)
  return (
    <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
      <span className="text-base font-bold tracking-wide text-accent">Presenter</span>
      <span className="max-w-[26rem] truncate text-sm" title={state.mainDeck?.path}>
        {state.mainDeck?.name ?? '未打开课件'}
      </span>
      <Btn tone="primary" onClick={() => window.presenter.openDialog()}>
        打开课件
      </Btn>
      <span className="relative">
        <Btn onClick={() => setMenu(menu === 'recent' ? null : 'recent')} disabled={state.recent.length === 0}>
          最近 ▾
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
      <span className="relative">
        <Btn onClick={() => setMenu(menu === 'add' ? null : 'add')} disabled={!state.mainDeck}>
          添加屏幕 ▾
        </Btn>
        {menu === 'add' && (
          <Menu onClose={close}>
            <MenuItem onClick={() => { close(); window.presenter.addScreen(true) }}>同一份课件（新窗口）</MenuItem>
            <MenuItem onClick={() => { close(); window.presenter.addScreen(false) }}>另一份课件（新窗口）…</MenuItem>
          </Menu>
        )}
      </span>
      <span className={`ml-auto flex items-center gap-2 text-sm ${state.hasExternalDisplay ? 'text-link' : 'text-muted'}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${state.hasExternalDisplay ? 'bg-link' : 'bg-muted'}`} />
        {state.hasExternalDisplay ? '投影屏已连接' : '未检测到第二块屏幕：投影屏以窗口显示'}
      </span>
    </header>
  )
}
```

```tsx
// @file src/renderer/src/console/CurrentPane.tsx
import type { AppState, OutputView } from '../../../shared/types'
import type { DrawerTab } from './Drawer'
import { Btn, Milestones, PageText } from './ui'

function EmptyState({ state }: { state: AppState }) {
  return (
    <section className="flex min-h-0 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line bg-panel p-6 text-center">
      <p className="text-2xl font-semibold">把课件文件拖到这里</p>
      <p className="text-sm text-muted">现在支持 .html 课件。PDF 和 PPT 会在后续版本支持。</p>
      <Btn tone="primary" onClick={() => window.presenter.openDialog()}>
        打开课件
      </Btn>
      {state.recent.length > 0 && (
        <div className="w-full max-w-xl text-left">
          <h3 className="mb-1 px-3 text-sm text-muted">最近打开</h3>
          {state.recent.map((d) => (
            <button key={d.path} type="button" title={d.path} onClick={() => window.presenter.openPath(d.path)} className="block w-full truncate rounded-lg px-3 py-2 text-left text-base hover:bg-panel-2">
              {d.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function CurrentPane(props: {
  state: AppState
  projector: OutputView
  mirror: string | null
  drawer: DrawerTab | null
  onDrawer: (tab: DrawerTab | null) => void
}) {
  const { state, projector, mirror, drawer, onDrawer } = props
  if (!state.mainDeck) return <EmptyState state={state} />
  const selected = state.selectedId === projector.id
  return (
    <section className={`flex min-h-0 flex-col rounded-2xl border-2 bg-panel p-3 ${selected ? 'border-accent' : 'border-line'}`}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted">投影屏 · 学生看到的画面</h2>
        <div className="ml-auto flex gap-2">
          <Btn tone={drawer === 'list' ? 'primary' : 'default'} onClick={() => onDrawer(drawer === 'list' ? null : 'list')}>
            目录
          </Btn>
          <Btn tone={drawer === 'notes' ? 'primary' : 'default'} onClick={() => onDrawer(drawer === 'notes' ? null : 'notes')}>
            备注
          </Btn>
        </div>
      </div>
      <button type="button" title="点击选中投影屏" onClick={() => window.presenter.select(projector.id)} className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
        {mirror ? (
          <img src={mirror} alt="投影屏画面" className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <span className="text-sm text-muted">等待画面…</span>
        )}
      </button>
      <div className="mt-2 flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-sm text-muted">
          <PageText o={projector} />
        </span>
        <span className="min-w-0 truncate text-base font-semibold">{projector.title}</span>
        <Milestones state={state} index={projector.shownIndex} />
      </div>
    </section>
  )
}
```

```tsx
// @file src/renderer/src/console/NextPane.tsx
import { useLayoutEffect, useRef, useState } from 'react'
import type { AppState, OutputView } from '../../../shared/types'
import { PageText } from './ui'

/** Holds a slot; the main process lays the live next-slide view exactly over it. */
export function NextPane({ state, next }: { state: AppState; next: OutputView }) {
  const box = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const aspect = state.projectorSize.width / Math.max(1, state.projectorSize.height)
  const selected = state.selectedId === next.id

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => {
      const r = el.getBoundingClientRect()
      const width = Math.floor(Math.min(r.width, r.height * aspect))
      setSize((s) => (s.width === width ? s : { width, height: Math.floor(width / aspect) }))
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [aspect])

  useLayoutEffect(() => {
    const el = slot.current
    if (!el || size.width < 40) {
      window.presenter.layoutPreview(null)
      return
    }
    const r = el.getBoundingClientRect()
    window.presenter.layoutPreview({ x: r.x, y: r.y, width: r.width, height: r.height })
  })

  useLayoutEffect(() => () => window.presenter.layoutPreview(null), [])

  return (
    <section className={`flex min-h-0 flex-1 flex-col rounded-2xl border-2 bg-panel p-3 ${selected ? 'border-accent' : 'border-line'}`}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted">下一页预览</h2>
        <span className="ml-auto text-sm text-muted">
          <PageText o={next} />
        </span>
      </div>
      <div ref={box} className="flex min-h-0 flex-1 items-center justify-center">
        <div ref={slot} style={{ width: size.width, height: size.height }} className="grid place-items-center rounded-lg bg-black text-sm text-muted">
          预览加载中…
        </div>
      </div>
      <p className="mt-2 min-h-6 truncate text-sm">{next.title}</p>
    </section>
  )
}
```

```tsx
// @file src/renderer/src/console/TimerPanel.tsx
import { useEffect, useState } from 'react'
import { mmss } from '../../../shared/format'
import type { AppState } from '../../../shared/types'
import { Btn } from './ui'

const PRESETS = [1, 3, 5, 8, 10, 15, 20]
const clampMinutes = (m: number): number => Math.min(180, Math.max(1, Math.round(Number.isFinite(m) ? m : 1)))

export function TimerPanel({ state }: { state: AppState }) {
  const t = state.timer
  const [custom, setCustom] = useState(5)
  useEffect(() => {
    if (state.plannedMinutes) setCustom(state.plannedMinutes)
  }, [state.plannedMinutes])
  const label = t.alarming ? '停止铃声' : t.status === 'running' ? '暂停' : t.status === 'paused' ? '继续' : '开始'
  const color = t.alarming ? 'text-alarm' : t.status === 'running' ? 'text-ink' : t.status === 'paused' ? 'text-accent' : 'text-muted'
  return (
    <section className={`rounded-2xl border-2 p-3 ${t.alarming ? 'animate-pulse border-alarm bg-alarm/15' : 'border-line bg-panel'}`}>
      <div className="flex items-center">
        <h2 className="text-sm font-semibold text-muted">计时器</h2>
        {state.plannedMinutes ? <span className="ml-auto text-sm text-muted">本页计划 {state.plannedMinutes} 分钟</span> : null}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className={`font-mono text-5xl font-bold tabular-nums ${color}`}>{mmss(t.remainingSec)}</span>
        <div className="ml-auto flex gap-2">
          <Btn tone="primary" onClick={() => window.presenter.timerToggle()}>
            {label}
          </Btn>
          <Btn onClick={() => window.presenter.timerReset()}>重置</Btn>
        </div>
      </div>
      {t.alarming && <p className="mt-1 text-sm text-alarm">时间到。按任意键或点击任意处停止铃声。</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((m) => (
          <Btn key={m} onClick={() => window.presenter.timerStart(m * 60)}>
            {m} 分
          </Btn>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Btn onClick={() => setCustom((c) => clampMinutes(c - 1))}>−</Btn>
        <input
          type="number"
          min={1}
          max={180}
          value={custom}
          onChange={(e) => setCustom(clampMinutes(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') window.presenter.timerStart(custom * 60)
          }}
          className="w-16 rounded-lg border border-line bg-panel-2 px-2 py-1 text-center font-mono text-base"
        />
        <Btn onClick={() => setCustom((c) => clampMinutes(c + 1))}>+</Btn>
        <span className="text-sm text-muted">分钟</span>
        <Btn tone="primary" onClick={() => window.presenter.timerStart(custom * 60)}>
          按此时长开始
        </Btn>
      </div>
    </section>
  )
}
```

```tsx
// @file src/renderer/src/console/ScreensBar.tsx
import type { AppState, OutputView } from '../../../shared/types'
import { Btn, PageText } from './ui'

function ScreenCard({ o, selected }: { o: OutputView; selected: boolean }) {
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()
  return (
    <div
      onClick={() => window.presenter.select(o.id)}
      className={`flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 ${selected ? 'border-accent bg-accent/10' : 'border-line bg-panel-2'}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {selected && <span className="rounded bg-accent px-1.5 text-black">已选中</span>}
          {o.label}
        </div>
        <div className="max-w-64 truncate text-sm text-muted">
          <PageText o={o} />
          {o.kind === 'window' && o.deck ? ` · ${o.deck.name}` : ''}
        </div>
      </div>
      <label onClick={stop} className={`flex cursor-pointer items-center gap-1.5 text-sm ${o.linked ? 'text-link' : 'text-muted'}`} title="勾选后，选中任一联动屏幕翻页时，这个屏幕会一起翻">
        <input type="checkbox" checked={o.linked} onChange={(e) => window.presenter.setLinked(o.id, e.target.checked)} className="h-4 w-4 accent-link" />
        联动
      </label>
      <div onClick={stop} className="flex gap-1">
        <Btn title="只让这个屏幕后退一页" onClick={() => window.presenter.nudge(o.id, -1)}>
          −
        </Btn>
        <Btn title="只让这个屏幕前进一页" onClick={() => window.presenter.nudge(o.id, 1)}>
          +
        </Btn>
      </div>
      {o.kind === 'window' && (
        <div onClick={stop} className="flex gap-1">
          <Btn onClick={() => window.presenter.toggleFullscreen(o.id)}>{o.fullscreen ? '退出全屏' : '全屏'}</Btn>
          <Btn onClick={() => window.presenter.removeScreen(o.id)}>关闭</Btn>
        </div>
      )}
    </div>
  )
}

export function ScreensBar({ state }: { state: AppState }) {
  return (
    <footer className="flex items-center gap-3 overflow-x-auto border-t border-line bg-panel px-4 py-3">
      {state.outputs.map((o) => (
        <ScreenCard key={o.id} o={o} selected={o.id === state.selectedId} />
      ))}
      <p className="shrink-0 text-sm text-muted">选中的屏幕会翻页；它勾选了“联动”时，所有联动屏幕一起翻。</p>
    </footer>
  )
}
```

```tsx
// @file src/renderer/src/console/Drawer.tsx
import { Fragment, useEffect, useRef } from 'react'
import type { AppState } from '../../../shared/types'
import { Btn, goToSlide } from './ui'

export type DrawerTab = 'list' | 'notes'

function SlideList({ state, current }: { state: AppState; current: number }) {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [current])
  if (state.slides.length === 0) return <p className="p-2 text-sm text-muted">这份课件没有提供目录。</p>
  let lastSection = ''
  return (
    <div className="flex flex-col gap-0.5">
      {state.slides.map((s, i) => {
        const section = s.sectionLabel || s.section || ''
        const header = section && section !== lastSection ? section : null
        if (section) lastSection = section
        const isActive = i === current
        return (
          <Fragment key={i}>
            {header && <h3 className="mt-2 px-2 text-sm font-semibold text-accent">{header}</h3>}
            <button
              ref={isActive ? active : undefined}
              type="button"
              onClick={() => goToSlide(i)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${isActive ? 'bg-accent/20 text-ink' : 'text-muted hover:bg-panel-2 hover:text-ink'}`}
            >
              <span className="w-7 shrink-0 font-mono">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{s.title || `第 ${i + 1} 页`}</span>
              {s.minutes ? <span className="shrink-0 rounded-full border border-line px-1.5">{s.minutes} 分</span> : null}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

function Notes({ state, current }: { state: AppState; current: number }) {
  const note = state.slides[current]?.notes
  if (!note) return <p className="p-2 text-sm text-muted">这一页没有备注。</p>
  return <p className="p-2 text-base leading-relaxed whitespace-pre-wrap">{note}</p>
}

export function Drawer({ state, tab, onTab }: { state: AppState; tab: DrawerTab; onTab: (t: DrawerTab | null) => void }) {
  const current = state.outputs.find((o) => o.id === 'projector')?.shownIndex ?? 0
  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border-2 border-line bg-panel">
      <div className="flex gap-2 border-b border-line p-2">
        <Btn tone={tab === 'list' ? 'primary' : 'default'} onClick={() => onTab('list')}>
          目录
        </Btn>
        <Btn tone={tab === 'notes' ? 'primary' : 'default'} onClick={() => onTab('notes')}>
          备注
        </Btn>
        <span className="ml-auto">
          <Btn tone="quiet" onClick={() => onTab(null)}>
            收起
          </Btn>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{tab === 'list' ? <SlideList state={state} current={current} /> : <Notes state={state} current={current} />}</div>
    </aside>
  )
}
```

```tsx
// @file src/renderer/src/console/App.tsx
import { useState } from 'react'
import { CurrentPane } from './CurrentPane'
import { Drawer, type DrawerTab } from './Drawer'
import { Header } from './Header'
import { useAppState, useConsoleKeys, useFileDrop, useMirror } from './hooks'
import { NextPane } from './NextPane'
import { ScreensBar } from './ScreensBar'
import { TimerPanel } from './TimerPanel'

export function App() {
  const state = useAppState()
  const mirror = useMirror()
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  useConsoleKeys(state?.timer.alarming ?? false)
  useFileDrop()
  if (!state) return <div className="grid h-full place-items-center text-base text-muted">正在启动…</div>
  const projector = state.outputs.find((o) => o.id === 'projector')
  const next = state.outputs.find((o) => o.id === 'next')
  if (!projector || !next) return null
  const cols = drawer ? 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_20rem]' : 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'
  return (
    <div
      className="flex h-full flex-col"
      onPointerDownCapture={() => {
        if (state.timer.alarming) window.presenter.timerDismiss()
      }}
    >
      <Header state={state} />
      <main className={`grid min-h-0 flex-1 gap-3 p-3 ${cols}`}>
        <CurrentPane state={state} projector={projector} mirror={mirror} drawer={drawer} onDrawer={setDrawer} />
        <div className="flex min-h-0 flex-col gap-3">
          {state.mainDeck ? <NextPane state={state} next={next} /> : <div className="flex-1" />}
          <TimerPanel state={state} />
        </div>
        {drawer && <Drawer state={state} tab={drawer} onTab={setDrawer} />}
      </main>
      <ScreensBar state={state} />
    </div>
  )
}
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build` then `npm run typecheck` — Expected: both succeed.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: presenter main process, deck bridge, console and overlay UI"`

### Task 7: End-to-end smoke test and visual check

**Files:**
- Create: `e2e/smoke.mjs`, `e2e/fixtures/plain-deck.html`

**Interfaces:**
- Consumes: `globalThis.__presenter` (Store) via `PRESENTER_TEST=1`; `PRESENTER_OPEN`.

- [ ] **Step 1: Write the smoke test and the key-mode fixture**

```html
<!-- @file e2e/fixtures/plain-deck.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Plain deck</title>
    <style>
      body { margin: 0; font-family: sans-serif; background: #fff; }
      section { display: none; height: 100vh; place-items: center; font-size: 64px; }
      section.active { display: grid; }
    </style>
  </head>
  <body>
    <section class="active"><h1>Page 1</h1></section>
    <section><h1>Page 2</h1></section>
    <section><h1>Page 3</h1></section>
    <section><h1>Page 4</h1></section>
    <section><h1>Page 5</h1></section>
    <script>
      const pages = [...document.querySelectorAll('section')]
      window.__index = 0
      const show = (i) => {
        window.__index = Math.max(0, Math.min(pages.length - 1, i))
        pages.forEach((p, k) => p.classList.toggle('active', k === window.__index))
      }
      window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') show(window.__index + 1)
        if (e.key === 'ArrowLeft') show(window.__index - 1)
      })
    </script>
  </body>
</html>
```

```js
// @file e2e/smoke.mjs
// End-to-end smoke test. Run after `npm run build`: node e2e/smoke.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const UXD_DECK = process.env.DECK ?? '<Curriculum>/2026-Autumn/UXD202/Final Slides/Week-08-Unit 3 Interaction Design and Prototyping.html'
const PLAIN_DECK = path.join(here, 'fixtures', 'plain-deck.html')
const OUT = path.join(here, 'out')
fs.mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const app = await electron.launch({
  args: [root],
  cwd: root,
  executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  env: { ...process.env, PRESENTER_TEST: '1', PRESENTER_OPEN: UXD_DECK }
})
const errors = []
try {
  const call = (fn, arg) => app.evaluate(fn, arg)
  const state = () => call(() => globalThis.__presenter.getState())
  const out = (s, id) => s.outputs.find((o) => o.id === id)
  async function waitFor(label, pred, ms = 15000) {
    const t0 = Date.now()
    let s
    while (Date.now() - t0 < ms) {
      s = await state()
      if (pred(s)) return s
      await sleep(150)
    }
    throw new Error(`timeout: ${label}\n${JSON.stringify(s?.outputs, null, 1)}`)
  }
  let page
  for (let i = 0; i < 100 && !page; i++) {
    page = app.windows().find((w) => w.url().includes('console.html'))
    if (!page) await sleep(100)
  }
  assert.ok(page, 'console window')
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  const press = async (key) => {
    await page.keyboard.press(key)
    await sleep(250)
  }

  // 1. UXD202 deck is detected on both screens; next preview is one page ahead.
  let s = await waitFor('uxd202 detected', (s) => out(s, 'projector').adapter === 'uxd202' && out(s, 'next').adapter === 'uxd202' && out(s, 'next').shownIndex === 1)
  assert.ok(out(s, 'projector').total > 10, 'total from deck')
  assert.ok(s.slides.length === out(s, 'projector').total, 'slide list')
  console.log('ok 1 detect', out(s, 'projector').total, 'slides')

  // 2. Linked + selected projector: both move.
  await press('ArrowRight')
  s = await waitFor('linked move', (s) => out(s, 'projector').shownIndex === 1 && out(s, 'next').shownIndex === 2)
  console.log('ok 2 linked move')

  // 3. Unlink the preview: the projector moves alone.
  await call(() => globalThis.__presenter.setLinked('next', false))
  await press('ArrowRight')
  s = await waitFor('projector alone', (s) => out(s, 'projector').shownIndex === 2)
  assert.equal(out(s, 'next').shownIndex, 2)
  console.log('ok 3 unlinked stays')

  // 4. Select the preview: only it moves.
  await call(() => globalThis.__presenter.select('next'))
  await press('ArrowRight')
  s = await waitFor('preview alone', (s) => out(s, 'next').shownIndex === 3)
  assert.equal(out(s, 'projector').shownIndex, 2)
  console.log('ok 4 selected unlinked moves alone')

  // 5. Relink, select projector, go back: group keeps the +1 offset.
  await call(() => {
    globalThis.__presenter.setLinked('next', true)
    globalThis.__presenter.select('projector')
  })
  await press('ArrowLeft')
  s = await waitFor('group back', (s) => out(s, 'projector').shownIndex === 1 && out(s, 'next').shownIndex === 2)
  console.log('ok 5 relinked group')

  // 6. Jump from the slide list keeps the offset.
  await call(() => globalThis.__presenter.navigate({ type: 'goto', index: 5 }))
  s = await waitFor('goto', (s) => out(s, 'projector').shownIndex === 5 && out(s, 'next').shownIndex === 6)
  console.log('ok 6 goto')

  // 7. Timer: rings at zero; a key stops the alarm and does not turn the page.
  await call(() => globalThis.__presenter.timerStart(2))
  s = await waitFor('alarm', (s) => s.timer.alarming, 6000)
  await press('ArrowRight')
  s = await waitFor('alarm stopped', (s) => !s.timer.alarming)
  assert.equal(out(s, 'projector').shownIndex, 5)
  console.log('ok 7 timer alarm and dismiss')

  // 8. Extra screen with the same deck joins the linked group.
  await call(() => globalThis.__presenter.addScreen(true))
  s = await waitFor('extra detected', (s) => out(s, 'screen-3')?.adapter === 'uxd202')
  await press('ArrowRight')
  s = await waitFor('extra moves', (s) => out(s, 'projector').shownIndex === 6 && out(s, 'screen-3').shownIndex === 6)
  await call(() => globalThis.__presenter.removeScreen('screen-3'))
  console.log('ok 8 extra screen')

  // 9. Screenshot of the console DOM (the native preview is not in this image).
  await sleep(600)
  await page.screenshot({ path: path.join(OUT, 'console-uxd202.png') })

  // 10. Any HTML: key mode drives a plain deck with real arrow keys.
  await call((_e, p) => globalThis.__presenter.openMainDeck(p), PLAIN_DECK)
  s = await waitFor('keys mode', (s) => out(s, 'projector').adapter === 'keys' && out(s, 'next').adapter === 'keys', 8000)
  const deckIndex = (id) => call((_e, id) => globalThis.__presenter.outputs.get(id).view.webContents.executeJavaScript('window.__index'), id)
  await sleep(400)
  assert.equal(await deckIndex('projector'), 0)
  assert.equal(await deckIndex('next'), 1)
  await press('ArrowRight')
  await press('ArrowRight')
  await sleep(400)
  assert.equal(await deckIndex('projector'), 2)
  assert.equal(await deckIndex('next'), 3)
  console.log('ok 10 key mode')

  // 11. Timer overlay shows on the projector for a key-mode deck.
  await call(() => globalThis.__presenter.timerStart(30))
  await sleep(500)
  const overlayVisible = await call(() => globalThis.__presenter.projectorWin.overlay.getVisible())
  assert.equal(overlayVisible, true)
  await call(() => globalThis.__presenter.projectorWin.win.moveTop())
  await sleep(1200)
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'capture.ps1'), '-Out', path.join(OUT, 'desktop-overlay.png')])
  await call(() => globalThis.__presenter.timerReset())
  console.log('ok 11 overlay')

  assert.deepEqual(errors, [], 'console errors')
  console.log('SMOKE OK')
} finally {
  await app.close()
}
```

- [ ] **Step 2: Run** — `npm run e2e` — Expected: `SMOKE OK`. Fix every failure at its root cause.

- [ ] **Step 3: Visual check at real window size**

Capture the whole desktop while the app runs (PowerShell `System.Drawing` screen copy) with the Week 8 deck open; confirm: preview view sits exactly in its slot, no text below 14 px, nothing clipped at the laptop resolution, overlay pill visible for the plain deck.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "test: end-to-end smoke test for navigation, timer, extra screens, key mode"`

### Task 8: Launcher and guide

**Files:**
- Create: `Start Presenter.bat`, `README.md`

- [ ] **Step 1: Launcher**

```bat
# @file Start Presenter.bat
@echo off
cd /d "%~dp0"
if not exist "out\main\index.js" call npm run build
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
```

(The extractor strips the marker line, so the batch file starts with `@echo off`.)

- [ ] **Step 2: README in plain Chinese** — how to open, keys, link checkbox rule, timer, extra screens, what "按键模式" means, known limits (PDF/PPT later).

- [ ] **Step 3: Desktop shortcut** — create `Presenter.lnk` on the desktop pointing to `Start Presenter.bat` (WScript.Shell), working dir = project root.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs: launcher and user guide"`
