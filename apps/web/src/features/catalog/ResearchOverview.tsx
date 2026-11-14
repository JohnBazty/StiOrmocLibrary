import { Check, Clipboard, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchResearchOverview } from './research-catalog-api'
import { buildApaResearchReference } from './research-citation'
import type { ResearchCatalogItem } from './research-catalog-types'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'
import { useCatalogDialog } from './useCatalogDialog'
import './research-reference.css'

export function ResearchOverview({ researchId, onClose }: { researchId: number; onClose: () => void }) {
  const dialog = useCatalogDialog(true,onClose)
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
      setCitationVisible(false)
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

  const citation = useMemo(() => paper ? buildApaResearchReference(paper) : '', [paper])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { setHasError(true); setErrorMessage('Clipboard access is unavailable. Select and copy the reference manually.') }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#001133]/50 p-4 backdrop-blur-sm" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close research overview" onClick={onClose} />
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="research-overview-title" className="research-reference relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-[#22232e] dark:ring-white/10">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/10 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b5ea2]/55 dark:text-white/50">Research overview</p>
            <h2 id="research-overview-title" className="mt-1 font-display text-lg font-black text-zinc-900 dark:text-white sm:text-xl">{paper?.title ?? (loading ? 'Loading research…' : 'Research details')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {hasError ? <div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-sm text-[#0b5ea2]"><p className="font-bold">Research details unavailable</p><p className="mt-1">{errorMessage}</p></div> : null}
          {loading ? <div className="flex flex-col items-center justify-center py-20 text-zinc-400"><div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-[#0b5ea2]" /><p className="mt-4 text-sm font-semibold text-[#0b5ea2]">Loading research details…</p></div> : null}
          {paper ? <>
            <section className="rounded-2xl bg-[#0b5ea2] p-5 text-white"><h3 className="font-display text-xl font-bold leading-tight sm:text-2xl">{paper.title}</h3><p className="mt-2 text-sm text-white/80">{paper.authors}</p><span className="mt-4 inline-flex rounded-full bg-[#FFF200] px-3 py-1 text-xs font-bold text-[#0b5ea2]">View only — library use</span><p className="mt-3 text-xs leading-5 text-white/75">This bound thesis stays in the library. It cannot be borrowed, reserved, or added to a cart.</p></section>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/10"><dt className="text-[10px] font-bold uppercase text-[#0b5ea2]/55 dark:text-white/50">Department</dt><dd className="mt-1 text-sm font-semibold text-[#0b5ea2] dark:text-white">{paper.department}</dd></div><div className="rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/10"><dt className="text-[10px] font-bold uppercase text-[#0b5ea2]/55 dark:text-white/50">Year</dt><dd className="mt-1 text-sm font-semibold text-[#0b5ea2] dark:text-white">{paper.publicationYear ?? 'Not recorded'}</dd></div><div className="rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/10"><dt className="text-[10px] font-bold uppercase text-[#0b5ea2]/55 dark:text-white/50">Shelf location</dt><dd className="mt-1 text-sm font-semibold text-[#0b5ea2] dark:text-white">{paper.shelfLocation}</dd></div><div className="rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/10"><dt className="text-[10px] font-bold uppercase text-[#0b5ea2]/55 dark:text-white/50">Adviser</dt><dd className="mt-1 text-sm font-semibold text-[#0b5ea2] dark:text-white">{paper.adviser}</dd></div></dl>
            <CatalogDetailsPanel titleId={paper.titleId} />
            <section className="mt-5 rounded-2xl border border-[#0b5ea2]/10 p-4 dark:border-white/10"><h4 className="text-xs font-bold uppercase tracking-wider text-[#0b5ea2] dark:text-white">Abstract</h4><div className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-[#0b5ea2]/5 p-4 dark:bg-white/5"><p className="whitespace-pre-wrap text-sm leading-7 text-[#0b5ea2]/75 dark:text-white/75">{paper.abstract}</p></div></section>
            <section className="mt-5 rounded-2xl border border-[#0b5ea2]/10 p-4 dark:border-white/10"><button type="button" onClick={() => setCitationVisible((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#0b5ea2]"><Clipboard size={16} /> Generate APA reference</button>{citationVisible ? <div className="mt-3"><label htmlFor="research-apa" className="text-xs font-bold text-[#0b5ea2] dark:text-white">APA 7th Edition reference</label><textarea id="research-apa" readOnly value={citation} className="mt-1.5 min-h-28 w-full resize-none rounded-xl border border-[#0b5ea2]/15 p-3 text-sm text-[#0b5ea2] dark:border-white/15 dark:bg-[#22232e] dark:text-white" /><button type="button" onClick={copy} className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-[#0b5ea2] dark:text-[#FFF200]">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy to clipboard'}</button></div> : null}</section>
          </> : null}
        </div>
      </div>
    </div>
  )
}
