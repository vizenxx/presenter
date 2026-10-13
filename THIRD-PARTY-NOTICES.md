# Third-party software in Presenter

Presenter's own code is under the [MIT Licence](LICENSE). The app also contains free software from other
people. Each keeps its own licence. This page names them; the full licence texts are in the app folder
and at the links.

| Software | What it does in Presenter | Licence | Where to read it |
|---|---|---|---|
| Electron, with Chromium | The window, the page engine and the video and sound player | MIT (Electron); BSD-style and others (Chromium) | `LICENSE.electron.txt` and `LICENSES.chromium.html` in the app folder |
| LibreOffice (a reduced copy, unchanged; only files that are not needed were left out) | Turns PPT, PPTX, ODP and Keynote files into pages, with click animations | Mozilla Public License 2.0, with the licences of its own parts | `resources/libreoffice/LICENSE.html`, `NOTICE`, `license.txt`, `CREDITS.fodt` in the app folder. Source code: https://www.libreoffice.org/download/source-code/ |
| PDF.js | Shows PDF files and converted pages | Apache License 2.0 | https://github.com/mozilla/pdf.js/blob/master/LICENSE |
| React and React DOM | The console's interface | MIT | https://github.com/facebook/react/blob/main/LICENSE |
| fflate | Opens the zip package of a PPTX file (titles, notes, media) | MIT | https://github.com/101arrowz/fflate/blob/master/LICENSE |

Tools used only to build or to test Presenter (Vite, Tailwind CSS, TypeScript, Vitest, electron-builder,
Playwright, and the sample decks of Reveal.js, remark, impress.js and Marp used by the checks) are not
part of the app you download.

LibreOffice is a trademark of The Document Foundation. Presenter is not made by, and is not endorsed by, The
Document Foundation, Microsoft, Apple or Mozilla. PowerPoint and Keynote are names of their owners.
