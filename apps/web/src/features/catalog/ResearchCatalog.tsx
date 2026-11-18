import { ResponsiveTable } from '../../components/ResponsiveTable'
import { BookOpenText, ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { fetchResearchCatalog } from './research-catalog-api'
import type { ResearchCatalogItem, ResearchPagination } from './research-catalog-types'
import { ResearchOverview } from './ResearchOverview'
import { ResearchCover } from './ResearchCover'
import { CatalogCover } from './CatalogCover'

const EMPTY_PAGINATION: ResearchPagination = { page: 1, limit: 25, total: 0, totalPages: 0 }

function AccessBadge({ status }: { status: ResearchCatalogItem['accessStatus'] }) {
  const classes = status === 'Reserved'
    ? 'bg-[#FFF200]/55 text-[#0b5ea2]'
    : status === 'Available'
      ? 'bg-[#0b5ea2]/10 text-[#0b5ea2]'
      : 'border border-[#0b5ea2]/15 bg-[#FFFFFF] text-[#0b5ea2]/55'
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

  function openResearch(paper: ResearchCatalogItem) {
    setSelectedResearchId(paper.researchInventoryId ?? paper.researchRecordId)
  }

  return <>
    <PageHeader eyebrow="RESEARCH REPOSITORY" title="Research and thesis catalog" action={<button onClick={() => setGuideVisible((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-[#FFFFFF]"><BookOpenText size={17} /> APA reference guide</button>} />
    {guideVisible ? <div className="mb-4 rounded-xl bg-[#FFF200] p-4 text-sm text-[#0b5ea2]"><strong>APA 7:</strong> Author. (Year). <em>Title</em> [Unpublished undergraduate thesis, Department]. STI College Ormoc.</div> : null}
    {error ? <div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]">{error}</div> : null}

    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#0b5ea2]/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-base font-bold text-[#0b5ea2]">Institutional research</h2><label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0b5ea2]/50" size={16} /><input aria-label="Search research" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search research..." className="h-10 w-full rounded-xl border border-[#0b5ea2]/15 bg-[#FFFFFF] pl-9 pr-3 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10" /></label></div>
      {loading ? <p role="status" className="px-5 py-12 text-center font-semibold">Loading institutional research…</p>
        : !items.length ? <div className="px-5 py-16 text-center"><FileText aria-hidden="true" className="mx-auto" /><p className="mt-3 font-bold">No research records found</p></div>
        : <>
          <section aria-label="Research cards" className="catalog-cover-grid grid grid-cols-2 gap-3 p-3 sm:hidden">
            {items.map(paper => <article key={paper.titleId} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#0b5ea2]/10 bg-white shadow-sm dark:border-white/15 dark:bg-[#001a4d]">
              <CatalogCover title={paper.title} author={paper.authors} research={paper} flush className="aspect-[3/4] w-full" />
              <div className="flex flex-1 flex-col p-3">
                <div><AccessBadge status={paper.accessStatus} /></div>
                <h3 className="mt-2 break-words text-sm font-bold leading-5">{paper.title}</h3>
                <p className="mt-1 text-xs text-[#0b5ea2]/75 dark:text-white/75">{paper.authors}</p>
                <p className="mt-2 text-xs text-[#0b5ea2]/75 dark:text-white/75">{[paper.department, paper.publicationYear].filter(Boolean).join(' · ')}</p>
                {paper.shelfLocation && <p className="mt-1 text-xs text-[#0b5ea2]/75 dark:text-white/75">Shelf: {paper.shelfLocation}</p>}
                <button type="button" onClick={() => openResearch(paper)} aria-label={`View details for ${paper.title}`} className="mt-auto min-h-11 self-start pt-2 text-left text-sm font-bold hover:underline">View details</button>
              </div>
            </article>)}
          </section>
          <div className="hidden sm:block">
            <ResponsiveTable label="Research records">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-[#0b5ea2] text-[#FFFFFF]">
                  <tr><th className="px-5 py-3 text-[11px] uppercase">Research title</th><th className="px-5 py-3 text-[11px] uppercase">Department</th><th className="px-5 py-3 text-[11px] uppercase">Year</th><th className="px-5 py-3 text-[11px] uppercase">Shelf</th><th className="px-5 py-3 text-[11px] uppercase">Access</th><th className="px-5 py-3 text-right text-[11px] uppercase">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-[#0b5ea2]/10">
                  {items.map(paper => <tr key={paper.titleId} className="hover:bg-[#0b5ea2]/5">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-md"><ResearchCover title={paper.title} department={paper.department} /></div><div><p className="max-w-md font-bold text-[#0b5ea2]">{paper.title}</p><p className="mt-1 max-w-md text-xs text-[#0b5ea2]/60">{paper.authors}</p></div></div></td>
                    <td className="px-5 py-4 text-[#0b5ea2]/75">{paper.department}</td>
                    <td className="px-5 py-4 text-[#0b5ea2]/75">{paper.publicationYear ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#0b5ea2]/75">{paper.shelfLocation}</td>
                    <td className="px-5 py-4"><AccessBadge status={paper.accessStatus} /></td>
                    <td className="px-5 py-4 text-right"><button type="button" onClick={() => openResearch(paper)} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#0b5ea2]">View</button></td>
                  </tr>)}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        </>}
    </SectionCard>
    {pagination.totalPages > 1 ? <nav aria-label="Research pages" className="mt-5 flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-xl border border-[#0b5ea2]/15 p-2 text-[#0b5ea2] disabled:opacity-40"><ChevronLeft size={18} /></button><span className="text-xs font-bold text-[#0b5ea2]">Page {page} of {pagination.totalPages}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-[#0b5ea2]/15 p-2 text-[#0b5ea2] disabled:opacity-40"><ChevronRight size={18} /></button></nav> : null}
    {selectedResearchId !== null ? <ResearchOverview researchId={selectedResearchId} onClose={() => setSelectedResearchId(null)} /> : null}
  </>
}
