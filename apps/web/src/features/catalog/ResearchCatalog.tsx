import { BookOpenText, ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { fetchResearchCatalog } from './research-catalog-api'
import type { ResearchCatalogItem, ResearchPagination } from './research-catalog-types'
import { ResearchOverview } from './ResearchOverview'

const EMPTY_PAGINATION: ResearchPagination = { page: 1, limit: 25, total: 0, totalPages: 0 }

function AccessBadge({ status }: { status: ResearchCatalogItem['accessStatus'] }) {
  const classes = status === 'Reserved'
    ? 'bg-[#FFF200]/55 text-[#003399]'
    : status === 'Available'
      ? 'bg-[#003399]/10 text-[#003399]'
      : 'border border-[#003399]/15 bg-[#FFFFFF] text-[#003399]/55'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${classes}`}>{status}</span>
}

export function ResearchCatalog() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ResearchCatalogItem[]>([])
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [selectedResearchId, setSelectedResearchId] = useState<number | null>(null)
  const [guideVisible, setGuideVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const result = await fetchResearchCatalog({ query: debouncedQuery, page, signal })
      setItems(result.items); setPagination(result.pagination)
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'The repository could not be loaded.')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [debouncedQuery, page])

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])

  return <>
    <PageHeader eyebrow="RESEARCH REPOSITORY" title="Research and thesis catalog" action={<button onClick={() => setGuideVisible((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF]"><BookOpenText size={17} /> APA reference guide</button>} />
    {guideVisible ? <div className="mb-4 rounded-xl bg-[#FFF200] p-4 text-sm text-[#003399]"><strong>APA 7:</strong> Author. (Year). <em>Title</em> [Unpublished undergraduate thesis, Department]. STI College Ormoc.</div> : null}
    {error ? <div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}

    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#003399]/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-base font-bold text-[#003399]">Institutional research</h2><label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/50" size={16} /><input aria-label="Search research" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search research..." className="h-10 w-full rounded-xl border border-[#003399]/15 bg-[#FFFFFF] pl-9 pr-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10" /></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#003399] text-[#FFFFFF]"><tr><th className="px-5 py-3 text-[11px] uppercase">Research title</th><th className="px-5 py-3 text-[11px] uppercase">Department</th><th className="px-5 py-3 text-[11px] uppercase">Year</th><th className="px-5 py-3 text-[11px] uppercase">Shelf</th><th className="px-5 py-3 text-[11px] uppercase">Access</th><th className="px-5 py-3 text-right text-[11px] uppercase">Actions</th></tr></thead><tbody className="divide-y divide-[#003399]/10">{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center font-semibold text-[#003399]">Loading institutional research…</td></tr> : items.length ? items.map((paper) => <tr key={paper.titleId} className="hover:bg-[#003399]/5"><td className="px-5 py-4"><p className="max-w-md font-bold text-[#003399]">{paper.title}</p><p className="mt-1 max-w-md text-xs text-[#003399]/60">{paper.authors}</p></td><td className="px-5 py-4 text-[#003399]/75">{paper.department}</td><td className="px-5 py-4 text-[#003399]/75">{paper.publicationYear ?? '—'}</td><td className="px-5 py-4 font-mono text-xs text-[#003399]/75">{paper.shelfLocation}</td><td className="px-5 py-4"><AccessBadge status={paper.accessStatus} /></td><td className="px-5 py-4 text-right"><button onClick={() => setSelectedResearchId(paper.researchInventoryId ?? paper.researchRecordId)} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399]">View</button></td></tr>) : <tr><td colSpan={6} className="px-5 py-16 text-center"><FileText className="mx-auto text-[#003399]" /><p className="mt-3 font-bold text-[#003399]">No research records found</p></td></tr>}</tbody></table></div>
    </SectionCard>
    {pagination.totalPages > 1 ? <nav aria-label="Research pages" className="mt-5 flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399] disabled:opacity-40"><ChevronLeft size={18} /></button><span className="text-xs font-bold text-[#003399]">Page {page} of {pagination.totalPages}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399] disabled:opacity-40"><ChevronRight size={18} /></button></nav> : null}
    {selectedResearchId !== null ? <ResearchOverview researchId={selectedResearchId} onClose={() => setSelectedResearchId(null)} /> : null}
  </>
}
