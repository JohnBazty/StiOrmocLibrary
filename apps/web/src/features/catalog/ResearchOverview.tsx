import { Check, Clipboard, FileText, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchResearchOverview } from './research-catalog-api'
import { buildApaResearchReference } from './research-citation'
import type { ResearchCatalogItem } from './research-catalog-types'

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

  const citation = useMemo(() => paper ? buildApaResearchReference(paper) : '', [paper])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { setHasError(true); setErrorMessage('Clipboard access is unavailable. Select and copy the reference manually.') }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-[#003399]/45" role="dialog" aria-modal="true" aria-labelledby="research-overview-title">
    <button className="absolute inset-0" aria-label="Close research overview" onClick={onClose} />
    <aside className="relative z-10 h-full w-full max-w-2xl overflow-y-auto bg-[#FFFFFF] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#003399]/10 bg-[#FFFFFF] px-5 py-4 sm:px-7"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Research overview</p><h2 id="research-overview-title" className="mt-1 font-display text-xl font-bold text-[#003399]">Complete repository record</h2></div><button onClick={onClose} aria-label="Close" className="rounded-xl border border-[#003399]/15 p-2 text-[#003399]"><X size={20} /></button></header>
      <div className="p-5 sm:p-7">
        {hasError ? <div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-sm text-[#003399]"><p className="font-bold">Research details unavailable</p><p className="mt-1">{errorMessage}</p></div> : null}
        {loading ? <p className="py-20 text-center text-sm font-semibold text-[#003399]">Loading research details…</p> : null}
        {paper ? <>
          <section className="rounded-2xl bg-[#003399] p-5 text-[#FFFFFF]"><span className="inline-flex rounded-xl bg-[#FFF200] p-3 text-[#003399]"><FileText size={23} /></span><h3 className="mt-4 font-display text-2xl font-bold leading-tight">{paper.title}</h3><p className="mt-2 text-sm text-[#FFFFFF]/80">{paper.authors}</p><span className="mt-4 inline-flex rounded-full bg-[#FFFFFF] px-3 py-1 text-xs font-bold text-[#003399]">View only</span></section>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[#003399]/10 p-3"><dt className="text-[10px] font-bold uppercase text-[#003399]/55">Department</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{paper.department}</dd></div><div className="rounded-xl border border-[#003399]/10 p-3"><dt className="text-[10px] font-bold uppercase text-[#003399]/55">Year</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{paper.publicationYear ?? 'Not recorded'}</dd></div><div className="rounded-xl border border-[#003399]/10 p-3"><dt className="text-[10px] font-bold uppercase text-[#003399]/55">Shelf location</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{paper.shelfLocation}</dd></div><div className="rounded-xl border border-[#003399]/10 p-3"><dt className="text-[10px] font-bold uppercase text-[#003399]/55">Adviser</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{paper.adviser}</dd></div></dl>
          <section className="mt-5 rounded-2xl border border-[#003399]/10 p-4"><h4 className="text-xs font-bold uppercase tracking-wider text-[#003399]">Abstract</h4><div className="mt-3 max-h-80 overflow-y-auto rounded-xl bg-[#003399]/5 p-4"><p className="whitespace-pre-wrap text-sm leading-7 text-[#003399]/75">{paper.abstract}</p></div></section>
          <section className="mt-5 rounded-2xl border border-[#003399]/10 p-4"><button onClick={() => setCitationVisible((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399]"><Clipboard size={16} /> Generate APA reference</button>{citationVisible ? <div className="mt-3"><label htmlFor="research-apa" className="text-xs font-bold text-[#003399]">APA 7th Edition reference</label><textarea id="research-apa" readOnly value={citation} className="mt-1.5 min-h-28 w-full resize-none rounded-xl border border-[#003399]/15 p-3 text-sm text-[#003399]" /><button onClick={copy} className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-[#003399]">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy to clipboard'}</button></div> : null}</section>
        </> : null}
      </div>
    </aside>
  </div>
}
