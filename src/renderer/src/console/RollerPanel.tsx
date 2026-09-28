import { useEffect, useState } from 'react'
import { parseNameList } from '../../../shared/roller'
import type { AppState, RollerView } from '../../../shared/types'
import { useT } from './i18n'
import { Btn } from './ui'

interface Draft {
  id: string | null
  name: string
  text: string
}

/** The name the console shows: flips along the same path as the students' screens. */
function useRollFace(r: RollerView): { person: { name: string; id: string } | null; landed: boolean } {
  const [now, setNow] = useState(() => Date.now())
  const roll = r.roll
  useEffect(() => {
    if (!roll || roll.path.length === 0) return
    const end = roll.startAt + roll.path[roll.path.length - 1].at
    let frame = 0
    const loop = (): void => {
      setNow(Date.now())
      if (Date.now() <= end + 60) frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [roll])
  if (!roll || roll.path.length === 0 || r.people.length === 0) return { person: null, landed: false }
  const elapsed = now - roll.startAt
  let step = roll.path[0]
  for (const s of roll.path) if (s.at <= elapsed) step = s
  return { person: r.people[step.index] ?? null, landed: elapsed >= roll.path[roll.path.length - 1].at }
}

function ListEditor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const t = useT()
  const [name, setName] = useState(draft.name)
  const [text, setText] = useState(draft.text)
  const count = parseNameList(text).length
  const remove = (): void => {
    if (draft.id && window.confirm(t.confirmDelete(name))) {
      window.presenter.rollerDeleteList(draft.id)
      onDone()
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{draft.id ? t.editList : t.createList}</h3>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.listNamePlaceholder} className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm select-text" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder={t.listPlaceholder} className="resize-y rounded-lg border border-line bg-panel-2 p-2 font-mono text-sm select-text" />
      <p className="text-sm text-muted">{t.listSummary(count)}</p>
      <div className="flex flex-wrap gap-2">
        <Btn
          tone="primary"
          disabled={count === 0}
          onClick={() => {
            window.presenter.rollerSaveList(draft.id, name, text)
            onDone()
          }}
        >
          {t.save}
        </Btn>
        <Btn onClick={onDone}>{t.cancel}</Btn>
        {draft.id && (
          <Btn tone="quiet" onClick={remove}>
            {t.deleteList}
          </Btn>
        )}
      </div>
    </div>
  )
}

/** Random student (随机点名, formerly 抽人); the rolling names show on the students' screens. */
export function RollerPanel({ state }: { state: AppState }) {
  const t = useT()
  const r = state.roller
  const [draft, setDraft] = useState<Draft | null>(null)
  const face = useRollFace(r)
  if (draft) return <ListEditor draft={draft} onDone={() => setDraft(null)} />

  const active = r.lists.find((l) => l.id === r.activeListId)
  const winner = r.roll ? r.people[r.roll.winner] : undefined
  const repeat = face.landed && winner !== undefined && winner.wins > 1
  const audience = state.projecting || state.outputs.some((o) => o.kind === 'window')
  const faceBox = face.landed ? (repeat ? 'border-gold bg-gold/10' : 'border-link bg-link/10') : 'border-line bg-panel-2'
  const faceText = face.landed ? 'text-ink' : r.roll ? 'text-accent' : 'text-muted'
  // Keep the result hidden in the counts until the highlight lands.
  const winsOf = (i: number): number => (r.roll && i === r.roll.winner && !face.landed ? r.people[i].wins - 1 : r.people[i].wins)
  const pickedCount = r.people.filter((_, i) => winsOf(i) > 0).length
  const resetPicks = (): void => {
    if (window.confirm(t.confirmResetPicks)) window.presenter.rollerReset()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          value={r.activeListId ?? ''}
          onChange={(e) => window.presenter.rollerSelectList(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm"
          title={t.chooseList}
        >
          {r.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {t.listOption(l.name, l.count)}
            </option>
          ))}
        </select>
        <Btn disabled={!active} onClick={() => active && setDraft({ id: active.id, name: active.name, text: r.activeText })}>
          {t.edit}
        </Btn>
        <Btn onClick={() => setDraft({ id: null, name: '', text: '' })}>{t.newList}</Btn>
      </div>

      <div className={`rounded-xl border-2 p-4 text-center ${faceBox}`}>
        <div className={`truncate text-2xl font-bold ${faceText}`}>{face.person ? face.person.name : t.ready}</div>
        <div className="mt-1 min-h-5 font-mono text-sm text-muted">{face.person ? face.person.id : t.pressToPick}</div>
        {face.landed && winner && <div className={`mt-1 text-sm font-semibold ${repeat ? 'text-gold' : 'text-link'}`}>{repeat ? t.pickedTimes(winner.wins) : t.picked}</div>}
      </div>

      <button
        type="button"
        disabled={r.people.length === 0}
        onClick={() => window.presenter.rollerRoll()}
        className="rounded-xl bg-accent py-3 text-base font-bold text-black transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t.pickOne}
      </button>
      {r.showing ? <Btn onClick={() => window.presenter.rollerHide()}>{t.hideRoller}</Btn> : !audience && <p className="text-sm text-muted">{t.noAudience}</p>}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{t.pickedCount(pickedCount, r.people.length)}</span>
        <span className="ml-auto">
          <Btn title={t.resetPicksTitle} disabled={pickedCount === 0 && !r.roll} onClick={resetPicks}>
            {t.resetPicks}
          </Btn>
        </span>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" checked={r.superLucky} onChange={(e) => window.presenter.rollerSetSuperLucky(e.target.checked)} className="mt-0.5 h-4 w-4 accent-link" />
        <span>{t.superLucky}</span>
      </label>

      <h3 className="text-sm font-semibold text-muted">{t.listCount(r.people.length)}</h3>
      <ul className="flex flex-col gap-0.5">
        {r.people.map((p, i) => {
          const wins = winsOf(i)
          return (
            <li key={`${p.id}-${i}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-mono text-muted">{p.id}</span>
              {wins > 0 && <span className={`rounded px-1.5 font-semibold text-black ${wins > 1 ? 'bg-gold' : 'bg-link'}`}>{wins > 1 ? t.timesShort(wins) : t.picked}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
