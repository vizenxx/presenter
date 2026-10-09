# Presenter

Presenter shows decks (HTML, PDF, PPT, PPTX, Keynote) and program windows (a browser, a video …) on one or more projectors, and gives the teacher a console on the laptop. It runs on Windows and Mac, is free, and needs no installation.

中文说明：[README.zh-CN.md](README.zh-CN.md). The interface is English only.

## Download

The newest zips are on the **[Releases page](https://github.com/vizenxx/presenter/releases/latest)**, under **Assets**: `…-win.zip` for Windows, `…-mac.zip` for a Mac. Anyone can open that page: send other teachers the link.

## Open (nothing to install)

Presenter is a folder you unzip; there is no installer and no administrator password.

**Windows**

1. Right-click the downloaded `Presenter-…-win.zip` → **Extract All**. Put the folder anywhere (for example Documents).
2. In the folder, double-click **Presenter** (the file with the Presenter icon). It opens in about 2 seconds.
3. For a desktop icon: right-click **Presenter** → **Show more options → Send to → Desktop (create shortcut)**.
4. The app is not signed. When the zip came from the internet, Windows may show "Windows protected your PC": click **More info → Run anyway** once.

**Mac** (macOS 13 Ventura or later, Intel or Apple silicon)

1. Double-click the downloaded `Presenter-…-mac.zip`. It becomes **Presenter**. Double-click it to open (moving it to **Applications** is optional).
2. The first time, macOS may say it cannot check the app. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. This is needed once.
3. PPT and PPTX files open through **Keynote** (free on every Mac). The first time, macOS asks "Presenter wants to control Keynote": click **OK**. Keynote opens a window while it converts, then closes. Without Keynote, LibreOffice works too.
4. Mac shortcuts: **⌘ Return** or **fn F5** starts projecting; **⌘ +**, **⌘ −**, **⌘ 0** set the text size; **⌘ Z** undoes a mark; **delete** clears the marks.
5. In **System Settings → Privacy & Security**, allow Presenter under:
   - **Screen & System Audio Recording**: needed to show program windows (and their titles in the list), and for a live copy of the projector in the console. Restart Presenter after allowing it.
   - **Accessibility** (optional; Presenter asks when you add the first program window): brings forward the exact window you chose and un-minimizes it. Without it the whole program comes forward instead.

## The console at a glance

| Area | What it does |
|---|---|
| Top bar | **Open deck**, **Recent**, **🎲 Name picker**, **📘 Guide**, **☀ / ☾** (light or dark look), **▶ Start projecting** |
| Current slide (left) | What Projector 1 shows. Before projecting it is the deck itself; while projecting it is a live copy of what the audience sees. The mark tools are above it. |
| Next slide (right) | The slide after the selected card's slide. Click it to look further ahead. |
| Class timer | The countdown the audience sees on the projector. **🔔** next to its name: its warning bells. **±**: give it more or less time. |
| My timer | Your own timer. Only you see it. |
| Slides / Notes | The slide list and speaker notes of the selected card (buttons above the current slide). |
| Bottom bar | One card per content (deck or program window), each with its **Projector ▾** button. **＋ Add screen** at the end. |

The **📘 Guide** in the app has the same help in two parts: **1 · Use Presenter** ("I want to … → do this") and **2 · Prepare decks**.

## Start

1. Drop a deck file on the console, or click **Open deck** (it starts in the folder of the deck you opened last). No deck? Click **Show a program window…** on the start screen: a browser, a video or any open program window goes on Projector 1 instead.
2. Click **▶ Start projecting** (top right) or press **F5**. Projector 1 goes full screen on the projector.
3. Click **■ Stop projecting** or press **Esc**. The projector closes; the console keeps everything.
4. **B** makes the projectors black, **W** white (also **⬛ Black screen** in the top bar, and the "blank" button of many clickers). The same key, any other key or a click shows the slides again; that key does not turn the page.
5. While you project, while a projector is open or while a timer runs, Presenter keeps the laptop and the projector from going to sleep.
6. Set the projector to **Extend** mode. Without a projector, projecting opens a normal window (good for practice at home).

### Other people's HTML decks

- Decks built with **Reveal.js**, **remark**, **impress.js** or **Marp** connect automatically: page count, slide list, notes and exact jumps work.
- Plain HTML decks with one `.slide` element per slide (the current one marked `active`) also connect: page count, titles, speaker notes (e.g. `data-speaker-script`, `.notes`) and planned minutes are read from the page.
- Any other HTML deck works in **Key mode**: pages turn with the arrow keys; the page count is unknown, so the card shows only the page number.
- To make a new deck work fully, follow [docs/protocol.md](docs/protocol.md), start from [examples/minimal-deck.html](examples/minimal-deck.html), or, when an AI assistant builds the deck, paste the block in [docs/ai-integration.md](docs/ai-integration.md) into your request (the Guide can copy it for you).

### PPT, PPTX, Keynote and PDF

- A PPT is converted for showing first. The first time takes about 10–20 seconds; the console shows the progress. After that the same file opens at once.
- Conversion uses PowerPoint (Windows) or Keynote (Mac), else LibreOffice. With none of them, save the PPT as PDF first.
- Each slide shows its final picture: click-by-click animations and videos do not play.
- Hidden slides are left out, as in PowerPoint's own show.
- Slide titles appear under **Slides**, speaker notes under **Notes**.

## Turn pages

- A clicker, the arrow keys, PageUp / PageDown and Space turn pages. Home and End go to the first and last page.
- **The selected card turns.** If it is **Linked**, every linked card turns with it; if not, it turns alone.
- Select a card by clicking it, or by clicking its picture. The selected card has a blue border.
- **−** and **+** on a card move only that card, e.g. to set how many pages two decks are apart.
- **Next slide** shows the slide after the selected card's slide. Click it to look further ahead: page keys then turn only the preview, and the audience sees no change. Click the current slide or a card to go back.

## Contents and projectors

- Each card in the bottom bar is one **content**: a deck or a program window. It remembers its own page.
- **＋ Add screen** adds a content: the same deck, another deck, or **A window on this computer**. A new content **waits**; nothing opens.
- The card's **Projector ▾** button decides where the audience sees it:
  - **Projector 1**: the main projector.
  - **Projector 2, 3 …**: projectors you opened.
  - **New projector**: a second projector or a TV. It opens full screen on a free display, else as a normal window.
  - **Not shown**: the content waits.
- A projector shows one content at a time. The content it showed before waits and **keeps its page**, so you can switch back and go on where you were.
- The same menu has **full screen** and **close** for Projector 2, 3 …. Closing a projector lets its content wait.
- **Clicking a card only selects it**: page keys, Next slide and Notes follow it, and the audience keeps seeing the same thing. Use this to look through a waiting deck quietly.
- A deck card's **⋯** menu has text size and **Remove**; a window card has **✕**.
- A green dot on the Projector button means the audience sees that content now.

## Program windows

- **＋ Add screen → A window on this computer** (or **Show a program window…** on the start screen) lists every program window, minimized ones too, as in Zoom.
- The real window stays on your laptop, where you use it as usual; the projector shows it live.
- Adding a window or clicking its card does not move the window. Choosing a projector for it brings it to the front (restored if it was minimized).
- Page turns and notes do not apply to a window. **✕** on its card removes it.
- On a Mac this needs Screen Recording, and Accessibility for the exact window (see **Open → Mac**). Windows on another desktop Space count as minimized.

### Floating tools

While a program window shown on a projector is in front, a small toolbar floats at the top of the screen:

- The mark tools. With a drawing tool you draw right on the window; the marks show on the projector over the window's picture. With the pointer, you use the window as usual.
- While you draw on a window, the toolbar takes the keyboard: **Ctrl+Z** (⌘Z) undoes a mark, **Esc** returns to the pointer and gives the keyboard back to the window.
- **⏱**: the class timer. It shows the time left while it runs; click it for the timer's settings.
- **🎲 Roll**: picks a name; the name shows next to the button.
- **Mine**: My timer's time, once you started it in the console.
- **◂** folds the toolbar; drag **⠿** to move it.

The audience never sees the toolbar. It hides when you switch to the console or another program.

## Marks

The bar above the current slide: **Pointer, Pen, Highlighter, Box, Arrow, Laser, Eraser**, six colours, **Undo** and **Clear**.

- Draw on the console's slide picture or directly on the projector; both show the same marks at once.
- While projecting, moving the mouse on the projector shows a small tool palette at its bottom left (it hides after a few seconds).
- Marks on a deck clear when the page changes. Marks on a program window stay until you clear them or the window leaves its projector.
- **Arrow**: drag from where the arrow starts to where it points. The tip has an open V head.
- Hold **Shift** while you draw: the pen and the highlighter draw one straight line (any angle), the box becomes a square, the arrow turns in 45° steps.
- Keys in the console and on the floating toolbar: **P** pen, **H** highlighter, **R** box, **A** arrow, **L** laser, **E** eraser, **Ctrl+Z** (⌘Z) undo, **Delete** clear.
- **Ctrl+Z** and **Esc** also work after you click on a slide (in the console or on the projector).
- **Esc** leaves any drawing tool (back to the pointer); in the console a second **Esc** stops projecting.

## Timers

**Class timer** (the audience sees it)

- Click a preset (**1 min**, **5 min** …) to start at once. Or type the time in **Set** (minutes **:** seconds): the big time shows it, and the one **Start** button starts it (Enter in a box starts too). **−** and **+** change the minutes; hold them to go fast. A box can be emptied while you type. While the timer runs, **Set** rests: use **±**, or **Reset** to set a new time.
- When a deck plans a time for a slide, the timer shows it.
- **🔔 Warning bells**: the 🔔 button next to the class timer's name (it shows how many bells are set) opens them in a pop-up: each bell beeps its own number of times (1–9) when its time is left (minutes : seconds). The bells are listed in the order they ring. **＋ Add a bell** adds one (up to 5); **✕** removes one. At first there is one bell: 1:00 left, 3 beeps. Presenter remembers the bells. In the last 5 seconds it always beeps once a second.
- At zero the alarm rings until you press any key or click. That key does not turn the page.
- UXD202 decks show the countdown in their own bar; everything else shows it at the bottom right of the projector.

**My timer** (only you see it)

- **Count up**, **Count down**, or **From–to**, to pace your talk. It makes no sound.
- **From–to**: click **🕘** and set your class periods: for each period, its weekdays (Mon … Sun) and its start and end on the 12-hour clock (hour : minute, **AM** or **PM**); up to 6 periods, two on one day are fine; they are listed by weekday, then by start time. During today's period My timer counts down to its end by itself; for 30 minutes after the end it shows **Over time**; before the next period it shows "Starts at 2:00 PM"; with none left today, "No class period now". There is no Start button in this mode. **±** changes only today's end. Presenter remembers the periods.
- A countdown keeps going past zero as **Over time**, in red.
- The floating toolbar shows its time while it runs.

**Change the time** (**±** on either timer)

- **±** opens a pop-up for that timer (you can still switch to the other one there). Type an amount (minutes : seconds), then click **− 1:00** to take it away or **+ 1:00** to add it.
- It changes a timer that runs or is paused; a timer that has not started stays as it is.
- The class timer keeps at least one second, so taking away too much makes it ring a second later. After it rang, **+** makes it run again for that time (for example "two more minutes").
- Taking time away past a warning bell's time rings that bell.

## Name picker

Click **🎲 Name picker** (top bar). Choose a list and click **🎲 Roll**: the list rolls on the projectors, slows down and stops on one person. After it stops, any key or click hides it; that key does not turn the page.

- Everyone not yet picked has the same chance. With "People already picked can be picked again (small chance)" on, picked people may come up again, rarely.
- **Picked so far: X of Y** counts the picks; **↺ Reset** (after a confirmation) makes everyone unpicked again. Picks last while the app is open.
- The first start has a sample list: click **Edit** and paste your class (one person per line; a number in front is optional). **New** makes another list. Lists are saved.
- Without projecting, only you see the roll (in the console, or next to **Roll** on the floating toolbar).

## Light or dark look

**☀ / ☾** in the top bar switches the console and the floating toolbar between a light and a dark look. Presenter remembers the choice; until you choose, it follows the computer's setting. The projector does not change.

## Text size

**Text size** (Ctrl + / Ctrl − / Ctrl 0; ⌘ on a Mac) enlarges an HTML deck in steps of 5 % and is remembered per deck file. Hold **A−** or **A+** to change it fast. It is above the current slide for Projector 1 and in a card's **⋯** menu for the others. PPT and PDF show whole pages, so it does not apply to them.

## If something goes wrong

- **A window is not in the list**: open the program first (it may be minimized). Presenter's own windows are not listed.
- **A PPT does not open**: install PowerPoint, Keynote (Mac) or LibreOffice, or save the PPT as PDF.
- **The console stays on "Starting…"**: leave it open and send the file `startup-log.txt` from the app data folder (`%APPDATA%\presenter` on Windows, `~/Library/Application Support/Presenter` on a Mac). It shows the step that did not happen.

## For maintainers

- Source: `src/`. Design: `docs/specs/`. Plans: `docs/superpowers/plans/`.
- `npm run build` (build), `npm test` (unit tests), `npm run e2e` (end-to-end, 17 steps). With one display it opens windows and plays sounds; with a second display connected (a class may be on the projector) it runs hidden and muted, without the projecting steps. It never takes pictures of the screen. `PRESENTER_E2E_HIDDEN=1 npm run e2e` runs it hidden and muted on one display too.
- Checks that open no window: `npm run check:viewer` (PPT/PDF), `npm run check:ink` (marks: pen, box, eraser, arrow, Shift shapes), `npm run check:frameworks` (Reveal.js, remark, impress.js, Marp, plain slides, protocol example), `npm run check:console` (console layout in the dark and the light look, menus, start screen, floating toolbar and its timer, typing in the timer boxes, the 🔔 and ± pop-ups, holding A+), `npm run check:start` (starts hidden and muted, one by one and 8 at once).
- Real conversions: `PRESENTER_CONVERT_IT=libreoffice npm test` (or `powerpoint`, or `keynote` on a Mac).
- Zips: `npm run dist:win` (Windows) and `npm run dist:mac` (only on a Mac). Without a Mac, run the **Build app zips** workflow on GitHub (Actions tab, or `gh workflow run build.yml`; a push alone does not start it): it builds both and replaces the Releases page of this version (text: `.github/release-notes.md`). Raise `version` in `package.json` for a new version. Icon source: `build/icon.svg` (`npx electron tools/make-icon.cjs build`).
- `PRESENTER_EXE=<unzipped folder>/Presenter.exe node e2e/smoke.mjs` runs the end-to-end test on a packaged app.
- On the maintainer's computer the desktop icon starts the source copy (`Start Presenter.bat`): after any source change run `npm run build`.
