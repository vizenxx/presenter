# Presenter deck protocol, version 1

Presenter shows any HTML deck. How much it can do depends on how the deck talks to it:

| Level | What the deck does | What Presenter can do |
|---|---|---|
| Key mode | Nothing special | Turn pages with arrow keys, timer, marks, picker. Page count unknown. |
| Framework | Built with **Reveal.js**, **remark**, **impress.js** or **Marp** | Everything below; Presenter connects through the framework's own API. |
| Plain slides | One element per slide with class `slide` (or `data-slide`), the current one marked `active` | Page count, titles (`data-title`, `.slide-title` or a heading), notes (`data-notes`, `data-speaker-script`, `.notes` …), minutes (`data-minutes` or “N min” in `.slide-duration`), jumps through the deck's own `goToSlide()` or its arrow keys. |
| Protocol | Follows this page (easiest with [`sdk/presenter-bridge.js`](../sdk/presenter-bridge.js)) | Page count, slide list, speaker notes, planned minutes, exact jumps, linked screens. |

PPT, PPTX and PDF files need nothing: Presenter converts them and shows them page by page.

## Transport

- The deck page opens a [`BroadcastChannel`](https://developer.mozilla.org/docs/Web/API/BroadcastChannel) named **`presenter-sync-v1`**.
- Presenter opens every screen's copy of the deck with `?tabId=<screen id>` in the address. The deck copies that `tabId` into every message it sends.
- Messages to the deck carry `targetTabId`. A deck ignores messages whose `targetTabId` is set and differs from its own `tabId`.
- Outside Presenter nobody listens, so the deck works as a normal web page.

## Deck → Presenter

`SLIDE_STATE`, sent when the deck starts, after every slide change, and in reply to `PING`:

| Field | Type | Meaning |
|---|---|---|
| `type` | `"SLIDE_STATE"` | |
| `protocol` | `1` | This version. |
| `tabId` | string | From the address (`?tabId=`). |
| `currentSlide` | number | Current slide, **0-based**. |
| `totalSlides` | number | Number of slides. |
| `metadata` | array | One entry per slide: `{ title, notes?, minutes?, section?, sectionLabel? }`. `minutes` is the planned time for the slide (the console timer suggests it). `notes` is shown only to the teacher. |
| `milestones` | array | Optional jump points: `{ label, slideIndex, range?: [first, last] }`. |
| `ownTimer` | boolean | `true` only when the deck displays Presenter's countdown itself (see `SYNC_TIMER`). Otherwise Presenter shows its own timer on the projector. |

## Presenter → deck

| Message | Fields | The deck must |
|---|---|---|
| `PING` | `targetTabId` | Send `SLIDE_STATE`. |
| `GOTO` | `slideIndex` (0-based), `targetTabId` | Show that slide as a whole (all build steps visible), then send `SLIDE_STATE`. |
| `SYNC_TIMER` | `remaining` (seconds or `null`), `isRunning`, `isDone` | Only for `ownTimer: true` decks: display the countdown. |

## Rules

1. Slide numbers are 0-based everywhere.
2. Presenter takes the page-turn keys (arrows, PageUp/PageDown, Space, Home/End) and drives the deck with `GOTO`. A deck must not depend on receiving them.
3. Presenter serves only the deck's own folder. Keep images, fonts and scripts inside it, or inline in a single HTML file. Decks must also work offline.
4. Do not open new windows or pop-ups.
5. Speaker notes must never be visible on the slide.

## Start here

- The bridge script: [`sdk/presenter-bridge.js`](../sdk/presenter-bridge.js) (about 50 lines, no dependencies).
- A complete deck to copy: [`examples/minimal-deck.html`](../examples/minimal-deck.html).
- Building a deck with an AI assistant: paste the text in [`ai-integration.md`](ai-integration.md) into your request.

Legacy: UXD202 decks use the channel `UXD202_SLIDES_SYNC` with the same messages; Presenter listens on both.
