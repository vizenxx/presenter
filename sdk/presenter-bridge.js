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
