let ctx: AudioContext | null = null

function audio(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** One soft note; frequency in Hz, peak gain, length in seconds, start offset in seconds. */
function note(type: OscillatorType, freq: number, peak: number, length: number, offset = 0): void {
  const a = audio()
  const t0 = a.currentTime + offset
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.04, length / 4))
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + length + 0.05)
}

/** Three rising notes; repeated by the caller while the alarm is on. */
export function chime(): void {
  try {
    ;[880, 988, 1175].forEach((freq, i) => note('sine', freq, 0.35, 0.5, i * 0.28))
  } catch {
    // No audio device; the red flashing timer still shows the alarm.
  }
}

/** Short clear beeps before the class timer ends: 3 at the warning time, 1 for each of the last five seconds. */
export function beep(count = 1): void {
  try {
    for (let i = 0; i < count; i++) note('sine', 1046.5, 0.32, 0.14, i * 0.44)
  } catch {
    // No audio device; the countdown still shows.
  }
}

/** A short, quiet click for each step of the 抽人 highlight. */
export function tick(): void {
  try {
    note('triangle', 1400, 0.08, 0.04)
  } catch {
    // No audio device; the picture still shows the roll.
  }
}

/** The landing sound for 抽人. */
export function ding(): void {
  try {
    note('sine', 1319, 0.3, 0.8)
    note('sine', 1760, 0.22, 1.0, 0.12)
  } catch {
    // No audio device; the picture still shows the result.
  }
}
