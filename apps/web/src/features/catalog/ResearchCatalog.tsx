import { BookOpenText, ChevronLeft, ChevronRight, FileText, LayoutGrid, List, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TableShell } from '../../components/ui'
import { fetchResearchCatalog } from './research-catalog-api'
import type { ResearchCatalogItem, ResearchPagination } from './research-catalog-types'
import { ResearchOverview } from './ResearchOverview'
import { ThesisCoverCard } from './ThesisCoverCard'
import './research-reference.css'
import { RESEARCH_DEPARTMENTS, RESEARCH_YEARS } from './research-filter-options'

const EMPTY_PAGINATION: ResearchPagination = { page: 1, limit: 25, total: 0, totalPages: 0 }
const filterFieldClass = 'h-10 w-full rounded-xl border border-[#0b5ea2]/15 bg-[#FFFFFF] px-3 text-sm font-semibold text-[#0b5ea2] outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10'

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
  const [department, setDepartment] = useState('')
  const [publicationYear, setPublicationYear] = useState('')
  const [author, setAuthor] = useState('')
  const [debouncedAuthor, setDebouncedAuthor] = useState('')
  const [adviser, setAdviser] = useState('')
  const [debouncedAdviser, setDebouncedAdviser] = useState('')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid')
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

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedAuthor(author.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [author])

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedAdviser(adviser.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [adviser])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const yearValue = publicationYear ? Number(publicationYear) : null
      const result = await fetchResearchCatalog({
        query: debouncedQuery,
        department: department || undefined,
        publicationYear: yearValue && Number.isFinite(yearValue) ? yearValue : null,
        author: debouncedAuthor || undefined,
        adviser: debouncedAdviser || undefined,
        page,
        signal,
      })
      if (!signal?.aborted) { setItems(result.items); setPagination(result.pagination) }
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'The repository could not be loaded.')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [debouncedAdviser, debouncedAuthor, debouncedQuery, department, page, publicationYear])

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = []
    if (department) chips.push({ key: 'department', label: department, clear: () => { setDepartment(''); setPage(1) } })
    if (publicationYear) chips.push({ key: 'year', label: `Year ${publicationYear}`, clear: () => { setPublicationYear(''); setPage(1) } })
    if (author.trim()) chips.push({ key: 'author', label: `Author: ${author.trim()}`, clear: () => { setAuthor(''); setPage(1) } })
    if (adviser.trim()) chips.push({ key: 'adviser', label: `Adviser: ${adviser.trim()}`, clear: () => { setAdviser(''); setPage(1) } })
    if (query.trim()) chips.push({ key: 'query', label: `Search: ${query.trim()}`, clear: () => { setQuery(''); setPage(1) } })
    return chips
  }, [adviser, author, department, publicationYear, query])

  const clearAllFilters = () => {
    setQuery('')
    setDepartment('')
    setPublicationYear('')
    setAuthor('')
    setAdviser('')
    setPage(1)
  }

  const emptyMessage = loading
    ? 'Loading institutional research…'
    : 'No research records found'

  const openPaper = (paper: ResearchCatalogItem) => {
    setSelectedResearchId(paper.researchInventoryId ?? paper.researchRecordId)
  }

  return <div className="research-reference">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-sm text-[#0b5ea2]/70">Browse bound theses for in-library viewing, shelf location, and APA citation. These records cannot be taken home.</p>
      <button type="button" onClick={() => setGuideVisible((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-[#FFFFFF]">
        <BookOpenText size={17} /> APA reference guide
      </button>
    </div>
    {guideVisible ? <div className="mb-4 rounded-xl bg-[#FFF200] p-4 text-sm text-[#0b5ea2]"><strong>APA 7:</strong> Author. (Year). <em>Title</em> [Unpublished undergraduate thesis, Department]. STI College Ormoc.</div> : null}
    {error ? <div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]">{error}</div> : null}

    <section className="mb-4 rounded-2xl border border-[#0b5ea2]/15 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="relative block xl:col-span-2">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#0b5ea2]/55">Search</span>
          <Search className="absolute bottom-3 left-3 text-[#0b5ea2]/50" size={16} />
          <input aria-label="Search research" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, keywords, research code…" className={`${filterFieldClass} pl-9`} />
        </label>
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#0b5ea2]/55">Department</span>
          <select aria-label="Filter by department" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1) }} className={filterFieldClass}>
            <option value="">All departments</option>
            {[...new Set([...RESEARCH_DEPARTMENTS,...items.map(item=>item.department)])].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#0b5ea2]/55">Year</span>
          <select aria-label="Filter by year" value={publicationYear} onChange={(event) => { setPublicationYear(event.target.value); setPage(1) }} className={filterFieldClass}>
            <option value="">All years</option>
            {RESEARCH_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#0b5ea2]/55">Author</span>
          <input aria-label="Filter by author" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Author name" className={filterFieldClass} />
        </label>
        <label className="md:col-span-2 xl:col-span-2">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#0b5ea2]/55">Adviser</span>
          <input aria-label="Filter by adviser" value={adviser} onChange={(event) => setAdviser(event.target.value)} placeholder="Adviser name" className={filterFieldClass} />
        </label>
        <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
          <div className="inline-flex rounded-xl border border-[#0b5ea2]/15 bg-[#0b5ea2]/5 p-1">
            <button type="button" aria-label="Cover grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`rounded-lg p-2 ${viewMode === 'grid' ? 'bg-[#0b5ea2] text-white' : 'text-[#0b5ea2]'}`}><LayoutGrid size={16} /></button>
            <button type="button" aria-label="Table view" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')} className={`rounded-lg p-2 ${viewMode === 'table' ? 'bg-[#0b5ea2] text-white' : 'text-[#0b5ea2]'}`}><List size={16} /></button>
          </div>
          {activeFilters.length ? (
            <button type="button" onClick={clearAllFilters} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#0b5ea2]/20 px-3 text-xs font-bold text-[#0b5ea2]">
              <X size={14} /> Clear filters
            </button>
          ) : null}
        </div>
      </div>
      {activeFilters.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map((chip) => (
            <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex items-center gap-1.5 rounded-full bg-[#0b5ea2]/10 px-3 py-1 text-[11px] font-bold text-[#0b5ea2]">
              {chip.label} <X size={12} />
            </button>
          ))}
        </div>
      ) : null}
    </section>

    {viewMode === 'grid' ? (
      <section className="rounded-2xl border border-[#0b5ea2]/15 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-[#0b5ea2]">Institutional research</h2>
          <p className="text-xs font-bold text-[#0b5ea2]/55">{pagination.total} record{pagination.total === 1 ? '' : 's'}</p>
        </div>
        {loading ? (
          <p className="py-16 text-center font-semibold text-[#0b5ea2]">{emptyMessage}</p>
        ) : items.length ? (
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((paper) => (
              <article key={paper.titleId} className="flex h-full flex-col rounded-2xl border border-[#0b5ea2]/10 bg-[#f8fafc] p-3 dark:border-white/10 dark:bg-[#22232e]">
                <ThesisCoverCard
                  title={paper.title}
                  authors={paper.authors}
                  department={paper.department}
                  publicationYear={paper.publicationYear}
                  className="mx-auto w-40 shrink-0"
                />
                <div className="mt-3 flex min-h-0 flex-1 flex-col">
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 text-[#0b5ea2]">{paper.title}</p>
                  <p className="mt-1 line-clamp-1 min-h-4 text-xs text-[#0b5ea2]/60">{paper.department}</p>
                  <div className="mt-2 flex min-h-7 flex-wrap items-center gap-2">
                    <AccessBadge status={paper.accessStatus} />
                    <span className="font-mono text-[11px] text-[#0b5ea2]/65">{paper.shelfLocation}</span>
                  </div>
                  <button type="button" onClick={() => openPaper(paper)} className="mt-auto h-9 w-full rounded-xl bg-[#FFF200] text-xs font-bold text-[#0b5ea2]">
                    View details
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <FileText className="mx-auto text-[#0b5ea2]" />
            <p className="mt-3 font-bold text-[#0b5ea2]">{emptyMessage}</p>
          </div>
        )}
      </section>
    ) : (
      <TableShell
        title="Institutional research"
        controls={<p className="text-xs font-bold text-[#0b5ea2]/55">{pagination.total} record{pagination.total === 1 ? '' : 's'}</p>}

      >
        <table className="w-full min-w-[960px] table-fixed text-left text-sm">
          <thead className="bg-[#0b5ea2] text-[#FFFFFF]">
            <tr>
              <th className="w-[34%] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">Research title</th>
              <th className="w-[22%] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">Department</th>
              <th className="w-[8%] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">Year</th>
              <th className="w-[12%] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">Shelf</th>
              <th className="w-[12%] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">Access</th>
              <th className="w-[12%] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0b5ea2]/10">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center font-semibold text-[#0b5ea2]">Loading institutional research…</td></tr>
            ) : items.length ? items.map((paper) => (
              <tr key={paper.titleId} className="align-middle hover:bg-[#0b5ea2]/5">
                <td className="px-4 py-3">
                  <p className="truncate font-bold text-[#0b5ea2]" title={paper.title}>{paper.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[#0b5ea2]/60" title={paper.authors}>{paper.authors}</p>
                </td>
                <td className="px-4 py-3 truncate text-[#0b5ea2]/75" title={paper.department}>{paper.department}</td>
                <td className="px-4 py-3 text-[#0b5ea2]/75">{paper.publicationYear ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#0b5ea2]/75">{paper.shelfLocation}</td>
                <td className="px-4 py-3"><AccessBadge status={paper.accessStatus} /></td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => openPaper(paper)} className="inline-flex h-8 items-center rounded-lg bg-[#FFF200] px-3 text-xs font-bold text-[#0b5ea2]">
                    View
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-4 py-16 text-center"><FileText className="mx-auto text-[#0b5ea2]" /><p className="mt-3 font-bold text-[#0b5ea2]">No research records found</p></td></tr>
            )}
          </tbody>
        </table>
      </TableShell>
    )}

    {pagination.totalPages > 1 ? (
      <nav aria-label="Research pages" className="mt-5 flex items-center justify-center gap-3">
        <button type="button" aria-label="Previous research page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-xl border border-[#0b5ea2]/15 p-2 text-[#0b5ea2] disabled:opacity-40"><ChevronLeft size={18} /></button>
        <span className="text-xs font-bold text-[#0b5ea2]">Page {page} of {pagination.totalPages}</span>
        <button type="button" aria-label="Next research page" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-[#0b5ea2]/15 p-2 text-[#0b5ea2] disabled:opacity-40"><ChevronRight size={18} /></button>
      </nav>
    ) : null}
    {selectedResearchId !== null ? <ResearchOverview researchId={selectedResearchId} onClose={() => setSelectedResearchId(null)} /> : null}
  </div>
}
