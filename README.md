# Presenter

Presenter shows decks (HTML, PDF, PPT, PPTX, Keynote) and program windows (a browser, a video …) on one or more projectors, and gives the presenter a console on the laptop. It runs on Windows and Mac, is free, and needs no installation.

中文说明：[README.zh-CN.md](README.zh-CN.md). The interface is English only.

## Download

The newest zips are on the **[Releases page](https://github.com/vizenxx/presenter/releases/latest)**, under **Assets**: `…-win.zip` for Windows; for a Mac, `…-mac-arm64.zip` (Apple silicon: M1, M2 … — Apple menu → **About This Mac** shows **Chip: Apple M…**) or `…-mac-x64.zip` (Intel: it shows **Processor: … Intel**). Anyone can open that page: send the link to others.

## Open (nothing to install)

Presenter is a folder you unzip; there is no installer and no administrator password.

**Windows**

1. Right-click the downloaded `Presenter-…-win.zip` → **Extract All**. Put the folder anywhere (for example Documents).
2. In the folder, double-click **Presenter** (the file with the Presenter icon). It opens in about 2 seconds.
3. For a desktop icon: right-click **Presenter** → **Show more options → Send to → Desktop (create shortcut)**.
4. The app is not signed. When the zip came from the internet, Windows may show "Windows protected your PC": click **More info → Run anyway** once.

**Mac** (macOS 13 Ventura or later, Intel or Apple silicon)

1. Double-click the downloaded `Presenter-…-mac-arm64.zip` (or `…-mac-x64.zip`). It becomes **Presenter**. Double-click it to open (moving it to **Applications** is optional).
2. The first time, macOS may say it cannot check the app. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. This is needed once.
3. PPT and PPTX files open with the LibreOffice inside Presenter: nothing else is needed. (Only if that fails, Presenter asks Keynote; then macOS asks "Presenter wants to control Keynote": click **OK**.)
4. Mac shortcuts: **⌘ Return** or **fn F5** starts projecting; **⌘ +**, **⌘ −**, **⌘ 0** set the text size; **⌘ Z** undoes a mark; **delete** clears the marks.
5. In **System Settings → Privacy & Security**, allow Presenter under:
   - **Screen & System Audio Recording**: needed to show program windows (and their titles in the list), and for a live copy of the projector in the console. Restart Presenter after allowing it.
   - **Accessibility** (optional; Presenter asks when you add the first program window): brings forward the exact window you chose and un-minimizes it. Without it the whole program comes forward instead.

## The console at a glance

| Area | What it does |
|---|---|
| Top bar | **Open deck**, **Recent**, **Participants**, **Guide**, **☀ / ☾** (light or dark look), **⇄** (swap the left and right sides), **Black screen**, **▶ Start projecting** |
| Current slide (left) | What Projector 1 shows. Before projecting it is the deck itself; while projecting it is a live copy of what the audience sees. The mark tools are above it; the slide number and the title are under it. |
| Slides and Notes | Two buttons at the left of the current slide's row (under the slide): **Slides** (the slide list: click a slide to go there) and **Notes** (the speaker notes of the slide in view). A button opens its panel at the far left of the console (the far right when the sides are swapped); the same button closes it. |
| Next slide (right) | The slide after the selected card's slide. Click it to look further ahead. |
| Shared timer | An upright card under the next slide: the countdown the audience sees on the projector. Double-click its minutes or seconds to change them. The **bell**: its warning bells. **±**: give it more or less time. |
| My timer | The card beside it: your own timer. Only you see it. |
| Bottom bar | One card per content (deck or program window), each with its **Projector ▾** button. **＋ Add screen** at the end. |

The **Guide** in the app has the same help in two parts: **1 · Use Presenter** ("I want to … → do this") and **2 · Prepare decks**.

## Start

1. Drop a deck file on the console, or click **Open deck** (it starts in the folder of the deck you opened last). No deck? Click **Show a program window…** on the start screen: a browser, a video or any open program window goes on Projector 1 instead.
2. Click **▶ Start projecting** (top right) or press **F5**. Projector 1 goes full screen on the projector.
3. Click **■ Stop projecting** or press **Esc**. The projector closes; the console keeps everything.
4. **B** makes the projectors black, **W** white (also **Black screen** in the top bar, and the "blank" button of many clickers). The same key, any other key or a click shows the slides again; that key does not turn the page.
5. While you project, while a projector is open or while a timer runs, Presenter keeps the laptop and the projector from going to sleep.
6. Set the projector to **Extend** mode. Without a projector, projecting opens a normal window (good for practice at home).

### Other people's HTML decks

- Decks built with **Reveal.js**, **remark**, **impress.js** or **Marp** connect automatically: page count, slide list, notes and exact jumps work.
- Plain HTML decks with one `.slide` element per slide (the current one marked `active`) also connect: page count, titles, speaker notes (e.g. `data-speaker-script`, `.notes`) and planned minutes are read from the page.
- Any other HTML deck works in **Key mode**: pages turn with the arrow keys; the page count is unknown, so the card shows only the page number.
- To make a new deck work fully, follow [docs/protocol.md](docs/protocol.md), start from [examples/minimal-deck.html](examples/minimal-deck.html), or, when an AI assistant builds the deck, paste the block in [docs/ai-integration.md](docs/ai-integration.md) into your request (the Guide can copy it for you).

### PPT, PPTX, Keynote and PDF

- Presenter carries its own reduced LibreOffice (free software), so PPT, PPTX, ODP and Keynote files open on any computer: there is nothing else to install.
- A file is converted for showing first. The first time takes about 5–20 seconds; the console shows the progress. After that the same file opens at once.
- **Click animations play.** Each page key first shows the next click step of the slide; after the last step it turns the page. Back shows the step before; on the first step it goes to the slide before, with all its steps shown (as in PowerPoint). The next-slide preview shows each slide with all its steps. The console shows how many steps are shown, for example `Slide 3 / 18 · 1/3 clicks`.
  - Common effects (appear, fade, wipe, zoom …) and many slide transitions play. Some effects show in a simpler way: for example, text that flies in appears without moving.
  - LibreOffice draws the slides, so a font, a chart or a SmartArt can look a little different from PowerPoint. Check a new deck once before you present.
  - If the animated pages cannot be made, the slides show as still pages (each slide in its final state), made by the same LibreOffice or by PowerPoint or Keynote.
- Videos and sounds in a PPTX play where they stand on the slide. Click **▶ Video** next to the slide title in the console (and **Full screen** to make it fill the projector), or click the ▶ on the video. A page turn stops it. No extra program is needed.
- A video in an HTML deck (a `<video>`, an embedded YouTube or Vimeo player, a "click to play" cover) gets the same **▶ Video** and **Full screen** buttons in the console. While projecting, a click on the console's live copy of the slide (with the pointer tool) is a click on the slide on the projector, so nothing needs to be done on the projector itself.
  - MP4, M4V, MOV (H.264), WebM, MP3, M4A, WAV and OGG play. WMV and AVI cannot play: the video shows a note; save it as MP4 and insert it again.
  - A linked video (not embedded) plays when its file is still where the PPTX points.
  - Old .ppt files: save them as .pptx first to play their videos.
  - After an update that changes the conversion, each file is converted once more (once only).
- Hidden slides are left out, as in PowerPoint's own show.
- Slide titles appear in the **Slides** list, speaker notes under **Notes**.

## Turn pages

- A deck you open again within 3 hours (for example after a restart while presenting) opens on the slide it showed last. A two-button choice above the current slide asks what you want: **Stay at slide N** (blue) or **Go to slide 1**. Turning a page also keeps the slide; the choice goes away after 30 seconds. Later than 3 hours it opens on slide 1.

- A clicker, the arrow keys, PageUp / PageDown and Space turn pages. Home and End go to the first and last page.
- **The selected card turns.** If it is **Linked**, every linked card turns with it; if not, it turns alone.
- Select a card by clicking it, or by clicking its picture. The selected card has a blue border.
- Type a slide number and press **Enter** to jump there (the number shows in the top bar; **Esc** drops it).
- **−** and **+** on a card move only that card, e.g. to set how many pages two decks are apart.
- **Next slide** shows the slide after the selected card's slide. Click it to look further ahead: page keys then turn only the preview, and the audience sees no change. Click the current slide or a card to go back.

## Contents and projectors

- Each card in the bottom bar is one **content**: a deck or a program window. It remembers its own page.
- **＋ Add screen** adds a content: the same deck, another deck (or one from **Recent**), **A window on this computer**, or a **Whiteboard** (30 blank white pages; put it on Projector 1 and draw with the marking tools; each page keeps its marks; also on the start screen). A new content **waits**; nothing opens.
- The card's **Projector ▾** button decides where the audience sees it:
  - **Projector 1**: the main projector.
  - **Projector 2, 3 …**: projectors you opened.
  - **New projector**: a second projector or a TV. It opens full screen on a free display, else as a normal window.
  - **Not shown**: the content waits.
- A projector shows one content at a time. The content it showed before waits and **keeps its page**, so you can switch back and go on where you were.
- The same menu has **full screen** and **close** for Projector 2, 3 …. Closing a projector lets its content wait.
- **Clicking a card only selects it**: page keys, Next slide and Notes follow it, and the audience keeps seeing the same thing. Use this to look through a waiting deck quietly.
- Click a card's **name** (it has a ▾) to change what it holds: **Open a deck…**, **A program window…**, **Whiteboard**, or a deck from **Recent**. The card keeps its place and its projector. On Screen 1 a deck replaces the main deck; a program window or a whiteboard takes Screen 1's place and Projector 1, and the old deck is closed (it is in **Recent**).
- The very first content you add (a program window, a whiteboard or a deck) goes on Projector 1 at once; later ones wait.
- A program window's card has a small **window icon** (↗): it brings that window back to the front on your laptop, with its floating tools. Use it after the toolbar's **Console** button.
- A deck card's **⋯** menu has text size and **Remove**; a window card has **✕**.
- A green dot on the Projector button means the audience sees that content now.

## Program windows

- **＋ Add screen → A window on this computer** (or **Show a program window…** on the start screen) lists every program window, minimized ones too, as in Zoom.
- The real window stays on your laptop, where you use it as usual; the projector shows it live. On Windows the window fills your laptop screen while a projector shows it (it is maximized, so the projector gets all the pixels of the screen and the picture stays sharp); when it leaves the projector it goes back to its own size.
- Adding a window or clicking its card does not move the window. Choosing a projector for it brings it to the front (restored if it was minimized).
- Page turns and notes do not apply to a window. **✕** on its card removes it.
- On a Mac this needs Screen Recording, and Accessibility for the exact window (see **Open → Mac**). Windows on another desktop Space count as minimized.

### Floating tools

While a program window is shown on a projector, a small toolbar floats at the top of the screen, and it stays with that window wherever you are (in the window, in the console, in another program):

- The mark tools. With a drawing tool you draw right on the window; the marks show on the projector over the window's picture. With the pointer, you use the window as usual.
- While you draw on a window, the toolbar takes the keyboard: **Ctrl+Z** (⌘Z) undoes a mark, **Esc** returns to the pointer and gives the keyboard back to the window.
- **Timer**: the shared timer. It shows the time left while it runs; click it to open the same two timer cards as in the console (the time is its own entry: double-click the minutes or seconds; **±**, the bells, the presets, My timer's modes). Their pop-ups open inside the toolbar.
- **Roll**: picks a name; the name shows next to the button.
- **Mine**: My timer's time, once you started it in the console.
- **Screens ▾**: shows another content on Projector 1 (a deck, another program window, a whiteboard) without going to the console. A program window comes to the front by itself; for a deck the console comes to the front (and selects that card).
- **Console**: brings the Presenter console to the front. The tools stay; the window card's icon brings the window back to the front.
- **◂** folds the toolbar; drag **⠿** to move it. The toolbar always stays inside its display, goes with the window when the window moves, and comes to the visible part of the new window when another window is shown on Projector 1.

The audience never sees the toolbar. It goes when the window is no longer shown on a projector or is minimized. You draw while the window (or the toolbar) is in front; with another program in front, the marks stay but the clicks go to that program.

## Marks

The bar above the current slide: **Pointer, Pen, Highlighter, Box, Arrow, Text, Laser, Eraser, Zoom**, six colours, **Undo** and **Clear**.

- Draw on the console's slide picture or directly on the projector; both show the same marks at once.
- While projecting, moving the mouse on the projector shows a small tool palette at its bottom left (it hides after a few seconds).
- Marks stay with their slide: when you come back to a slide, its marks are there again (until the deck closes or opens again). **Clear** removes the marks of the slide shown. Marks on a program window stay until you clear them or the window leaves its projector.
- **Arrow**: drag from where the arrow starts to where it points. The tip has an open V head.
- **Text** (T): click the slide and type: one line. Or drag a box: the text wraps inside it and gets smaller when there is a lot of it, so it always stays in the box; at the smallest size typing stops. Click a text to change it; drag a text to move it. **Esc** (or a click elsewhere) ends the typing. The text has the colour you picked; the **Eraser** and **Undo** remove it like any mark. Letters that are shortcuts (T, B, digits …) are typed into the text while you type. Text works on slides, not on program windows.
- **Zoom** (Z): drag a box over small text; on the projector that box fills the screen (up to 8 times larger), marks included. A click with Zoom, **Esc** or the next page shows the whole slide again. It works on PDF and PPT slides and on program windows too.
- Hold **Shift** while you draw: the pen and the highlighter draw one straight line (any angle), the box becomes a square, the arrow turns in 45° steps.
- The **camera** button (above the slide) saves the slide with its marks as a picture (PNG); the save dialog starts in the deck's folder.
- Keys in the console and on the floating toolbar: **P** pen, **H** highlighter, **R** box, **A** arrow, **T** text, **L** laser, **E** eraser, **Z** zoom, **Ctrl+Z** (⌘Z) undo, **Delete** clear.
- **Ctrl+Z** and **Esc** also work after you click on a slide (in the console or on the projector).
- **Esc** leaves any drawing tool (back to the pointer); in the console a second **Esc** stops projecting.

## Timers

**Shared timer** (the audience sees it)

- Click a preset (**1 min**, **5 min** …) to start at once.
- **The big time is its own entry**: double-click the minutes or the seconds, type a number and press **Enter** (or **✓**). **Esc** (or **✕**) leaves it as it was. While the timer is stopped, the number is the time **Start** will use. While it runs, the timer **keeps running** while you type: the part you typed is set when you press Enter, and the other parts are what they are at that moment (type 5 in the minutes at 12:34 and it goes on from 5:34, a few seconds later 5:31). **±** is still there for adding or taking away an amount.
- When a deck plans a time for a slide, the timer shows it.
- **Warning bells**: the bell button next to the shared timer's name (it shows how many bells are set) opens them in a pop-up: each bell beeps its own number of times (1–9) when its time is left (minutes : seconds). The bells are listed in the order they ring. **＋ Add a bell** adds one (up to 5); **✕** removes one. At first there is one bell: 1:00 left, 3 beeps. Presenter remembers the bells. In the last 5 seconds it always beeps once a second.
- At zero the alarm rings until you press any key or click. That key does not turn the page.
- UXD202 decks show the countdown in their own bar; everything else shows it at the bottom right of the projector.

**My timer** (only you see it)

- **Count up**, **Count down**, or **From–to**, to pace your talk. It makes no sound.
- **From–to**: click the **clock** button and set your sessions: for each session, its weekdays (Mon … Sun) and its start and end on the 12-hour clock (hour : minute, **AM** or **PM**); up to 6 sessions, two on one day are fine; they are listed by weekday, then by start time. During today's session My timer counts down to its end by itself; for 30 minutes after the end it shows **Over time**; before the next session it shows "Starts at 2:00 PM"; with none left today, "No session now". There is no Start button in this mode. **±** changes only today's end. Presenter remembers the sessions. Its time works as in the shared timer: double-click the minutes or the seconds (a count down that has not started has only minutes). Clock times (From–to) set themselves, so only **±** changes them.
- A countdown keeps going past zero as **Over time**, in red.
- The floating toolbar shows its time while it runs.

**Change the time** (**±** on either timer)

- **±** opens a pop-up for that timer (you can still switch to the other one there). Type an amount (minutes : seconds), then click **− 1:00** to take it away or **+ 1:00** to add it.
- It changes a timer that runs or is paused; a timer that has not started stays as it is.
- The shared timer keeps at least one second, so taking away too much makes it ring a second later. After it rang, **+** makes it run again for that time (for example "two more minutes").
- Taking time away past a warning bell's time rings that bell.

## Participants

Click **Participants** (top bar). Choose a list and, under **Pick one**, click **Roll**: the list rolls on the projectors, slows down and stops on one person. After it stops, any key or click hides it; that key does not turn the page.

- Everyone not yet picked has the same chance. With "People already picked can be picked again (small chance)" on, picked people may come up again, rarely.
- **Picked so far: X of Y** counts the picks; **↺ Reset** (after a confirmation) makes everyone unpicked again. Picks last while the app is open.
- The first start has a sample list: click **Edit** and paste your list of people (one person per line; a number in front is optional). **New** makes another list. Lists are saved.
- Without projecting, only you see the roll (in the console, or next to **Roll** on the floating toolbar).
- **Teams** (the other side of the switch in Participants): choose how many teams and click **Make teams**. Everyone in the list is in one team; team sizes differ by at most one. The teams show on the projectors (any key or click hides them) and stay listed in the pop-up. **Shuffle again** makes new teams; **Clear** removes them.

## Light or dark look

**☀ / ☾** in the top bar switches the console and the floating toolbar between a light and a dark look. Presenter remembers the choice; until you choose, it follows the computer's setting. The projector does not change.

## Swap the sides

The **⇄** button in the top bar turns the whole console left to right: the current slide and the next slide change sides, the slide bar comes in from the right, the two timers and the top and bottom rows swap, and pop-ups open towards the other side. The floating toolbar follows. Presenter remembers the side. Use it when the projector or the lectern is on your other side.

## Text size

**Text size** (Ctrl + / Ctrl − / Ctrl 0; ⌘ on a Mac) enlarges an HTML deck in steps of 5 % and is remembered per deck file. Hold **A−** or **A+** to change it fast. It is above the current slide for Projector 1 and in a card's **⋯** menu for the others. PPT and PDF show whole pages, so it does not apply to them.

## Licence and privacy

- Presenter is free: use it, copy it and share it. Its own code is under the MIT Licence ([LICENSE](LICENSE)), with no warranty.
- It contains other free software (Electron and Chromium, LibreOffice, PDF.js, React …), each with its own licence. They are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); the licence files are inside the app folder. LibreOffice's source code is at https://www.libreoffice.org/download/source-code/.
- Presenter's own code sends nothing: no account, no usage statistics, no update check. Your decks stay on your computer. (A deck you open may connect to the internet by itself, as in a browser.)

## If something goes wrong

- **A window is not in the list**: open the program first (it may be minimized). Presenter's own windows are not listed.
- **A PPT does not open**: save it as PDF and open the PDF. Please send the file (or a copy without private content) to the maintainer.
- **A video on a slide shows "cannot play here"**: it is WMV, AVI or another old format. Save it as MP4 and insert it again.
- **The console stays on "Starting…"**: leave it open and send the file `startup-log.txt` from the app data folder (`%APPDATA%\presenter` on Windows, `~/Library/Application Support/Presenter` on a Mac). It shows the step that did not happen.

## For maintainers

- Source: `src/`. Design: `docs/specs/`. Plans: `docs/superpowers/plans/`.
- `npm run build` (build), `npm test` (unit tests), `npm run e2e` (end-to-end, 17 steps). With one display it opens windows and plays sounds; with a second display connected (a presentation may be on the projector) it runs hidden and muted, without the projecting steps. It never takes pictures of the screen. `PRESENTER_E2E_HIDDEN=1 npm run e2e` runs it hidden and muted on one display too.
- Checks that open no window: `npm run check:viewer` (PPT/PDF), `npm run check:ink` (marks: pen, box, eraser, arrow, Shift shapes, text), `npm run check:frameworks` (Reveal.js, remark, impress.js, Marp, plain slides, protocol example), `npm run check:media` (the video and the "click to play" cover of an HTML deck page: found, pressed from the console, full screen), `npm run check:console` (console layout in the dark and the light look, menus, start screen, floating toolbar and its timer, typing in the timer boxes, the 🔔 and ± pop-ups, pop-ups that stay inside the window, swapping the sides, holding A+), `npm run check:start` (starts hidden and muted, one by one and 8 at once).
- Real conversions: `PRESENTER_CONVERT_IT=libreoffice npm test` (or `powerpoint`, or `keynote` on a Mac).
- The LibreOffice inside the app: `node scripts/libreoffice.mjs prepare` downloads the official release (checked against its SHA-256), keeps only what turning slides into pages needs, and puts it in `vendor/` (`--from "C:/Program Files/LibreOffice"` uses an installed copy instead); `node scripts/libreoffice.mjs check` converts a test deck with click animations with it. LibreOffice is under the Mozilla Public License 2.0; its licence files go along.
- Zips: `npm run dist:win` (Windows) and `npm run dist:mac` (only on a Mac); run `prepare` first. Without a Mac, run the **Build app zips** workflow on GitHub (Actions tab, or `gh workflow run build.yml`; a push alone does not start it): it builds the three zips and replaces the Releases page of this version (text: `.github/release-notes.md`); untick **publish** for a test build. Raise `version` in `package.json` for a new version. Icon source: `build/icon.svg` (`npx electron tools/make-icon.cjs build`).
- `PRESENTER_EXE=<unzipped folder>/Presenter.exe node e2e/smoke.mjs` runs the end-to-end test on a packaged app.
- On the maintainer's computer the desktop icon starts the source copy (`Start Presenter.bat`): after any source change run `npm run build`.
