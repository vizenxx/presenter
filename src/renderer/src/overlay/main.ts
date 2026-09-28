import { mmss } from '../../../shared/format'
import { chime } from '../chime'

const pill = document.getElementById('pill') as HTMLDivElement
let alarm: number | null = null

window.overlay.onTimer((t) => {
  pill.textContent = mmss(t.remainingSec)
  pill.dataset['state'] = t.alarming ? 'alarm' : t.status
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
