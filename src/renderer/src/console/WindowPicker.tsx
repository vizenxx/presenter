import { useEffect, useState } from 'react'
import type { WindowSource } from '../../../shared/types'
import { useT } from './i18n'
import { IS_MAC } from './platform'
import { Btn } from './ui'

/** Choose a program window to become a window screen. */
export function WindowPicker({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [windows, setWindows] = useState<WindowSource[] | null>(null)

  useEffect(() => {
    void window.presenter.listWindows().then(setWindows, () => setWindows([]))
  }, [])

  // Esc closes the list (and must not stop projecting).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const choose = (w: WindowSource): void => {
    window.presenter.addWindowScreen(w.id, w.name)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6" onPointerDown={onClose}>
      <div role="dialog" aria-label={t.pickWindowTitle} onPointerDown={(e) => e.stopPropagation()} className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col rounded-2xl border-2 border-line bg-panel shadow-2xl">
        <div className="border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">{t.pickWindowTitle}</h2>
            <span className="ml-auto">
              <Btn tone="quiet" onClick={onClose}>
                {t.close}
              </Btn>
            </span>
          </div>
          <p className="mt-1 text-base text-muted">{t.pickWindowIntro}</p>
          {IS_MAC && <p className="mt-1 text-sm text-muted">{t.pickWindowMac}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {windows === null && <p className="text-base text-muted">{t.loadingWindows}</p>}
          {windows !== null && windows.length === 0 && <p className="text-base text-muted">{t.noWindows}</p>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
            {windows?.map((w) => (
              <button key={w.id} type="button" title={w.name} onClick={() => choose(w)} className="flex flex-col gap-1.5 rounded-xl border-2 border-line bg-panel-2 p-2 text-left hover:border-accent">
                {w.thumbnail ? (
                  <img src={w.thumbnail} alt="" className="aspect-[16/10] w-full rounded-lg bg-black object-contain" />
                ) : (
                  // A minimized window has no picture: its program icon stands in (as in Zoom).
                  <span className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-lg bg-black/60">
                    {w.icon ? <img src={w.icon} alt="" className="h-12 w-12" /> : <span className="text-4xl">🪟</span>}
                    {w.minimized && <span className="text-sm text-muted">{t.minimizedWindow}</span>}
                  </span>
                )}
                <span className="flex min-w-0 items-center gap-1.5">
                  {w.icon && w.thumbnail && <img src={w.icon} alt="" className="h-4 w-4 shrink-0" />}
                  <span className="truncate text-sm font-semibold">{w.name}</span>
                </span>
                {w.app && <span className="truncate text-sm text-muted">{w.app}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
