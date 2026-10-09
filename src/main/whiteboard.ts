import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Blank pages of the whiteboard: enough for a lesson; each page keeps its own marks. */
export const WHITEBOARD_PAGES = 30

/**
 * The whiteboard: a deck of blank white pages (with a small page number) that uses the Presenter
 * protocol, so pages turn, the slide list shows "Page n", and marks stay with their page. It is
 * written into the app data folder, where decks can be opened from.
 */
export function whiteboardFile(): string {
  const file = path.join(app.getPath('userData'), 'whiteboard', 'Whiteboard.html')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, WHITEBOARD_HTML)
  return file
}

const WHITEBOARD_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Whiteboard</title>
    <style>
      html, body { margin: 0; height: 100%; background: #ffffff; overflow: hidden; }
      .slide { display: none; position: relative; height: 100vh; }
      .slide.active { display: block; }
      .slide span { position: absolute; right: 2vw; bottom: 2vh; font: 2.2vh system-ui, "Segoe UI", sans-serif; color: #b8b8be; }
    </style>
  </head>
  <body>
    <script>
      /* --- Presenter bridge v1: begin (copy of sdk/presenter-bridge.js) --- */
      /*!
       * Presenter bridge v1 — lets an HTML slide deck work fully with Presenter
       * (page count, slide list, notes, planned minutes, exact page jumps).
       * Protocol: docs/protocol.md. MIT licence. No dependencies; safe in any browser:
       * outside Presenter nothing listens, so the deck works as before.
       *
       * Usage:
       *   PresenterBridge.connect({
       *     total: () => slides.length,
       *     index: () => current,
       *     goto: (i) => show(i),
       *     slides: () => slides.map((s) => ({ title: s.title, notes: s.notes, minutes: s.minutes })),
       *     onChange: (report) => { onSlideChange = report }
       *   })
       */
      ;(function (global) {
        var CHANNEL = 'presenter-sync-v1'

        function connect(deck) {
          if (typeof BroadcastChannel === 'undefined') return { report: function () {}, close: function () {} }
          var params = new URLSearchParams((global.location && global.location.search) || '')
          var tabId = params.get('tabId') || ''
          var channel = new BroadcastChannel(CHANNEL)

          function report() {
            channel.postMessage({
              type: 'SLIDE_STATE',
              protocol: 1,
              tabId: tabId,
              currentSlide: deck.index(),
              totalSlides: deck.total(),
              metadata: deck.slides ? deck.slides() : [],
              milestones: deck.milestones ? deck.milestones() : [],
              ownTimer: !!deck.showsTimer
            })
          }

          channel.onmessage = function (event) {
            var msg = event.data
            if (!msg || (msg.targetTabId && msg.targetTabId !== tabId)) return
            if (msg.type === 'PING') report()
            else if (msg.type === 'GOTO' && typeof msg.slideIndex === 'number') {
              deck.goto(msg.slideIndex)
              report()
            }
          }

          if (deck.onChange) deck.onChange(report)
          report()
          return {
            report: report,
            close: function () {
              channel.close()
            }
          }
        }

        global.PresenterBridge = { connect: connect, version: 1 }
      })(typeof window !== 'undefined' ? window : globalThis)
      /* --- Presenter bridge v1: end --- */
      const pages = []
      for (let i = 0; i < ${WHITEBOARD_PAGES}; i++) {
        const page = document.createElement('section')
        page.className = 'slide'
        page.innerHTML = '<span>' + (i + 1) + '</span>'
        document.body.appendChild(page)
        pages.push(page)
      }
      let current = 0
      let onSlideChange = null
      function show(i) {
        current = Math.max(0, Math.min(pages.length - 1, i))
        pages.forEach((p, k) => p.classList.toggle('active', k === current))
        if (onSlideChange) onSlideChange()
      }
      addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') show(current + 1)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') show(current - 1)
        if (e.key === 'Home') show(0)
        if (e.key === 'End') show(pages.length - 1)
      })
      show(0)
      PresenterBridge.connect({
        total: () => pages.length,
        index: () => current,
        goto: show,
        slides: () => pages.map((_, i) => ({ title: 'Page ' + (i + 1), notes: '' })),
        onChange: (report) => {
          onSlideChange = report
        }
      })
    </script>
  </body>
</html>
`
