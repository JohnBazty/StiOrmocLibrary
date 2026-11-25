import { BookOpenText, ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { CatalogCover } from './CatalogCover'
import { ResearchCover } from './ResearchCover'
import { ResearchOverview } from './ResearchOverview'
import { fetchResearchCatalog } from './research-catalog-api'
import type { ResearchCatalogItem, ResearchPagination } from './research-catalog-types'

const EMPTY_PAGINATION: ResearchPagination = { page: 1, limit: 25, total: 0, totalPages: 0 }

export function ResearchCatalog() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ResearchCatalogItem[]>([])
  const [pagination, setPagination] = useState<ResearchPagination>(EMPTY_PAGINATION)
  const [selectedResearchId, setSelectedResearchId] = useState<number | null>(null)
  const [guideVisible, setGuideVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError('')
      try {
        const result = await fetchResearchCatalog({ query: debouncedQuery, page, signal })
        setItems(result.items)
        setPagination(result.pagination)
      } catch (reason) {
        if (!signal?.aborted) {
          setError(reason instanceof Error ? reason.message : 'The repository could not be loaded.')
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [debouncedQuery, page],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  function openResearch(paper: ResearchCatalogItem) {
    setSelectedResearchId(paper.researchInventoryId ?? paper.researchRecordId)
  }

  return (
    <div className="space-y-5">
      {/* Complementary Command Header — Royal Indigo Accent */}
      <header className="flex flex-col gap-4 rounded-[12px] border border-[var(--sl-border)] border-t-[3px] border-t-[#4f46e5] bg-gradient-to-r from-[#eef2ff] via-[var(--sl-bg-elevated)] to-[#fffdf0] p-5 shadow-[var(--sl-shadow-xs)] dark:from-[#1d2038] dark:via-[#1a2232] dark:to-[#24251c] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#4f46e5]/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#4f46e5] dark:bg-[#4f46e5]/25 dark:text-[#c7d2fe]">
              Research repository
            </span>
            {!loading ? (
              <span className="inline-flex items-center rounded-full bg-[#0f766e]/12 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]">
                {pagination.total} {pagination.total === 1 ? 'record' : 'records'}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem]">
            Research and thesis catalog
          </h1>
          <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
            Search undergraduate theses and capstone papers for in-library reference and APA citation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <Button
            variant={guideVisible ? 'primary' : 'secondary'}
            className={guideVisible ? 'bg-[#FFF200] text-[#132a3f] hover:bg-[#f2e500]' : undefined}
            onClick={() => setGuideVisible((value) => !value)}
          >
            <BookOpenText size={16} aria-hidden="true" />
            APA reference guide
          </Button>
        </div>
      </header>

      {guideVisible ? (
        <NoticeBanner tone="info">
          <strong>APA 7:</strong> Author. (Year). <em>Title</em> [Unpublished undergraduate thesis, Department]. STI College Ormoc.
        </NoticeBanner>
      ) : null}
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}

      <SectionCard className="overflow-hidden border-t-[3px] border-t-[#0b5ea2]">
        <div className="flex flex-col gap-3 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/35 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
              Institutional research
            </h2>
            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
              In-library reference only. Select any paper to read its abstract and generate an APA citation.
            </p>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--sl-text-muted)]"
              size={16}
              aria-hidden="true"
            />
            <input
              aria-label="Search research"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search research..."
              className="sl-input !pl-10 pr-3"
            />
          </label>
        </div>

        {loading ? (
          <p role="status" className="px-5 py-12 text-center text-sm font-medium text-[var(--sl-text-secondary)]">
            Loading institutional research…
          </p>
        ) : !items.length ? (
          <div className="px-5 py-16 text-center">
            <FileText aria-hidden="true" className="mx-auto text-[var(--sl-text-muted)]" />
            <p className="mt-3 text-sm font-semibold text-[var(--sl-text-header)]">No research records found</p>
            {query ? (
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => setQuery('')}>
                Clear search
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Mobile Card Grid */}
            <section aria-label="Research cards" className="catalog-cover-grid grid grid-cols-2 gap-3 p-3.5 sm:hidden">
              {items.map((paper) => (
                <article
                  key={paper.titleId}
                  className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-[var(--sl-shadow-xs)]"
                >
                  <div className="flex justify-center border-b border-[var(--sl-border)]/70 bg-gradient-to-b from-[#eef2ff] to-[#f8fafc] p-3 dark:from-[#1d2038] dark:to-[#1a2232]">
                    <CatalogCover
                      title={paper.title}
                      author={paper.authors}
                      research={paper}
                      className="h-36 w-24 rounded-[6px] shadow-[var(--sl-shadow-s)]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div>
                      <StatusBadge status={paper.accessStatus} />
                    </div>
                    <h3 className="mt-2 line-clamp-2 break-words text-sm font-semibold leading-5 text-[var(--sl-text-header)]">
                      {paper.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-[var(--sl-text-secondary)]">{paper.authors}</p>
                    <p className="mt-1.5 text-xs font-medium text-[#0f766e] dark:text-[#5eead4]">
                      {[paper.department, paper.publicationYear].filter(Boolean).join(' · ')}
                    </p>
                    {paper.shelfLocation ? (
                      <p className="mt-1 text-xs text-[var(--sl-text-muted)]">Shelf: {paper.shelfLocation}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openResearch(paper)}
                      aria-label={`View details for ${paper.title}`}
                      className="mt-auto min-h-10 w-full rounded-[6px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/60 pt-0 text-center text-xs font-semibold text-[#0b5ea2] hover:bg-[#0b5ea2]/10 dark:text-[#93c5fd]"
                    >
                      View details
                    </button>
                  </div>
                </article>
              ))}
            </section>

            {/* Desktop Ledger Table */}
            <div className="hidden sm:block">
              <ResponsiveTable label="Research records">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/70 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--sl-text-muted)]">
                    <tr>
                      <th scope="col" className="px-5 py-3">Research title</th>
                      <th scope="col" className="px-5 py-3">Department</th>
                      <th scope="col" className="px-5 py-3">Year</th>
                      <th scope="col" className="px-5 py-3">Shelf</th>
                      <th scope="col" className="px-5 py-3">Access</th>
                      <th scope="col" className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sl-border)]">
                    {items.map((paper) => (
                      <tr
                        key={paper.titleId}
                        className="transition-colors hover:bg-[#f0f7ff]/60 dark:hover:bg-white/[0.03]"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3.5">
                            <button
                              type="button"
                              onClick={() => openResearch(paper)}
                              className="h-16 w-12 shrink-0 overflow-hidden rounded-[6px] shadow-[var(--sl-shadow-xs)] transition-transform hover:scale-105"
                              aria-label={`Open ${paper.title}`}
                            >
                              <ResearchCover title={paper.title} department={paper.department} />
                            </button>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openResearch(paper)}
                                className="max-w-md text-left font-semibold text-[var(--sl-text-header)] hover:text-[#0b5ea2] hover:underline dark:hover:text-[#93c5fd]"
                              >
                                {paper.title}
                              </button>
                              <p className="mt-0.5 max-w-md truncate text-xs text-[var(--sl-text-secondary)]">
                                {paper.authors}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex rounded-full bg-[#0f766e]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]">
                            {paper.department}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium tabular-nums text-[var(--sl-text-header)]">
                          {paper.publicationYear ?? '—'}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-[var(--sl-text-secondary)]">
                          {paper.shelfLocation}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={paper.accessStatus} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button variant="secondary" size="sm" onClick={() => openResearch(paper)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </div>
          </>
        )}
      </SectionCard>

      {pagination.totalPages > 1 ? (
        <nav aria-label="Research pages" className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-xs font-semibold tabular-nums text-[var(--sl-text-secondary)]">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((value) => value + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </Button>
        </nav>
      ) : null}

      {selectedResearchId !== null ? (
        <ResearchOverview researchId={selectedResearchId} onClose={() => setSelectedResearchId(null)} />
      ) : null}
    </div>
  )
}
