import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { makeGroups, parseNameList, pickWinner, rollPath, type RollerPerson } from '../shared/roller'
import type { RollerPersonView, RollerRoll, RollerView } from '../shared/types'

interface NameList {
  id: string
  name: string
  text: string
}

interface Saved {
  lists: NameList[]
  activeListId: string | null
  superLucky: boolean
  /** Only the ticked names can be picked. */
  onlySelected?: boolean
  /** The ticked names of each list ("id name"); the list text is not touched. */
  selected?: Record<string, string[]>
}

/**
 * A sample list for the first start; the teacher replaces it with a class (Edit).
 * No real names here: the app is shared with other teachers.
 */
const SEED_TEXT = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, '0')} Person ${i + 1}`).join('\n')

/** Pause after the highlight lands before a key or click may close the picture. */
const LANDING_GUARD_MS = 400

const file = (): string => path.join(app.getPath('userData'), 'roller.json')

/**
 * 抽人 state. Name lists and the Super Lucky switch are saved; pick counts live
 * for the app session only (like the old page), per list.
 */
export class RollerController {
  showing = false
  private saved: Saved
  private people: RollerPerson[] = []
  private readonly winsByList = new Map<string, number[]>()
  private current: RollerRoll | null = null
  /** The last random groups (names), until another roll, list or reset. */
  private groupsMade: string[][] | null = null
  private rollSeq = 0

  /** names() gives the default and untitled list names in the chosen language. */
  constructor(private readonly names: () => { defaultList: string; untitledList: string }) {
    this.saved = this.load()
    this.refresh()
  }

  roll(): RollerRoll | null {
    const wins = this.wins()
    const allowed = this.allowedMask()
    const winner = pickWinner(wins, this.saved.superLucky, Math.random, allowed)
    if (winner === null) return null
    wins[winner]++
    this.groupsMade = null
    // The highlight walks over the people who can be picked only; the numbers are places in the whole list.
    const room = allowed.flatMap((ok, i) => (ok ? [i] : []))
    const path = rollPath(room.length, room.indexOf(winner)).map((s) => ({ ...s, index: room[s.index] }))
    this.current = { rollId: ++this.rollSeq, path, winner, startAt: Date.now() + 150 }
    return this.current
  }

  /** What the participants' screens play: only the people who can be picked, and the roll's places among them. */
  playView(roll: RollerRoll): { people: RollerPersonView[]; path: RollerRoll['path']; winner: number } {
    const all = this.peopleView()
    const room = this.allowedMask().flatMap((ok, i) => (ok ? [i] : []))
    const at = (i: number): number => Math.max(0, room.indexOf(i))
    return { people: room.map((i) => all[i]), path: roll.path.map((s) => ({ ...s, index: at(s.index) })), winner: at(roll.winner) }
  }

  /** Who can be picked: the ticked names when "only the ticked names" is on, else everyone. */
  private allowedMask(): boolean[] {
    return this.people.map((p) => !this.saved.onlySelected || this.isSelected(p))
  }

  private key(p: RollerPerson): string {
    return `${p.id} ${p.name}`
  }

  private isSelected(p: RollerPerson): boolean {
    return (this.saved.selected?.[this.activeKey()] ?? []).includes(this.key(p))
  }

  setOnlySelected(on: boolean): void {
    this.saved.onlySelected = on
    this.current = null
    this.save()
  }

  /** Tick or untick one name (its place in the list), or everyone (null). The list text stays as it is. */
  select(index: number | null, on: boolean): void {
    const keys = new Set(this.saved.selected?.[this.activeKey()] ?? [])
    const targets = index === null ? this.people : [this.people[index]].filter(Boolean)
    for (const p of targets) {
      if (on) keys.add(this.key(p))
      else keys.delete(this.key(p))
    }
    this.saved.selected = { ...(this.saved.selected ?? {}), [this.activeKey()]: [...keys] }
    this.save()
  }

  /** True while the highlight is still moving; keys and clicks then do not close the picture. */
  busy(now = Date.now()): boolean {
    const roll = this.current
    if (!roll || roll.path.length === 0) return false
    return now < roll.startAt + roll.path[roll.path.length - 1].at + LANDING_GUARD_MS
  }

  reset(): void {
    this.winsByList.set(this.activeKey(), this.people.map(() => 0))
    this.current = null
    this.groupsMade = null
  }

  /** Takes the made groups away (the picks stay as they are). */
  clearGroups(): void {
    this.groupsMade = null
  }

  /** Random groups of the active list (names); null when the list is empty. */
  groups(count: number): string[][] | null {
    if (this.people.length === 0) return null
    this.groupsMade = makeGroups(this.people.length, count).map((g) => g.map((i) => this.people[i].name))
    this.current = null
    return this.groupsMade
  }

  setSuperLucky(on: boolean): void {
    this.saved.superLucky = on
    this.save()
  }

  selectList(id: string): void {
    if (!this.saved.lists.some((l) => l.id === id)) return
    this.saved.activeListId = id
    this.save()
    this.refresh()
  }

  saveList(id: string | null, name: string, text: string): void {
    const title = name.trim() || this.names().untitledList
    let list = id ? this.saved.lists.find((l) => l.id === id) : undefined
    if (list) {
      list.name = title
      list.text = text
    } else {
      list = { id: `list-${Date.now().toString(36)}`, name: title, text }
      this.saved.lists.push(list)
    }
    this.winsByList.delete(list.id)
    this.saved.activeListId = list.id
    this.save()
    this.refresh()
  }

  deleteList(id: string): void {
    this.saved.lists = this.saved.lists.filter((l) => l.id !== id)
    this.winsByList.delete(id)
    if (this.saved.activeListId === id) this.saved.activeListId = this.saved.lists[0]?.id ?? null
    this.save()
    this.refresh()
  }

  peopleView(): RollerPersonView[] {
    const wins = this.wins()
    return this.people.map((p, i) => ({ ...p, wins: wins[i] ?? 0, selected: this.isSelected(p) }))
  }

  view(): RollerView {
    const active = this.activeList()
    return {
      lists: this.saved.lists.map((l) => ({ id: l.id, name: l.name, count: parseNameList(l.text).length })),
      activeListId: active?.id ?? null,
      activeText: active?.text ?? '',
      people: this.peopleView(),
      superLucky: this.saved.superLucky,
      onlySelected: this.saved.onlySelected === true,
      eligible: this.allowedMask().filter(Boolean).length,
      roll: this.current,
      showing: this.showing,
      groups: this.groupsMade
    }
  }

  private activeList(): NameList | undefined {
    return this.saved.lists.find((l) => l.id === this.saved.activeListId)
  }

  private activeKey(): string {
    return this.saved.activeListId ?? ''
  }

  private wins(): number[] {
    const key = this.activeKey()
    let wins = this.winsByList.get(key)
    if (!wins || wins.length !== this.people.length) {
      wins = this.people.map(() => 0)
      this.winsByList.set(key, wins)
    }
    return wins
  }

  private refresh(): void {
    const list = this.activeList()
    this.people = list ? parseNameList(list.text) : []
    this.current = null
    this.groupsMade = null
  }

  private load(): Saved {
    try {
      const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as Saved
      if (Array.isArray(saved.lists)) return { lists: saved.lists, activeListId: saved.activeListId ?? saved.lists[0]?.id ?? null, superLucky: saved.superLucky !== false, onlySelected: saved.onlySelected === true, selected: saved.selected && typeof saved.selected === 'object' ? saved.selected : {} }
    } catch {
      // First start: fall through to the seed list.
    }
    return { lists: [{ id: 'list-default', name: this.names().defaultList, text: SEED_TEXT }], activeListId: 'list-default', superLucky: true }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(file()), { recursive: true })
      fs.writeFileSync(file(), JSON.stringify(this.saved, null, 2))
    } catch {
      // Saving is a convenience; the roller keeps working in memory.
    }
  }
}
