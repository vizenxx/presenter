# Make an AI-built deck work with Presenter

用 AI（ChatGPT、Claude、Gemini 等）做 HTML 课件时，把下面方框里的英文整段复制，贴在你对课件内容的要求后面。做出来的课件就能在 Presenter 里完整使用：页数、目录、讲者备注、每页计划时长、精确跳页和联动屏幕。

When you ask an AI assistant to build an HTML slide deck, paste the whole block below after your content request. The deck will then work fully with Presenter (see [protocol.md](protocol.md)).

````text
Build the deck so it works with the "Presenter" classroom app (deck protocol v1). Follow every rule:

1. Output ONE self-contained HTML file. Put every style, script, font and image inline (images as data URIs). No links to CDNs or other websites; the deck must work offline.
2. Each slide is one element with class "slide". Exactly one slide is visible at a time. The arrow keys, PageUp/PageDown and Space turn pages.
3. Give each slide data-title="<short slide title>". If a slide has a timed activity, add data-minutes="<planned minutes>". Put speaker notes inside the slide in <div class="notes">...</div>; notes must never be visible on the slide.
4. Show every slide as a whole when it is displayed (no click-by-click build steps).
5. Do not add a timer, a presenter view, or pop-up windows; Presenter provides them.
6. Copy this script unchanged into a <script> tag before your own deck code:

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

7. After your deck code has set up the slides, connect it exactly like this (adapt only the names of your own variables and functions):

const slides = Array.from(document.querySelectorAll('.slide'))
let current = 0
let onSlideChange = null
function show(i) {
  current = Math.max(0, Math.min(slides.length - 1, i))
  slides.forEach((s, k) => s.classList.toggle('active', k === current))
  if (onSlideChange) onSlideChange()
}
PresenterBridge.connect({
  total: () => slides.length,
  index: () => current,
  goto: show,
  slides: () => slides.map((s) => ({
    title: s.dataset.title || '',
    minutes: Number(s.dataset.minutes) || undefined,
    notes: ((s.querySelector('.notes') || {}).textContent || '').trim()
  })),
  onChange: (report) => { onSlideChange = report }
})
````

A complete example that follows these rules: [examples/minimal-deck.html](../examples/minimal-deck.html).
