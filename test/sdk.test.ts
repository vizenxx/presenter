import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const SDK = fs.readFileSync(path.join(__dirname, '..', 'sdk', 'presenter-bridge.js'), 'utf8')
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30))

interface Bridge {
  connect(deck: object): { report(): void; close(): void }
  version: number
}

/** Runs the SDK in a fresh context that has the Node BroadcastChannel (a stand-in for the page). */
function loadBridge(search = ''): Bridge {
  const context = vm.createContext({ BroadcastChannel, URLSearchParams, location: { search } })
  context.globalThis = context
  vm.runInContext(SDK, context)
  return context.PresenterBridge as Bridge
}

const open: Array<{ close(): void }> = []
afterEach(() => {
  while (open.length) open.pop()?.close()
})

function listen(): { messages: Array<Record<string, unknown>>; channel: BroadcastChannel } {
  const channel = new BroadcastChannel('presenter-sync-v1')
  const messages: Array<Record<string, unknown>> = []
  channel.onmessage = (e: MessageEvent) => messages.push(e.data as Record<string, unknown>)
  open.push(channel)
  return { messages, channel }
}

describe('Presenter bridge SDK', () => {
  it('reports the deck on connect and answers PING', async () => {
    const { messages, channel } = listen()
    const bridge = loadBridge('?tabId=projector')
    open.push(bridge.connect({ total: () => 3, index: () => 0, goto: () => undefined, slides: () => [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }))
    await settle()
    expect(messages[0]).toMatchObject({ type: 'SLIDE_STATE', protocol: 1, tabId: 'projector', currentSlide: 0, totalSlides: 3, ownTimer: false })
    channel.postMessage({ type: 'PING', targetTabId: 'projector' })
    await settle()
    expect(messages).toHaveLength(2)
  })

  it('follows GOTO for its own screen only', async () => {
    const { messages, channel } = listen()
    let current = 0
    const bridge = loadBridge('?tabId=projector')
    open.push(bridge.connect({ total: () => 4, index: () => current, goto: (i: number) => (current = i) }))
    await settle()
    channel.postMessage({ type: 'GOTO', slideIndex: 2, targetTabId: 'next' })
    await settle()
    expect(current).toBe(0)
    channel.postMessage({ type: 'GOTO', slideIndex: 2, targetTabId: 'projector' })
    await settle()
    expect(current).toBe(2)
    expect(messages.at(-1)).toMatchObject({ currentSlide: 2 })
  })

  it('reports when the deck says its slide changed', async () => {
    const { messages } = listen()
    let current = 0
    let changed: () => void = () => undefined
    const bridge = loadBridge()
    open.push(bridge.connect({ total: () => 2, index: () => current, goto: () => undefined, onChange: (report: () => void) => (changed = report) }))
    current = 1
    changed()
    await settle()
    expect(messages.at(-1)).toMatchObject({ currentSlide: 1 })
  })

  it('does nothing harmful where BroadcastChannel is missing', () => {
    const context = vm.createContext({ URLSearchParams, location: { search: '' } })
    context.globalThis = context
    vm.runInContext(SDK, context)
    const handle = (context.PresenterBridge as Bridge).connect({ total: () => 1, index: () => 0, goto: () => undefined })
    expect(() => handle.report()).not.toThrow()
  })

  it('the AI instructions carry an exact copy of the SDK', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ai-integration.md'), 'utf8')
    const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
    expect(squash(doc)).toContain(squash(SDK))
  })

  it('the example deck carries an exact copy of the SDK', () => {
    const example = fs.readFileSync(path.join(__dirname, '..', 'examples', 'minimal-deck.html'), 'utf8')
    const inline = example.split('/* --- Presenter bridge v1: begin (copy of sdk/presenter-bridge.js) --- */')[1].split('/* --- Presenter bridge v1: end --- */')[0]
    const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
    expect(squash(inline)).toBe(squash(SDK))
  })
})
