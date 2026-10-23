// Runs inside every deck page (isolated world). Bridges the UXD202 sync channel
// to the main process and reports focus/pointer facts the key router needs.
import { ipcRenderer } from 'electron'
import { mountInkSurface } from './inkSurface'

const tabId = new URLSearchParams(location.search).get('tabId') ?? ''
// Every deck page gets the marking layer; the main process turns it on only for the screen
// on the projector (screens can change places).
mountInkSurface()
// UXD202 decks use their original channel; everything else uses the public protocol
// (docs/protocol.md, sdk/presenter-bridge.js). Commands go to both.
const channels = [new BroadcastChannel('UXD202_SLIDES_SYNC'), new BroadcastChannel('presenter-sync-v1')]
let answered = false

for (const channel of channels) {
  channel.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data
    if (!msg || msg.type !== 'SLIDE_STATE' || msg.tabId !== tabId) return
    answered = true
    ipcRenderer.send('deck:state', msg)
  })
}

const post = (msg: Record<string, unknown>): void => {
  for (const channel of channels) channel.postMessage(msg)
}

ipcRenderer.on('deck:cmd', (_event, cmd: Record<string, unknown>) => {
  post({ ...cmd, targetTabId: tabId })
})

for (const delay of [300, 1000, 2000, 4000]) {
  setTimeout(() => {
    if (!answered) post({ type: 'PING', targetTabId: tabId })
  }, delay)
}

const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'])
function isEditable(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type)
  // The marking layer (a shadow root) while a text is typed on the slide.
  if (el instanceof HTMLElement && el.tagName === 'PRESENTER-INK' && el.dataset['presenterTyping'] === '1') return true
  return el instanceof HTMLElement && el.isContentEditable
}

window.addEventListener('focusin', () => ipcRenderer.send('deck:editing', isEditable(document.activeElement)), true)
window.addEventListener('focusout', () => setTimeout(() => ipcRenderer.send('deck:editing', isEditable(document.activeElement)), 0), true)
window.addEventListener('pointerdown', () => ipcRenderer.send('deck:pointer'), true)

// Alt + mouse wheel changes the text size (like Ctrl + wheel in a browser): up = larger, down = smaller. One step at most every 60 ms.
let lastWheelZoom = 0
window.addEventListener(
  'wheel',
  (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.deltaY === 0) return
    e.preventDefault()
    const now = Date.now()
    if (now - lastWheelZoom < 60) return
    lastWheelZoom = now
    ipcRenderer.send('deck:wheel-zoom', e.deltaY < 0 ? 'in' : 'out')
  },
  { capture: true, passive: false }
)
