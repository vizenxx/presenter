# Presenter

Presenter shows a deck full screen on the projector and gives the teacher a console on the laptop screen.

中文说明：[README.zh-CN.md](README.zh-CN.md). The interface is English only.

## Download

The newest zips are on the **[Releases page](https://github.com/vizenxx/presenter/releases/latest)**, under **Assets**: `…-win.zip` for Windows, `…-mac.zip` for a Mac. Anyone can open that page: send other teachers the link.

## Open (nothing to install)

Presenter is a folder you unzip; there is no installer and no administrator password.

**Windows**

1. Right-click `Presenter-0.1.0-win.zip` → **Extract All**. Put the folder anywhere (for example Documents).
2. In the folder, double-click **Presenter** (the file with the Presenter icon). It opens in about 2 seconds.
3. For a desktop icon: right-click **Presenter** → **Show more options → Send to → Desktop (create shortcut)**.
4. The app is not signed yet. When the zip came from the internet, Windows may show "Windows protected your PC": click **More info → Run anyway** once.
- On this computer the desktop icon can also start the source copy (`Start Presenter.bat`).

**Mac** (macOS 13 Ventura or later, Intel or Apple silicon)

1. Double-click `Presenter-0.1.0-mac.zip`. It becomes **Presenter**. Double-click it to open (moving it to **Applications** is optional).
2. The first time, macOS may say it cannot check the app. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. This is needed once, until the app is signed with an Apple Developer ID.
3. PPT and PPTX files open through **Keynote** (free on every Mac). The first time, macOS asks "Presenter wants to control Keynote": click **OK**. Keynote opens a window while it converts, then closes. Without Keynote, LibreOffice works too.
4. Mac shortcuts: **⌘ Return** or **fn F5** starts projecting; **⌘ +**, **⌘ −**, **⌘ 0** set the text size; **⌘ Z** undoes a mark; **delete** clears the marks.
5. The console copies the projector picture a few times a second. For a live (video) copy, allow Presenter under **System Settings → Privacy & Security → Screen & System Audio Recording**, then restart Presenter.

## Show a deck

1. Drop a deck file on the console, or click **Open deck**. PPT, PPTX, PDF and HTML are supported. The deck first shows in the console only; students cannot see it yet.
2. Click **▶ Start projecting** (top right) or press **F5**. The deck goes full screen on the projector.
3. Click **■ Stop projecting** or press **Esc**. The projector closes and the deck comes back to the console.
4. Set the projector to **Extend** mode. Without a projector, projecting opens a normal window (good for practice at home).

### Other people's HTML decks

- Decks built with **Reveal.js**, **remark**, **impress.js** or **Marp** connect automatically: page count, slide list, notes and exact jumps work.
- Plain HTML decks with one `.slide` element per slide (the current one marked `active`) also connect: page count, titles, speaker notes (e.g. `data-speaker-script`, `.notes`) and planned minutes are read from the page.
- Any other HTML deck still works in *key mode*: pages turn with arrow keys; the page count is unknown.
- **Slides** and **Notes** show the deck of the selected screen, so an extra screen with another deck shows its own list and notes.
- To make a new deck work fully, follow [docs/protocol.md](docs/protocol.md), start from [examples/minimal-deck.html](examples/minimal-deck.html), or — when an AI assistant builds the deck — paste the block in [docs/ai-integration.md](docs/ai-integration.md) into your request.
- In the app, **📘 Guide** (top bar, or the link on the start screen) has two parts: **1 · Use Presenter** ("I want to … → do this") and **2 · Prepare decks** (which decks need nothing, the AI request to copy, the example deck and the protocol to save).

### PPT and PDF

- A PPT is converted for showing first. The first time takes about 10–20 seconds; the console shows the progress. After that the same file opens at once.
- Conversion uses PowerPoint; without PowerPoint it uses LibreOffice. With neither, save the PPT as PDF first.
- Each slide shows its final picture: click-by-click animations and videos do not play yet. A show mode that keeps animations is in development.
- Hidden slides are left out, as in PowerPoint's own show.
- Slide titles appear under **Slides**, speaker notes under **Notes**.
- PPT and PDF show whole pages, so **Text size** does not apply to them.

## Page turns

- A clicker, the arrow keys, PageUp / PageDown and Space turn pages. Home and End go to the first and last page.
- **The selected screen always turns. If it is Linked, every linked screen turns with it.** An unlinked selected screen turns alone.
- Select a screen by clicking its picture or its card in the **Screens** bar at the bottom. The card's **− / +** moves only that screen.
- **Next slide** shows the slide after the selected screen's slide. Click it to look further ahead: page keys then turn only the preview, and students see nothing change. Click the current slide (or a screen card) to go back; the preview returns to the next slide. It never links and has no card.

## Marks on the slide

The bar above the current slide: **Pointer, Pen, Highlighter, Box, Laser, Eraser**, six colours, **Undo** and **Clear**.

- Draw on the console's slide picture or directly on the projector; both show the same marks at once.
- While projecting, moving the mouse on the projector shows a small tool palette at its bottom left (it hides after a few seconds).
- Marks are temporary: they clear when the projector shows another page.
- Keys in the console: **P** pen, **H** highlighter, **R** box, **L** laser, **E** eraser, **Ctrl+Z** (⌘Z) undo, **Delete** clear.
- **Esc** first returns to the pointer; a second **Esc** stops projecting.

## Timer

- Click a preset (**1 min**, **5 min**, …) to start at once, or set minutes and click **Start**.
- When the deck plans a time for a slide, the timer shows it.
- At zero the alarm rings until you press any key or click. That key does not turn the page.
- UXD202 decks show the countdown in their own bar; other decks show it at the bottom right of the projector.
- **My timer** (bottom right of the console) is only for you: **Count up** or **Count down** to pace your talk. Students never see it and it makes no sound. A countdown keeps going past zero as **Over time**.

## Name picker

Click **🎲 Name picker**. Choose a list and click **🎲 Pick a name**: the list rolls on the projector and the extra screens, slows down and stops on one person. After it stops, any key or click hides it; that key does not turn the page. The rules are those of the earlier Lucky Roller page.

- Under the button, **Picked so far: X of Y** counts the picks. **↺ Reset** (after a confirmation) makes everyone in the list unpicked again.
- The first start has a sample list: click **Edit** and paste your own (one person per line; a number in front is optional).
- Lists are saved; picks last while the app is open.

## Extra screens and text size

- Each card in the bottom bar is one **content**: a deck or a program window. It remembers its own page.
- **＋ Add screen** (end of the bar) adds a content: the same deck, another deck, or **A window on this computer**. A new content **waits**; no window opens.
- The card's **Projector ▾** button decides where the audience sees it: **Projector 1** (the main projector), another projector, **New projector** (a second projector or TV; it opens full screen on a free display, else as a window), or **Not shown**. A projector shows one content at a time; the one it showed before waits and keeps its page, so you can switch back and go on where you were. The same menu has full screen and close for Projector 2, 3 ….
- Clicking a card only **selects** it: page keys, Next slide and Notes follow it, and the audience keeps seeing the same thing. Use this to look through a waiting deck quietly.
- **A window on this computer** lists every program window, minimized ones too (as in Zoom). The real window stays on your laptop, where you use it as usual; a projector shows it live. Adding it or clicking its card changes nothing on your screen; choosing a projector for it brings the window to the front (restored if minimized). Page turns, marks and notes do not apply to it; **✕** removes it. (On a Mac, bring the window forward yourself, and allow Screen Recording once.)
- A deck card's **⋯** menu has text size and **Remove**.
- **Floating tools** (Windows): while a program window shown on a projector is in front, a small toolbar floats on top of the screen with the marking tools, the class timer, My timer and the name picker. With a drawing tool you draw right on the window; the marks show on the projector over the window's picture, and stay until you clear them (or the window leaves the projector). With the pointer you use the window as usual. **◂** folds the toolbar, **⠿** moves it. The audience never sees the toolbar. It hides when you switch to the console or another program.
- **Text size** (Ctrl + / Ctrl − / Ctrl 0; ⌘ on a Mac) enlarges an HTML deck on one screen and is remembered per deck file. The next preview follows the screen it previews.

## For maintainers

- Source: `src/`. Design: `docs/specs/`. Plans: `docs/superpowers/plans/`.
- `npm run build` (build), `npm test` (unit tests), `npm run e2e` (end-to-end). With a second display connected (a class may be on the projector) it runs hidden and muted, without the projecting steps.
- `npm run check:start` starts the app hidden and muted (safe with a projector connected), one start at a time and 8 at once, and checks that the console gets its state. Every start writes `startup-log.txt` in the app data folder (`%APPDATA%\presenter` on Windows, `~/Library/Application Support/Presenter` on a Mac): if the console ever stays on "Starting…", that file shows the step that did not happen.
- Off-screen checks that open no window: `npm run check:viewer` (PPT/PDF), `npm run check:ink` (marks), `npm run check:frameworks` (Reveal.js, remark, impress.js, Marp, protocol example), `npm run check:console` (console layout, English and Chinese).
- Real conversions: `PRESENTER_CONVERT_IT=libreoffice npm test` (or `powerpoint`, `keynote` on a Mac).
- Zips: `npm run dist:win` (Windows) and `npm run dist:mac` (only on a Mac). Without a Mac, run the **Build app zips** workflow on GitHub (`.github/workflows/build.yml`): it builds both and replaces the Releases page of this version (text: `.github/release-notes.md`). Raise `version` in `package.json` for a new version. (A single-file portable exe was tried: it unpacks into %TEMP% at every start, and on some PCs Chromium's sandbox cannot start from there.) Icon source: `build/icon.svg` (`npx electron tools/make-icon.cjs build`).
- `PRESENTER_EXE=<unzipped folder>/Presenter.exe node e2e/smoke.mjs` runs the end-to-end test on a packaged app.
- After any source change run `npm run build`, or the desktop icon still opens the old version.
