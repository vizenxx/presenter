import { useEffect, useState, type ReactNode } from 'react'
import type { GuideFile } from '../../../shared/guide'
import { useT } from './i18n'
import { Btn } from './ui'

type GuideTab = 'use' | 'prepare'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-panel-2 p-4">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/** A plain table: a header row, then one row per item. widths = column widths (text wraps inside). */
function Table({ head, rows, widths }: { head: string[]; rows: string[][]; widths: string[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-left text-base">
      <thead>
        <tr className="border-b border-line/70 text-sm text-muted">
          {head.map((h, i) => (
            <th key={h} className={`px-3 py-2 font-semibold ${widths[i]}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]} className="border-b border-line/60 align-top">
            {row.map((cell, i) => (
              <td key={i} className={`px-3 py-2 ${i === 0 ? 'font-semibold' : ''}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Guide with two parts: using Presenter in class, and which decks need preparation
 * (with the paste-ready request for AI assistants, the example deck and the protocol).
 */
export function GuideDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [tab, setTab] = useState<GuideTab>('use')
  const [request, setRequest] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    void window.presenter.guide().then((g) => setRequest(g.aiRequest))
  }, [])

  // Esc closes the guide (and must not stop projecting).
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

  const copy = (): void => {
    window.presenter.copyText(request)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  const save = (which: GuideFile): void => {
    void window.presenter.saveGuideFile(which).then((p) => {
      if (p) setSaved(p)
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm" onPointerDown={onClose}>
      {/* The height is capped to the window, so the body scrolls instead of running off screen. */}
      <div role="dialog" aria-label={t.guideTitle} onPointerDown={(e) => e.stopPropagation()} className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] bg-panel shadow-2xl ring-1 ring-line/70">
        <div className="border-b border-line/70 px-5 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[21px] font-semibold tracking-tight">{t.guideTitle}</h2>
            <span className="ml-auto">
              <Btn tone="quiet" onClick={onClose}>
                {t.close}
              </Btn>
            </span>
          </div>
          <p className="mt-1 text-base text-muted">{t.guidePurpose}</p>
          <div className="mt-3 flex gap-2">
            <Btn tone={tab === 'use' ? 'primary' : 'default'} onClick={() => setTab('use')}>
              {t.guideTabUse}
            </Btn>
            <Btn tone={tab === 'prepare' ? 'primary' : 'default'} onClick={() => setTab('prepare')}>
              {t.guideTabPrepare}
            </Btn>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {tab === 'use' && <Table head={[t.guideWant, t.guideDo]} rows={t.guideUseRows} widths={['w-[28%]', '']} />}

          {tab === 'prepare' && (
            <>
              <p className="text-base">{t.guidePrepareIntro}</p>
              <Table head={[t.guideKind, t.guideTodo, t.guideResult]} rows={t.guidePrepareRows} widths={['w-[32%]', 'w-[28%]', '']} />

              <Card title={t.guideAiTitle}>
                <ol className="mb-2 list-decimal space-y-1 pl-6 text-base">
                  {t.guideAiSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mb-3 text-sm text-muted">{t.guideAiNote}</p>
                <div className="flex flex-wrap gap-2">
                  <Btn tone="primary" disabled={!request} onClick={copy}>
                    {copied ? t.copied : t.copyRequest}
                  </Btn>
                  <Btn onClick={() => save('ai-request')}>{t.saveRequest}</Btn>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-tint">{t.showRequest}</summary>
                  <pre className="mt-2 rounded-xl bg-page p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap select-text">{request}</pre>
                </details>
              </Card>

              <Card title={t.guideSelfTitle}>
                <p className="mb-3 text-base">{t.guideSelfText}</p>
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => save('example-deck')}>{t.saveExample}</Btn>
                  <Btn onClick={() => save('protocol')}>{t.saveProtocol}</Btn>
                </div>
              </Card>

              {saved && <p className="text-sm text-link select-text">{t.savedTo(saved)}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
