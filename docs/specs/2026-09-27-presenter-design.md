# Presenter — Design (Phase 1: HTML decks)

Date: 2026-09-27 · Owner: Vizen (intent) · Author: Claude (technical decisions, per owner's instruction)

## 1. Intent (confirmed with owner)

- Classroom setup: laptop + projector in **extended** display mode.
- Open any slide file: HTML (phase 1), PDF (phase 2), PPT (phase 3, static pages). Cooperation from a deck is optional; more cooperation = more features.
- Console (laptop): default shows **current slide**, **next slide**, **timer**. Click to expand **slide list** and **notes**. Easy setup of **extra screens with a page offset**.
- Students see the countdown on the projector. Alarm rings until the teacher dismisses it.
- Page-turn rule (owner's wording): each screen has a **link checkbox**. The **selected** screen always moves. If it is linked, every other linked screen moves by the same amount. If it is not linked, only it moves.
- No network needed in class.

Derived from the old shell/hub (`UXD202/Final Slides/UXD202-Presenter-Shell.html`, `UXD202/presenter-hub.mjs`): timer presets + stepper, per-slide planned minutes, milestone dots, deck switching, arrow/space/PageUp/PageDown keys.

## 2. Why a desktop app (Electron)

The browser versions failed on limits no page script can remove: key focus, window placement on the projector, cross-origin `file://` access, background timer throttling, lost tab links after reload. Electron (Chromium + Node) removes all of them and matches the owner's deck stack (TS/React/Vite).

Verified in `spike/` (2026-09-27, Electron 44, Week 8 deck):
- Custom `deck://` protocol + per-session `protocol.handle` serves decks with relative assets; preload BroadcastChannel reaches the deck's `UXD202_SLIDES_SYNC` channel (GOTO, SLIDE_STATE, SYNC_TIMER all work).
- `before-input-event` + `preventDefault` blocks deck key handling. `sendInputEvent` also passes through `before-input-event` → injected keys need a bypass counter.
- Preview scaling: `setZoomFactor(w/1280)` on a view with its **own session partition** keeps a 1280-wide layout; the projector zoom is unaffected (zoom is per-origin per-session). `enableDeviceEmulation` also works but `capturePage` on it hangs → not used.
- `capturePage` of the projector view: ~20 ms, ~16 KB JPEG at 480 px → mirror at ~4 fps is cheap.

## 3. Architecture

Main process is the single source of truth. Windows only render state and send intents.

```
main
 ├─ Store        outputs, main deck, timer, selection → pushes AppState to console
 ├─ Navigator    pure planMove(outputs, selectedId, action) → index changes
 ├─ Timer        pure state machine, clock injected; ticked every 200 ms in main
 ├─ InputRouter  before-input-event on every webContents → nav intents
 ├─ Outputs      one Output per screen: WebContentsView + own session + adapter
 │    adapters: uxd202 (BroadcastChannel via preload) | keys (sendInputEvent)
 ├─ Displays     pick external display, follow display-added/removed
 └─ Mirror       capturePage loop of the projector view → console
windows
 ├─ Projector    BaseWindow on external display, fullscreen; deck view + timer overlay view
 ├─ Console      BrowserWindow on laptop display; React UI; hosts the "next" preview view
 └─ Extra        BaseWindow per extra screen (added from console)
```

### Outputs
- `projector` (index 0, linked), `next` (index 1, linked, lives in console), extras (added by user in their own window, default index = projector index for "same deck" / 0 for "another deck", linked on — the old tool's linked tabs always followed).
- Each output keeps a **logical index**; shown index = clamp to deck range. Offsets are preserved when a linked screen hits a deck end.
- Each output has its own in-memory session partition (`out-<id>`): isolates zoom, BroadcastChannel traffic, and storage.

### Navigation (`planMove`)
- `step(±1)` / `goto(n)` / `first` / `last` act on the **selected** output.
- Selected move blocked when it would leave its deck range.
- Unlinked selected → only it moves. Linked selected → every linked output moves by the same delta.
- Deck-initiated moves (clicks on a UXD202 navbar) arrive as SLIDE_STATE with an unexpected index → treated as a step request from that output (it becomes selected). A `pending` target per output (1.5 s) filters stale SLIDE_STATE echoes.

### Input
- Next: ArrowRight, ArrowDown, PageDown, Space. Prev: ArrowLeft, ArrowUp, PageUp. Home/End: first/last.
- Intercepted on keyDown **and** keyUp in every app webContents, except when the deck reports an editable element has focus.
- Key from an output's webContents selects that output first. Focus/click on an output selects it.
- Injected keys (keys adapter) pass via a per-webContents bypass counter.

### Adapters
- `uxd202`: detected when the deck answers PING with SLIDE_STATE within 2.5 s. Gives total, titles, sections, minutes, milestones. goto = `GOTO`; timer = `SYNC_TIMER` (projector only).
- `keys` (L0): any HTML. goto = |Δ| arrow key presses. Total unknown.
- Phase 4 adds the open `presenter` protocol + SDK + sidecar recipes; phase 2/3 add PDF (pdf.js) and PPT (PowerPoint COM → PDF, LibreOffice fallback).

### Timer
- States: idle → running ⇄ paused → done(alarming) → idle (dismiss).
- Preset/Set start immediately (old behaviour). Play when idle starts the default duration = planned minutes of the projector's current slide, else last duration.
- Display: console always; projector via deck navbar (`uxd202`, deck plays the chime) or overlay view (others, overlay plays the chime). Console never plays sound → one alarm only.
- Dismiss: any key/click in console or projector; deck-side dismiss is detected from SLIDE_STATE. A key that dismisses the alarm does not also turn the page.
- The deck's own timer buttons (UXD202 navbar on the projector) are followed: start/pause/reset reported in SLIDE_STATE are adopted, with a 1 s guard after our own commands (fixes the old "frozen deck timer inside the shell" bug).
- Key-mode decks are driven with trusted keys over the DevTools protocol (`Input.dispatchKeyEvent`), which works without window focus (spike 2).
- `autoplay-policy=no-user-gesture-required` so the chime always plays.

### Displays
- External = first non-primary display → projector frameless fullscreen there. None → 960×540 framed window on primary, title says no second screen. Follows display-added/removed.
- Console maximized on the primary display. Closing the console quits the app.

### Security
- Decks: `contextIsolation`, `sandbox`, no Node. `deck://` handler rejects paths outside the deck folder. Popups denied; http(s) links open in the default browser; deck navigation away is blocked.

## 4. Console UI (Chinese labels)
Header (file name, 打开, 最近, 抽人, 指引, language, projecting) · Current = projector mirror (click selects projector) · Next = live preview · Timer panel (big mm:ss, ▶/⏸, ↺, presets 1/3/5/8/10/15/20, stepper, planned-minutes hint) · Screens bar (small cards that wrap: live dot, name, n/total, ☑ 联动, −/+, ⋯ menu with text size/full screen/close for extras; ＋ 添加屏幕 at the end; long text only in tooltips) · Expanders 目录 / 备注 · Milestone dots · Drop zone + recent files when empty. Text ≥ 14 px.

## 5. Testing
- Unit (vitest): planMove, timer machine, deck path guard, key classification.
- E2E smoke (playwright-core `_electron`): open Week 8 deck, press keys in console, assert store indices for linked/unlinked cases, timer start/done/dismiss.
- Manual gate with owner: real projector.

## 5a. Change 2026-09-27 — projecting is an explicit action (owner request)

Owner feedback: a projector window that opens with the app is confusing; projecting must start from its own button.
- App start: console only. The projector deck view lives in the console's "current" pane (live, interactive), laid out at the target size (external display size, else 1280x720) via zoom.
- **▶ 开始投影 (F5)** moves the same view into the projector window (zoom 1), shows it full-screen on the external display (window mode without one) with `showInactive` so the console keeps focus; the current pane switches to the mirror.
- **■ 停止投影 (Esc)** or closing the projector window hides it and moves the view back. Esc stops projecting from the console and from the projector window only (other screens keep Esc for their own deck).
- The timer overlay and the mirror run only while projecting. Header menus hide the native views while open (native views draw above the page).

## 5b. Change 2026-09-28 — 字号 and 抽人 (owner requests)

- **字号**: per-screen page zoom (Chrome steps 50–300 %), Ctrl +/−/0 and Ctrl+wheel on the selected screen, controls in the current-pane header (projector) and on extra-screen cards. The next preview follows the screen it previews. Remembered per deck file (`userData/zoom.json`). Effective zoom = fit factor × percent.
- **抽人** (from the owner's `lucky_roller.html`): same weights (1 for not picked; 0.05 / wins when "Super Lucky" is on; excluded when off), same colours (green once, gold more than once). Named lists saved in `userData/roller.json` (seeded with the old page's 18-name list); pick counts per list for the app session. A full-screen `RollerOverlay` view sits above the deck on every students' screen (projector while projecting + every extra screen); all play one precomputed ease-out path from a shared wall-clock start; one screen plays the sound. Keys and clicks are ignored until the highlight lands (+400 ms); then the first key/click closes the picture without turning the page. Stack on the projector: deck, 抽人, timer.
- Safety: with 2+ displays (a class may be live) desktop capture refuses to run and e2e runs hidden (`PRESENTER_HEADLESS`: no window shows, every page muted, steps 1–8 only); tests use their own userData.
- Next preview: not a screen and not in the screens bar. It shows the slide after the last selected real screen's slide (same deck, same text size) and never links. Clicking its pane selects it: page keys, the slide list and notes then act on the preview alone (look ahead; students see nothing change). Selecting a real screen snaps it back to that screen + 1.

## 5c. Change 2026-09-28 — PPT/PPTX/PDF (owner: PPTX is the main format for other teachers)

Owner chose "both": stage 1 page-by-page for every machine, stage 2 PowerPoint live show (keeps animations) where PowerPoint is installed.
- Stage 1 (done): `convert.ts` turns .pptx/.ppt/.ppsx/.pps/.pptm/.odp into `deck.pdf` + `meta.json` in `userData/converted/<sha1(version|path|size|mtime)>/`. Converter order: PowerPoint COM (invisible: read-only, no window, `ExportAsFixedFormat` print quality, hidden slides excluded; quits PowerPoint only if it started it), then LibreOffice headless with a private profile. `pptxMeta.ts` reads titles (title/ctrTitle placeholders, else first text) and body-placeholder notes in presentation order, skipping `show="0"` slides, so titles align with PDF pages.
- The viewer (`pdfdeck.html`, pdf.js 6) is served under `/__presenter__/` on the deck's own `deck://` host and speaks the UXD202 sync protocol with `ownTimer: false`, so every existing feature (linking, previews, timer overlay, 抽人) works unchanged. Plain PDFs take titles from page text.
- Verified off-screen (`npm run check:viewer`, no window) with a real UXD202 lecture (29 slides, 11 hidden → 18 pages, 18 titles, 8 with notes) via LibreOffice (~10 s first time, cached after). PowerPoint conversion path: not yet run (needs a moment with no class on the projector).
- Stage 2 (next, needs a GUI spike): drive PowerPoint's own slide show through a persistent PowerShell COM bridge (Next/Previous/GotoSlide, poll CurrentShowPosition/GetClickIndex), place the show window on the projector display (SlideShowWindow.HWND + SetWindowPos), host timer and 抽人 in a transparent always-on-top click-through window above it; console keeps the page viewer for current/next.

## 6. Out of scope (phase 1)
PDF, PPT, open protocol/SDK, recipe wizard, global hotkeys (planned as opt-in toggle), blackout key, installer (phase 1 ships a `Start Presenter.bat` + portable build later).
