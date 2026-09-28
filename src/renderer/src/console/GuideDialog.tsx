import { useEffect, useState, type ReactNode } from 'react'
import type { GuideFile } from '../../../shared/guide'
import { useT } from './i18n'
import { Btn } from './ui'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-black/25 p-4">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Deck guide: how to make an HTML deck that works fully with Presenter — the
 * paste-ready request for AI assistants, the example deck and the protocol.
 */
export function GuideDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
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
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6" onPointerDown={onClose}>
      <div role="dialog" aria-label={t.guideTitle} onPointerDown={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-4xl flex-col rounded-2xl border-2 border-line bg-panel shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-bold">{t.guideTitle}</h2>
          <span className="ml-auto">
            <Btn tone="quiet" onClick={onClose}>
              {t.close}
            </Btn>
          </span>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
          <p className="text-base text-muted">{t.guideIntro}</p>

          <Card title={t.guideAiTitle}>
            <ol className="mb-2 list-decimal space-y-1 pl-6 text-base">
              {t.guideAiSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mb-3 text-sm text-muted">{t.guideAiNote}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <Btn tone="primary" disabled={!request} onClick={copy}>
                {copied ? t.copied : t.copyRequest}
              </Btn>
              <Btn onClick={() => save('ai-request')}>{t.saveRequest}</Btn>
            </div>
            <pre className="max-h-56 overflow-auto rounded-xl border border-line bg-black/40 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap select-text">{request}</pre>
          </Card>

          <Card title={t.guideSelfTitle}>
            <p className="mb-3 text-base">{t.guideSelfText}</p>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => save('example-deck')}>{t.saveExample}</Btn>
              <Btn onClick={() => save('protocol')}>{t.saveProtocol}</Btn>
            </div>
          </Card>

          <Card title={t.guideReadyTitle}>
            <p className="text-base">{t.guideReadyText}</p>
          </Card>

          {saved && <p className="text-sm text-link select-text">{t.savedTo(saved)}</p>}
        </div>
      </div>
    </div>
  )
}
