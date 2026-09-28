/**
 * 抽人 (random student picker). Rules are taken unchanged from the teacher's
 * earlier Lucky Roller page: everyone not yet picked has the same chance;
 * with Super Lucky on, picked people stay in at a small chance (0.05 / wins).
 */

export interface RollerPerson {
  id: string
  name: string
}

export interface RollStep {
  /** Person index to highlight. */
  index: number
  /** Milliseconds after the roll starts. */
  at: number
}

/** Length of the rolling highlight before it lands. */
export const ROLL_MS = 3000
const STEPS = 28
const FIRST_DELAY = 55
const LAST_DELAY = 420

/** One person per line: "ID Name". A line without a digit in its first word is a name only. */
export function parseNameList(text: string): RollerPerson[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [first, ...rest] = line.split(' ')
      if (rest.length > 0 && /\d/.test(first)) return { id: first, name: rest.join(' ') }
      return { id: '', name: line }
    })
}

export function rollWeight(wins: number, superLucky: boolean): number {
  if (wins === 0) return 1
  return superLucky ? 0.05 / wins : 0
}

/** Index of the picked person, or null when nobody can be picked. */
export function pickWinner(wins: number[], superLucky: boolean, random: () => number = Math.random): number | null {
  const weights = wins.map((w) => rollWeight(w, superLucky))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  let r = random() * total
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue
    if (r < weights[i]) return i
    r -= weights[i]
  }
  return weights.findIndex((w) => w > 0)
}

/**
 * The highlight's walk over the name cards: fast at first, slowing down
 * (ease-out), ending on the winner. Every screen plays the same path.
 */
export function rollPath(count: number, winner: number, random: () => number = Math.random, totalMs = ROLL_MS): RollStep[] {
  if (count <= 0) return []
  if (count === 1) return [{ index: 0, at: 0 }]
  const delays = Array.from({ length: STEPS }, (_, i) => FIRST_DELAY + (LAST_DELAY - FIRST_DELAY) * Math.pow(i / (STEPS - 1), 2.2))
  // Scale so the last step lands exactly at totalMs.
  const scale = totalMs / delays.slice(0, STEPS - 1).reduce((a, b) => a + b, 0)
  const path: RollStep[] = []
  let t = 0
  let previous = -1
  for (let i = 0; i < STEPS; i++) {
    let index = i === STEPS - 1 ? winner : Math.floor(random() * count) % count
    if (i < STEPS - 1) {
      // Never repeat the previous card, and do not show the winner just before it lands.
      for (let k = 0; k < count && (index === previous || (i === STEPS - 2 && index === winner)); k++) index = (index + 1) % count
    }
    path.push({ index, at: Math.round(t) })
    t += delays[i] * scale
    previous = index
  }
  return path
}
