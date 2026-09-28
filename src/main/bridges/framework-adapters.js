// Injected into HTML decks (main world) after sdk/presenter-bridge.js. It recognises common
// slide frameworks and connects them to Presenter with their own public APIs. A deck that
// uses none of them is left alone (Presenter then turns its pages with arrow keys).
;(function () {
  if (window.__presenterFrameworks || !window.PresenterBridge) return
  window.__presenterFrameworks = true

  function text(el, selector) {
    var found = el && el.querySelector(selector)
    return found ? (found.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  }
  function heading(el) {
    return text(el, 'h1') || text(el, 'h2') || text(el, 'h3')
  }

  var adapters = [
    {
      name: 'Reveal.js',
      detect: function () {
        var R = window.Reveal
        return !!(R && typeof R.getSlides === 'function' && typeof R.isReady === 'function' && R.isReady())
      },
      deck: function () {
        var R = window.Reveal
        var slides = function () {
          return R.getSlides()
        }
        return {
          total: function () {
            return slides().length
          },
          index: function () {
            return Math.max(0, slides().indexOf(R.getCurrentSlide()))
          },
          goto: function (i) {
            var target = slides()[i]
            if (!target) return
            var at = R.getIndices(target)
            R.slide(at.h, at.v)
            // Whole slides, like a PPT page: show every fragment at once.
            while (R.availableFragments && R.availableFragments().next) R.nextFragment()
          },
          slides: function () {
            return slides().map(function (s, i) {
              return { title: heading(s) || 'Slide ' + (i + 1), notes: (R.getSlideNotes && R.getSlideNotes(s)) || '' }
            })
          },
          onChange: function (report) {
            R.on('slidechanged', report)
          }
        }
      }
    },
    {
      name: 'remark',
      detect: function () {
        return !!findRemark()
      },
      deck: function () {
        var show = findRemark()
        return {
          total: function () {
            return show.getSlideCount()
          },
          index: function () {
            return show.getCurrentSlideIndex()
          },
          goto: function (i) {
            show.gotoSlide(i + 1)
          },
          slides: function () {
            return show.getSlides().map(function (s, i) {
              var content = String(s.content && s.content.join ? s.content.join('\n') : s.content || '')
              var title = /^#{1,3}\s+(.+)$/m.exec(content)
              var notes = s.notes && s.notes.join ? s.notes.join('\n') : s.notes || ''
              return { title: title ? title[1].trim() : 'Slide ' + (i + 1), notes: String(notes).trim() }
            })
          },
          onChange: function (report) {
            show.on('showSlide', function () {
              setTimeout(report, 0)
            })
          }
        }
      }
    },
    {
      name: 'impress.js',
      detect: function () {
        return typeof window.impress === 'function' && document.body.classList.contains('impress-enabled') && !!document.querySelector('#impress .step')
      },
      deck: function () {
        var api = window.impress()
        var steps = function () {
          return Array.prototype.slice.call(document.querySelectorAll('#impress .step'))
        }
        return {
          total: function () {
            return steps().length
          },
          index: function () {
            return Math.max(
              0,
              steps().findIndex(function (s) {
                return s.classList.contains('active')
              })
            )
          },
          goto: function (i) {
            var target = steps()[i]
            if (target) api.goto(target)
          },
          slides: function () {
            return steps().map(function (s, i) {
              return { title: heading(s) || s.id || 'Step ' + (i + 1), notes: text(s, '.notes') }
            })
          },
          onChange: function (report) {
            document.addEventListener('impress:stepenter', report)
          }
        }
      }
    },
    {
      name: 'Marp',
      detect: function () {
        return !!(document.querySelector('.bespoke-marp-parent') && document.querySelector('svg[data-marpit-svg]'))
      },
      deck: function () {
        var slides = function () {
          return Array.prototype.slice.call(document.querySelectorAll('svg[data-marpit-svg]'))
        }
        return {
          total: function () {
            return slides().length
          },
          index: function () {
            return Math.max(
              0,
              slides().findIndex(function (s) {
                return s.classList.contains('bespoke-marp-active')
              })
            )
          },
          goto: function (i) {
            // Marp's bespoke player follows the page number in the address (#1, #2, …).
            location.hash = '#' + (i + 1)
          },
          slides: function () {
            return slides().map(function (s, i) {
              var note = document.querySelector('.bespoke-marp-note[data-index="' + i + '"]')
              return { title: heading(s) || 'Slide ' + (i + 1), notes: note ? (note.textContent || '').trim() : '' }
            })
          },
          onChange: function (report) {
            window.addEventListener('hashchange', function () {
              setTimeout(report, 0)
            })
          }
        }
      }
    }
  ]

  function findRemark() {
    if (!window.remark) return null
    var keys = Object.keys(window)
    for (var k = 0; k < keys.length; k++) {
      var value = window[keys[k]]
      if (value && typeof value.gotoSlide === 'function' && typeof value.getSlideCount === 'function') return value
    }
    return null
  }

  // ---------- plain HTML decks: one element per slide, the current one marked "active" ----------

  var SLIDE_SELECTORS = ['section.slide', '.slide', 'section[data-slide]', '[data-slide]']
  var ACTIVE_CLASSES = ['active', 'current', 'present', 'is-active']
  var NAV_FUNCTIONS = ['goToSlide', 'gotoSlide', 'goToPage', 'showSlide', 'goTo']
  var NOTE_ATTRIBUTES = ['data-notes', 'data-speaker-notes', 'data-speaker-script', 'data-note', 'data-script']
  var NOTE_ELEMENTS = 'aside.notes, .notes, .speaker-notes, [data-role="notes"]'

  function isActive(el) {
    return ACTIVE_CLASSES.some(function (c) {
      return el.classList.contains(c)
    })
  }

  function slideSelector() {
    for (var i = 0; i < SLIDE_SELECTORS.length; i++) {
      var list = Array.prototype.slice.call(document.querySelectorAll(SLIDE_SELECTORS[i]))
      if (list.length >= 2 && list.filter(isActive).length === 1) return SLIDE_SELECTORS[i]
    }
    return null
  }

  /** Bilingual decks keep each language in .text-en / .text-zh; titles use the English one. */
  function plain(el) {
    if (!el) return ''
    var en = el.querySelector('.text-en')
    return ((en || el).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  }

  function notesOf(slide) {
    var parts = []
    var add = function (value) {
      value = (value || '').trim()
      if (value && parts.indexOf(value) < 0) parts.push(value)
    }
    NOTE_ATTRIBUTES.forEach(function (name) {
      add(slide.getAttribute(name))
      add(slide.getAttribute(name + '-en'))
      add(slide.getAttribute(name + '-zh'))
    })
    Array.prototype.forEach.call(slide.querySelectorAll(NOTE_ELEMENTS), function (el) {
      add(el.textContent)
    })
    // A transition line to the next slide, when the deck has one.
    ;['data-narrative-bridge', 'data-narrative-bridge-zh'].forEach(function (name) {
      var value = (slide.getAttribute(name) || '').trim()
      if (value) add('→ ' + value)
    })
    return parts.join('\n\n')
  }

  /** Planned minutes only from an explicit "N min" (a clock time like 14:05 is not a duration). */
  function minutesOf(slide) {
    var attr = Number(slide.getAttribute('data-minutes') || slide.getAttribute('data-duration'))
    if (attr > 0) return attr
    var el = slide.querySelector('.slide-duration, .duration')
    var match = el && /(\d+(?:\.\d+)?)\s*(?:min|mins|minutes|分钟)/i.exec(el.textContent || '')
    return match ? Number(match[1]) : undefined
  }

  function goToGeneric(target, slides, current, state) {
    if (current() === target) return
    var name = NAV_FUNCTIONS.filter(function (n) {
      return typeof window[n] === 'function'
    })[0]
    if (name) {
      // The deck's own jump function: learn once whether it counts from 0 or from 1.
      if (state.base !== null) {
        window[name](target + state.base)
        if (current() === target) return
      } else {
        window[name](target)
        if (current() === target) {
          if (target > 0) state.base = 0
          return
        }
        window[name](target + 1)
        if (current() === target) {
          state.base = 1
          return
        }
      }
    }
    // Otherwise arrow keys, one step at a time, as the deck's own key handler expects.
    var guard = slides().length + 2
    while (current() !== target && guard-- > 0) {
      var before = current()
      var key = before < target ? 'ArrowRight' : 'ArrowLeft'
      ;(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: key, code: key, keyCode: key === 'ArrowRight' ? 39 : 37, bubbles: true, cancelable: true }))
      if (current() === before) break
    }
  }

  adapters.push({
    name: 'slide elements',
    generic: true,
    detect: function () {
      return !!slideSelector()
    },
    deck: function () {
      var selector = slideSelector()
      var slides = function () {
        return Array.prototype.slice.call(document.querySelectorAll(selector))
      }
      var current = function () {
        return Math.max(0, slides().findIndex(isActive))
      }
      var state = { base: null }
      return {
        total: function () {
          return slides().length
        },
        index: current,
        goto: function (i) {
          goToGeneric(i, slides, current, state)
        },
        slides: function () {
          return slides().map(function (s, i) {
            var title = s.getAttribute('data-title') || plain(s.querySelector('.slide-title, .cover-title')) || plain(s.querySelector('h1, h2, h3')) || 'Slide ' + (i + 1)
            return { title: title, notes: notesOf(s), minutes: minutesOf(s) }
          })
        },
        onChange: function (report) {
          var timer = 0
          var observer = new MutationObserver(function () {
            clearTimeout(timer)
            timer = setTimeout(report, 30)
          })
          slides().forEach(function (s) {
            observer.observe(s, { attributes: true, attributeFilter: ['class'] })
          })
        }
      }
    }
  })

  // ---------- start ----------

  // Decks that already speak a Presenter protocol (UXD202 decks, the SDK) answer on these
  // channels; the adapters then stay out of the way.
  var native = false
  ;['UXD202_SLIDES_SYNC', 'presenter-sync-v1'].forEach(function (name) {
    try {
      new BroadcastChannel(name).onmessage = function (e) {
        if (e.data && e.data.type === 'SLIDE_STATE' && !connected) native = true
      }
    } catch (err) {
      // No BroadcastChannel: key mode only.
    }
  })

  // Frameworks start asynchronously; look for up to 6 seconds. The plain-deck adapter waits
  // 1.5 s so a deck with its own protocol can answer Presenter's first PING before it.
  var connected = false
  var tries = 0
  ;(function look() {
    if (native) return
    for (var i = 0; i < adapters.length; i++) {
      if (adapters[i].generic && tries < 15) continue
      if (adapters[i].detect()) {
        connected = true
        window.PresenterBridge.connect(adapters[i].deck())
        return
      }
    }
    if (++tries < 60) setTimeout(look, 100)
  })()
})()
