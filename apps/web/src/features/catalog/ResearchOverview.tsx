import { Check, Clipboard, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, NoticeBanner, StatusBadge } from '../../components/ui'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'
import { ResearchCover } from './ResearchCover'
import { fetchResearchOverview } from './research-catalog-api'
import type { ResearchCatalogItem } from './research-catalog-types'
import { buildApaResearchReference } from './research-citation'

export function ResearchOverview({ researchId, onClose }: { researchId: number; onClose: () => void }) {
  const [paper, setPaper] = useState<ResearchCatalogItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [citationVisible, setCitationVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setHasError(false)
      setErrorMessage('')
      try {
        const record = await fetchResearchOverview(researchId, controller.signal)
        if (!controller.signal.aborted) setPaper(record)
      } catch (reason) {
        if (!controller.signal.aborted) {
          setPaper(null)
          setHasError(true)
          setErrorMessage(reason instanceof Error ? reason.message : 'The research record could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [researchId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const citation = useMemo(() => (paper ? buildApaResearchReference(paper) : ''), [paper])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setHasError(true)
      setErrorMessage('Clipboard access is unavailable. Select and copy the reference manually.')
    }
  }

  return (
    <div
      className="sl-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-[#132a3f]/65 p-3 backdrop-blur-[3px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-overview-title"
    >
      <button className="absolute inset-0" aria-label="Close research overview" onClick={onClose} />
      <div className="sl-book-modal-in relative z-10 flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[16px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-5 py-4 sm:px-7">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#4f46e5] dark:text-[#c7d2fe]">
              Research overview
            </p>
            <h2
              id="research-overview-title"
              className="mt-0.5 font-display text-lg font-bold text-[var(--sl-text-header)] sm:text-xl"
            >
              Complete repository record
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-[8px] border border-[var(--sl-border-strong)] p-2 text-[var(--sl-text-secondary)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_310px] lg:overflow-hidden">
          {/* LEFT SIDE: Complete Research Details */}
          <div className="min-w-0 space-y-5 p-4 sm:p-7 lg:overflow-y-auto">
            {hasError ? (
              <NoticeBanner tone="error" title="Research details unavailable">
                {errorMessage}
              </NoticeBanner>
            ) : null}
            {loading ? (
              <p className="py-20 text-center text-sm font-medium text-[var(--sl-text-secondary)]">
                Loading research details…
              </p>
            ) : null}

            {paper ? (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[#4f46e5]/14 px-2.5 py-0.5 text-[11px] font-semibold text-[#4f46e5] dark:bg-[#4f46e5]/25 dark:text-[#c7d2fe]">
                      View only
                    </span>
                    <StatusBadge status={paper.accessStatus} />
                  </div>
                  <h3 className="mt-2.5 font-display text-2xl font-bold leading-tight text-[var(--sl-text-header)]">
                    {paper.title}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-[var(--sl-text-secondary)]">
                    {paper.authors}
                  </p>
                </div>

                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                      Department
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">
                      {paper.department}
                    </dd>
                  </div>
                  <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                      Year
                    </dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--sl-text-header)]">
                      {paper.publicationYear ?? 'Not recorded'}
                    </dd>
                  </div>
                  <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                      Shelf location
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">
                      {paper.shelfLocation}
                    </dd>
                  </div>
                  <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                      Adviser
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">
                      {paper.adviser}
                    </dd>
                  </div>
                </dl>

                <CatalogDetailsPanel titleId={paper.titleId} />

                <section className="rounded-[10px] border border-[var(--sl-border)] p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--sl-text-muted)]">
                    Abstract
                  </h4>
                  <div className="mt-3 max-h-72 overflow-y-auto rounded-[8px] bg-[var(--sl-bg-subtle)]/65 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--sl-text)]">
                      {paper.abstract}
                    </p>
                  </div>
                </section>

                <section className="rounded-[10px] border border-[var(--sl-border)] p-4">
                  <Button variant="secondary" onClick={() => setCitationVisible((value) => !value)}>
                    <Clipboard size={16} aria-hidden="true" />
                    Generate APA reference
                  </Button>
                  {citationVisible ? (
                    <div className="mt-3">
                      <label htmlFor="research-apa" className="text-xs font-semibold text-[var(--sl-text-header)]">
                        APA 7th Edition reference
                      </label>
                      <textarea
                        id="research-apa"
                        readOnly
                        value={citation}
                        className="sl-input mt-1.5 min-h-28 resize-none"
                      />
                      <button
                        onClick={copy}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
                      >
                        {copied ? <Check size={15} /> : <Clipboard size={15} />}
                        {copied ? 'Copied' : 'Copy to clipboard'}
                      </button>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>

          {/* RIGHT SIDE: Animated 3D Pop-Up Thesis Jacket */}
          <aside className="order-first relative flex shrink-0 flex-col items-center justify-center border-b border-[var(--sl-border)] bg-gradient-to-br from-[#132a3f] via-[#312e81] to-[#0b5ea2] p-5 text-white lg:order-last lg:border-b-0 lg:border-l lg:p-6">
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#FFF200]/15 blur-2xl"
              aria-hidden="true"
            />
            {paper ? (
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="sl-book-pop h-48 w-32 overflow-hidden rounded-[10px] border-2 border-white/25 shadow-[0_24px_45px_-12px_rgba(7,20,36,0.65)] sm:h-64 sm:w-44 lg:h-72 lg:w-48">
                  <ResearchCover
                    title={paper.title}
                    department={paper.department}
                    author={paper.authors}
                    publicationYear={paper.publicationYear}
                  />
                </div>
                <div className="mt-5 w-full rounded-[10px] bg-white/10 px-4 py-3 text-center ring-1 ring-white/15 backdrop-blur-xs">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFF200]">
                    In-library reference
                  </p>
                  <p className="mt-1 font-display text-base font-bold text-white">
                    {paper.shelfLocation}
                  </p>
                  <p className="mt-0.5 text-xs text-white/80">
                    {paper.department}
                    {paper.publicationYear ? ` · ${paper.publicationYear}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-64 w-44 animate-pulse rounded-[10px] bg-white/15" />
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
