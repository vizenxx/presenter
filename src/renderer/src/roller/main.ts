import type { RollerPlay } from '../../../shared/types'
import { ding, tick } from '../chime'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const stage = $<HTMLDivElement>('stage')
const grid = $<HTMLDivElement>('grid')
const bName = $<HTMLDivElement>('bName')
const bId = $<HTMLDivElement>('bId')
const bBadge = $<HTMLDivElement>('bBadge')
const count = $<HTMLDivElement>('count')
const groupsBox = $<HTMLDivElement>('groups')
const eyebrow = $<HTMLDivElement>('eyebrow')
const title = $<HTMLHeadingElement>('title')
let timers: number[] = []

const badgeText = (wins: number): string => (wins > 1 ? `Lucky × ${wins}` : 'Lucky')
const winsKind = (wins: number): string => (wins > 1 ? 'multi' : 'once')

/** Columns and name size so the whole class fits on one screen. */
function layoutFor(n: number): { cols: number; nameSize: string } {
  if (n <= 8) return { cols: 4, nameSize: '1.7vw' }
  if (n <= 15) return { cols: 5, nameSize: '1.55vw' }
  if (n <= 24) return { cols: 6, nameSize: '1.35vw' }
  if (n <= 35) return { cols: 7, nameSize: '1.2vw' }
  if (n <= 48) return { cols: 8, nameSize: '1.1vw' }
  return { cols: 10, nameSize: '0.95vw' }
}

function clearTimers(): void {
  timers.forEach((t) => window.clearTimeout(t))
  timers = []
}

function card(name: string, id: string, winsBefore: number): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'card'
  const n = document.createElement('span')
  n.className = 'name'
  n.textContent = name
  const i = document.createElement('span')
  i.className = 'id'
  i.textContent = id
  const b = document.createElement('span')
  b.className = 'badge'
  if (winsBefore > 0) {
    el.dataset['wins'] = winsKind(winsBefore)
    b.textContent = badgeText(winsBefore)
  }
  el.append(n, i, b)
  return el
}

window.roller.onPlay((play: RollerPlay) => {
  clearTimers()
  eyebrow.textContent = 'Lucky Roller'
  title.textContent = "Who's the Lucky One?"
  const { cols, nameSize } = layoutFor(play.people.length)
  grid.style.setProperty('--cols', String(cols))
  grid.style.setProperty('--name-size', nameSize)
  // The winner's count already includes this roll; show it only after the landing.
  const cards = play.people.map((p, i) => card(p.name, p.id, i === play.winner ? p.wins - 1 : p.wins))
  grid.replaceChildren(...cards)
  count.textContent = `${play.people.length} people`
  bName.textContent = ''
  bId.textContent = ''
  stage.dataset['phase'] = 'rolling'
  stage.hidden = false

  let previous: HTMLDivElement | null = null
  const now = Date.now()
  play.path.forEach((step, k) => {
    const last = k === play.path.length - 1
    timers.push(
      window.setTimeout(() => {
        previous?.classList.remove('hl')
        const current = cards[step.index]
        const person = play.people[step.index]
        bName.textContent = person.name
        bId.textContent = person.id
        if (last) {
          const wins = person.wins
          current.classList.add('winner')
          current.dataset['wins'] = winsKind(wins)
          ;(current.querySelector('.badge') as HTMLSpanElement).textContent = badgeText(wins)
          bBadge.textContent = badgeText(wins)
          bBadge.dataset['kind'] = winsKind(wins)
          stage.dataset['phase'] = 'landed'
          if (play.sound) ding()
        } else {
          current.classList.add('hl')
          previous = current
          if (play.sound) tick()
        }
      }, Math.max(0, play.startAt + step.at - now))
    )
  })
})

/** Random groups: one card per group with its names; sized so every group fits on one screen. */
window.roller.onGroups((groups: string[][], sound: boolean) => {
  clearTimers()
  eyebrow.textContent = 'Random groups'
  title.textContent = `${groups.length} groups`
  const people = groups.reduce((n, g) => n + g.length, 0)
  count.textContent = `${people} people`
  const cols = groups.length <= 4 ? groups.length : groups.length <= 6 ? 3 : groups.length <= 8 ? 4 : 5
  const perGroup = Math.max(...groups.map((g) => g.length))
  const rows = Math.ceil(groups.length / cols)
  groupsBox.style.setProperty('--gcols', String(cols))
  groupsBox.style.setProperty('--gname-size', `${Math.max(0.9, Math.min(2.2, 60 / (perGroup * rows + rows * 2)))}vw`)
  groupsBox.replaceChildren(
    ...groups.map((names, i) => {
      const box = document.createElement('section')
      box.className = 'group'
      box.style.animationDelay = `${i * 0.08}s`
      const h = document.createElement('h2')
      h.textContent = `Group ${i + 1}`
      const list = document.createElement('ul')
      list.append(...names.map((name) => Object.assign(document.createElement('li'), { textContent: name })))
      box.append(h, list)
      return box
    })
  )
  stage.dataset['phase'] = 'groups'
  stage.hidden = false
  if (sound) ding()
})

window.roller.onHide(() => {
  clearTimers()
  stage.hidden = true
})

window.addEventListener('pointerdown', () => window.roller.pointer())
