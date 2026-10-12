import type { ReactNode } from 'react'

/**
 * The skeleton of a timer card, so the shared timer and My timer are alike row for row:
 * 1 the name with its caption (two lines) and one small control at the corner,
 * 2 the time, in a box of fixed height, 3 the main buttons, centred,
 * 4 a footer of two rows at the bottom (presets, or the modes and a line about them).
 * Same heights, same alignment: the two cards read as a pair.
 */
export function TimerCard(props: { title: string; caption: string; corner?: ReactNode; time: ReactNode; note?: ReactNode; controls: ReactNode; footer: ReactNode; tone: 'plain' | 'alarm' | 'over'; hint?: string }) {
  const { title, caption, corner, time, note, controls, footer, tone, hint } = props
  const ring = tone === 'alarm' ? 'animate-pulse bg-alarm/15 ring-2 ring-alarm' : tone === 'over' ? 'bg-alarm/10 ring-2 ring-alarm/60' : 'bg-panel ring-1 ring-line/60'
  return (
    <section className={`@container flex min-w-0 flex-col rounded-card p-3 ${ring}`} title={hint}>
      <div className="flex h-11 items-start gap-2">
        <div className="min-w-0 flex-1 leading-tight">
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          <p className="truncate text-sm text-muted">{caption}</p>
        </div>
        {corner}
      </div>
      <div className="flex h-[4.5rem] flex-col items-center justify-center">
        {time}
        {note}
      </div>
      <div className="flex h-10 flex-wrap items-center justify-center gap-2">{controls}</div>
      <div className="mt-auto flex flex-col gap-1.5 pt-3">{footer}</div>
    </section>
  )
}
