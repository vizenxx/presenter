// Start check, safe with a projector connected: starts Presenter hidden and muted, without a
// deck, and waits until the console has its state (startup-log.txt). Runs one start at a time,
// then several at once (a slow computer, like the first start after booting).
// Build first, then: npm run check:start
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = process.env.PRESENTER_EXE ?? path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const READY = 'console received its state'
const LIMIT_MS = 15000

function remove(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  } catch {
    // A locked leftover folder in e2e/out does no harm.
  }
}

function start(i) {
  const userData = path.join(root, 'e2e', 'out', `userdata-start-${i}`)
  remove(userData)
  const log = path.join(userData, 'startup-log.txt')
  const p = spawn(exe, process.env.PRESENTER_EXE ? [] : [root], { env: { ...process.env, PRESENTER_TEST: '1', PRESENTER_HEADLESS: '1', PRESENTER_USER_DATA: userData } })
  const t0 = Date.now()
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
      const done = text.includes(READY)
      if (done || Date.now() - t0 > LIMIT_MS) {
        clearInterval(poll)
        const ms = Date.now() - t0
        p.once('exit', () => resolve({ ok: done, ms, text }))
        p.kill()
      }
    }, 100)
  })
}

let failed = 0
for (let i = 0; i < 3; i++) {
  const r = await start(i)
  console.log(`${r.ok ? 'ok' : 'FAIL'} single start ${i + 1}: ${r.ok ? `ready after ${r.ms} ms` : `not ready after ${LIMIT_MS} ms`}`)
  if (!r.ok) {
    failed++
    console.log(r.text)
  }
}
const together = await Promise.all(Array.from({ length: 8 }, (_, i) => start(10 + i)))
const bad = together.filter((r) => !r.ok)
console.log(`${bad.length ? 'FAIL' : 'ok'} 8 starts at once: ${together.length - bad.length} ready, slowest ${Math.max(...together.map((r) => r.ms))} ms`)
for (const r of bad) console.log(r.text)
failed += bad.length
// Child processes let go of their files a moment after the app closes.
await new Promise((r) => setTimeout(r, 1500))
for (let i = 0; i < 20; i++) remove(path.join(root, 'e2e', 'out', `userdata-start-${i}`))
if (failed) process.exit(1)
console.log('START OK')
