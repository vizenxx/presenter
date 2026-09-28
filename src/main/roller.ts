import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { parseNameList, pickWinner, rollPath, type RollerPerson } from '../shared/roller'
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
}

/**
 * A sample list for the first start; the teacher replaces it with a class (Edit).
 * No real names here: the app is shared with other teachers.
 */
const SEED_TEXT = Array.from({ length: 12 }, (_, i) => `S${String(i + 1).padStart(2, '0')} Student ${i + 1}`).join('\n')

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
  private rollSeq = 0

  /** names() gives the default and untitled list names in the chosen language. */
  constructor(private readonly names: () => { defaultList: string; untitledList: string }) {
    this.saved = this.load()
    this.refresh()
  }

  roll(): RollerRoll | null {
    const wins = this.wins()
    const winner = pickWinner(wins, this.saved.superLucky)
    if (winner === null) return null
    wins[winner]++
    this.current = { rollId: ++this.rollSeq, path: rollPath(this.people.length, winner), winner, startAt: Date.now() + 150 }
    return this.current
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
    return this.people.map((p, i) => ({ ...p, wins: wins[i] ?? 0 }))
  }

  view(): RollerView {
    const active = this.activeList()
    return {
      lists: this.saved.lists.map((l) => ({ id: l.id, name: l.name, count: parseNameList(l.text).length })),
      activeListId: active?.id ?? null,
      activeText: active?.text ?? '',
      people: this.peopleView(),
      superLucky: this.saved.superLucky,
      roll: this.current,
      showing: this.showing
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
  }

  private load(): Saved {
    try {
      const saved = JSON.parse(fs.readFileSync(file(), 'utf8')) as Saved
      if (Array.isArray(saved.lists)) return { lists: saved.lists, activeListId: saved.activeListId ?? saved.lists[0]?.id ?? null, superLucky: saved.superLucky !== false }
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
