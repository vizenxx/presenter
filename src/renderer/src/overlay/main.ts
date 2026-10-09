import { mmss } from '../../../shared/format'
import { timerCue } from '../../../shared/timer'
import type { TimerView } from '../../../shared/types'
import { beep, chime } from '../chime'

const pill = document.getElementById('pill') as HTMLDivElement
let alarm: number | null = null
let last: TimerView | null = null

window.overlay.onTimer((t) => {
  pill.textContent = mmss(t.remainingSec)
  pill.dataset['state'] = t.alarming ? 'alarm' : t.status
  // The overlay plays the class timer's sounds even when a deck shows the countdown itself.
  const cue = timerCue(last, t, t.warnings)
  last = t
  if (cue?.kind === 'warning') beep(cue.beeps)
  if (cue?.kind === 'last-seconds') beep(1)
  // The end-to-end test reads which beeps played.
  if (cue) document.body.dataset['cues'] = `${document.body.dataset['cues'] ?? ''}${cue.kind === 'warning' ? `warning:${cue.beeps}` : cue.kind} `
  if (t.alarming && alarm === null) {
    chime()
    alarm = window.setInterval(chime, 1200)
  }
  if (!t.alarming && alarm !== null) {
    window.clearInterval(alarm)
    alarm = null
  }
})

window.addEventListener('pointerdown', () => window.overlay.pointer())
