import {
  Archive,
  ArrowRightLeft,
  BookMarked,
  BookOpen,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExportMenu } from '../../components/ExportMenu'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { RowActions } from '../../components/RowActions'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'
import { AddResearchModal } from './AddResearchModal'
import { AssetCodeModal } from './AssetCodeModal'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { BookOverview } from './BookOverview'
import { BookQuotationModal } from './BookQuotationModal'
import { ApiError, catalogApi } from './catalog-api'
import { CatalogTitleDetails } from './CatalogTitleDetails'
import { ChangeTitleCategoryModal } from './ChangeTitleCategoryModal'
import { generateDdcAndCutter } from './ddc-cutter'
import { enhancedCatalog } from './enhanced-catalog-api'
import type { CatalogFilters, CatalogItem, Category } from './types'
import { useBarcodeScanner } from './useBarcodeScanner'
import { RefreshButton } from '../../components/RefreshButton'

const fieldClass =
  'h-[38px] w-full rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 text-sm font-medium text-[var(--sl-text)] shadow-[var(--sl-shadow-xs)] outline-none transition focus:border-[#0b5ea2] focus:ring-3 focus:ring-[#0b5ea2]/15 dark:border-white/20 dark:bg-[#1e202b] dark:text-[#f7f9ff]'

const labelClass = 'mb-1.5 block truncate text-[13px] font-semibold leading-[17px] text-[var(--sl-text-secondary)]'

const emptyFilters: CatalogFilters = {
  page: 1,
  limit: 25,
  q: '',
  scope: 'all',
  categoryId: '',
  author: '',
  publicationYear: '',
  availability: '',
}

export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  const str = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  if (/[",]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function CatalogManagementPage({ maintenance = false }: { maintenance?: boolean } = {}) {
  const requestSequence = useRef(0)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 })
  const [loadError, setLoadError] = useState('')
  const [selectedTitle, setSelectedTitle] = useState<CatalogItem | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [managedLocations, setManagedLocations] = useState<string[]>([])
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState<'book' | 'thesis' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [scannerActive] = useState(true)
  const [, setSavingKind] = useState<'book' | 'thesis' | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [, setFieldErrors] = useState<Record<string, string>>({})
  const [overviewTitleId, setOverviewTitleId] = useState<number | null>(null)
  const [assetCopyId, setAssetCopyId] = useState<number | null>(null)
  const [researchAssetId, setResearchAssetId] = useState<number | null>(null)
  const [categoryItem, setCategoryItem] = useState<CatalogItem | null>(null)
  const [changingCategory, setChangingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [archiveItem, setArchiveItem] = useState<CatalogItem | null>(null)
  const [quotationItem, setQuotationItem] = useState<CatalogItem | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)

  const loadCatalog = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const sequence = ++requestSequence.current
      const current = () => isCurrent() && sequence === requestSequence.current

      setLoading(true)
      setLoadError('')
      try {
        const [catalog, categoryRows, managed] = await Promise.all([
          catalogApi.search(filters),
          catalogApi.categories(),
          enhancedCatalog.options(true),
        ])
        if (!current()) return
        const limit = catalog.pagination.limit ?? filters.limit ?? 25
        setItems(catalog.items)
        setPagination({
          page: catalog.pagination.page ?? filters.page ?? 1,
          limit,
          total: catalog.pagination.total,
          pages: catalog.pagination.pages ?? Math.ceil(catalog.pagination.total / limit),
        })
        setCategories(categoryRows)
        setManagedLocations(
          managed.locations.filter((location) => location.status === 'Active').map((location) => location.name),
        )
      } catch (error) {
        if (current()) setLoadError(error instanceof Error ? error.message : 'Catalog data could not be loaded.')
      } finally {
        if (current()) setLoading(false)
      }
    },
    [filters],
  )

  const refresh = useCallback(() => loadCatalog(), [loadCatalog])

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => void loadCatalog(() => current), 220)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [loadCatalog])

  const changeFilters = (next: CatalogFilters) => {
    requestSequence.current++
    setFilters({ ...next, page: 1 })
  }

  const scanned = useCallback(async (value: string) => {
    try {
      const result = await catalogApi.parseRegistry(value)
      setNotice({
        tone: 'success',
        text: result.match
          ? `${result.kind} ${result.normalizedValue} matched an existing catalog record.`
          : `${result.kind} ${result.normalizedValue} is valid and ready for registration.`,
      })
      setFilters((current) => ({ ...current, page: 1, q: result.normalizedValue }))
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The scan could not be parsed.' })
    }
  }, [])

  useBarcodeScanner(scanned, scannerActive)

  async function submit(event: FormEvent<HTMLFormElement>, kind: 'book' | 'thesis') {
    event.preventDefault()
    const formElement = event.currentTarget
    const data = Object.fromEntries(new FormData(formElement).entries())
    const body =
      kind === 'book'
        ? {
            title: data.title,
            author: data.author,
            isbn: data.isbn,
            category_id: data.categoryId,
            shelf_location: data.shelfLocation,
            number_of_copies: data.numberOfCopies,
            publication_year: data.publicationYear || null,
            publisher: data.publisher,
            call_number: data.callNumber,
          }
        : {
            title: data.title,
            authors: [data.author],
            adviser: data.adviser,
            year: data.year,
            abstract: data.abstract,
            categoryId: data.categoryId || null,
            researchCode: data.researchCode,
            departmentOrProgram: data.departmentOrProgram,
            keywords: data.keywords,
            copy: {
              barcode: data.barcode,
              accessionNumber: data.accessionNumber,
              shelfLocation: data.shelfLocation,
              conditionStatus: data.conditionStatus,
            },
          }
    setSavingKind(kind)
    setFieldErrors({})
    try {
      if (kind === 'book') await catalogApi.createBulkBook(body)
      else await catalogApi.createThesis(body)
      formElement.reset()
      setForm(null)
      await refresh()
      setNotice({
        tone: 'success',
        text: `${kind === 'book' ? 'Book copies and printable labels' : 'Research/thesis catalog and inventory record'} created successfully.`,
      })
    } catch (error) {
      const apiError = error as ApiError
      const errors = apiError.details?.errors ?? {}
      setFieldErrors(errors)
      setNotice({ tone: 'error', text: apiError.message })
    } finally {
      setSavingKind(null)
    }
  }
  void submit

  async function downloadInventory(format: 'csv' | 'pdf') {
    setExportingPdf(true)
    try {
      await catalogApi.downloadInventory(format, filters)
      setNotice({ tone: 'success', text: `${format.toUpperCase()} inventory report downloaded successfully.` })
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The inventory report could not be generated.',
      })
    } finally {
      setExportingPdf(false)
    }
  }

  async function exportCatalogHoldingsFile() {
    let exportItems = items
    if (pagination.total > items.length) {
      try {
        const collected: CatalogItem[] = []
        const pageLimit = 100
        const totalPages = Math.min(50, Math.ceil(pagination.total / pageLimit))
        for (let p = 1; p <= totalPages; p += 1) {
          const pageRes = await catalogApi.search({ ...filters, page: p, limit: pageLimit })
          collected.push(...pageRes.items)
          if (collected.length >= pageRes.pagination.total || pageRes.items.length === 0) break
        }
        if (collected.length > 0) exportItems = collected
      } catch {
        exportItems = items
      }
    }
    const headers = [
      'Accesion #',
      'DDC + Cutter Table',
      'Dewey number',
      'BOOK TITLE',
      'AUTHOR',
      'ISBN',
      'COPIES',
      'AVAILABLE COPIES',
      'CATEGORY',
      'BOOK LOCATION',
      'YEAR PUBLISHED',
      'PUBLISHER',
      'EDITION',
      'VOLUMES',
      'PAGES',
      'REMARKS',
      'AVAILABILITY',
    ]
    const csvRows = [headers.map(escapeCsvCell).join(',')]
    for (const item of exportItems) {
      const rawCall = (item.callNumber || item.classification || '').trim()
      const generatedDdc =
        item.recordType === 'Book'
          ? generateDdcAndCutter({
              title: item.title,
              author: item.authors.join(', '),
              categoryName: item.categoryName,
              deweyCode: item.deweyCode || (/^\d{3}(?:\.\d+)?$/.test(rawCall) ? rawCall : null),
            })
          : null
      const hasCutterAlready = /\b\d{3}(?:\.\d+)?\s+[A-Za-z]\d+/.test(rawCall)
      const ddcCutterDisplay = hasCutterAlready
        ? rawCall
        : generatedDdc
          ? generatedDdc.callNumber
          : rawCall || ''
      const deweyCode = item.deweyCode || generatedDdc?.ddcCode || ''
      const acc =
        item.accessionNumber ||
        item.research?.researchCode ||
        (item.recordType === 'Book' ? `STI-ACC-2026-${String(item.titleId).padStart(6, '0')}` : '')
      csvRows.push(
        [
          acc,
          ddcCutterDisplay,
          deweyCode,
          item.title,
          item.authors.join(', '),
          item.isbn ?? item.research?.researchCode ?? '',
          item.totalCopies,
          item.availableCopies,
          item.categoryName ?? '',
          item.shelfLocation ?? '',
          item.publicationYear ?? '',
          item.publisher ?? '',
          item.edition ?? '1st edition',
          item.volumes ?? 'Vol. 1',
          item.pages ?? '',
          item.remarks ?? '',
          item.availability,
        ]
          .map(escapeCsvCell)
          .join(','),
      )
    }
    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sti-library-catalog-holdings-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice({
      tone: 'success',
      text: `Exported ${exportItems.length} catalog holdings in STI DDC & Cutter spreadsheet format.`,
    })
  }

  async function changeCategory(targetCategoryId: number) {
    if (!categoryItem) return
    setChangingCategory(true)
    setCategoryError(null)
    try {
      const result = await catalogApi.changeTitleCategory(
        categoryItem.titleId,
        targetCategoryId,
        categoryItem.rowVersion,
      )
      setCategoryItem(null)
      await refresh()
      const count = result.bookCopies + result.researchCopies
      setNotice({
        tone: 'success',
        text: `${categoryItem.title} moved to ${result.categoryName} and ${result.shelfLocation}. ${count} active ${count === 1 ? 'copy was' : 'copies were'} updated.`,
      })
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'The category could not be changed.')
    } finally {
      setChangingCategory(false)
    }
  }

  async function archiveBook() {
    if (!archiveItem || !archiveReason.trim()) return
    setArchiving(true)
    try {
      await catalogApi.archiveBook(archiveItem.titleId, archiveReason.trim())
      const title = archiveItem.title
      setArchiveItem(null)
      setArchiveReason('')
      await refresh()
      setNotice({ tone: 'success', text: `${title} moved to Book archive.` })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The book could not be archived.' })
    } finally {
      setArchiving(false)
    }
  }

  const totals = useMemo(
    () => ({
      books: items.filter((item) => item.recordType === 'Book').length,
      research: items.filter((item) => item.recordType === 'Research/Thesis').length,
      copies: items.reduce((sum, item) => sum + Number(item.totalCopies ?? 0), 0),
    }),
    [items],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog administration"
        title="Catalog"
        description="Search holdings by Accession #, DDC + Cutter call number, ISBN, title, or author, export catalog files, and manage physical copies."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton onRefresh={() => refresh()} variant="secondary" disabled={loading} />
            <Button variant="secondary" type="button" onClick={exportCatalogHoldingsFile} disabled={loading}>
              <Download size={15} /> Export catalog file
            </Button>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#0b5ea2]/25 bg-white px-4 text-sm font-bold text-[#0b5ea2] shadow-2xs transition hover:bg-[#0b5ea2]/5 dark:border-sky-400/30 dark:bg-slate-900 dark:text-sky-300"
              href="/librarian/catalog?tool=imports"
            >
              <FileSpreadsheet size={16} /> Import books
            </a>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setFieldErrors({})
                setForm('thesis')
              }}
            >
              <FileText size={16} /> Add research
            </Button>
            <Button
              type="button"
              onClick={() => {
                setFieldErrors({})
                setForm('book')
              }}
            >
              <Plus size={16} /> Add book
            </Button>
          </div>
        }
      />

      {notice ? (
        <div
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={`flex items-start justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${
            notice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
          }`}
        >
          <span>{notice.text}</span>
          <button aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Matching catalog titles"
          value={pagination.total}
          note="Total active records matching current view"
          icon={BookOpen}
          tone="blue"
        />
        <StatCard
          label="Books on current view"
          value={totals.books}
          note="Classified with Accession # & DDC + Cutter"
          icon={BookMarked}
          tone="green"
        />
        <StatCard
          label="Research & theses"
          value={totals.research}
          note="In-library academic manuscripts"
          icon={FileText}
          tone="amber"
        />
      </div>

      {loadError && <NoticeBanner tone="error">{loadError} Use Refresh to try again.</NoticeBanner>}

      <SectionCard className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2">
            <span className={labelClass}>Search catalog</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sl-text-muted)]" size={16} />
              <input
                aria-label="Search catalog"
                value={filters.q}
                onChange={(e) => changeFilters({ ...filters, q: e.target.value })}
                placeholder="Search by Accession #, DDC + Cutter, ISBN, title, or author…"
                className={`${fieldClass} pl-9`}
              />
            </span>
          </label>
          <label>
            <span className={labelClass}>Resource type</span>
            <select
              aria-label="Resource type"
              value={filters.scope}
              onChange={(e) => changeFilters({ ...filters, scope: e.target.value as CatalogFilters['scope'] })}
              className={fieldClass}
            >
              <option value="all">Books + research</option>
              <option value="books">Books only</option>
              <option value="research">Research only</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Category</span>
            <select
              aria-label="Category"
              value={filters.categoryId}
              onChange={(e) => changeFilters({ ...filters, categoryId: e.target.value })}
              className={fieldClass}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.categoryName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Author</span>
            <input
              aria-label="Author"
              value={filters.author}
              onChange={(e) => changeFilters({ ...filters, author: e.target.value })}
              placeholder="Filter by author name"
              className={fieldClass}
            />
          </label>
          <label>
            <span className={labelClass}>Publication year</span>
            <input
              aria-label="Publication year"
              value={filters.publicationYear}
              onChange={(e) => changeFilters({ ...filters, publicationYear: e.target.value })}
              placeholder="e.g. 2024"
              inputMode="numeric"
              className={fieldClass}
            />
          </label>
          <label>
            <span className={labelClass}>Availability</span>
            <select
              aria-label="Availability"
              value={filters.availability}
              onChange={(e) => changeFilters({ ...filters, availability: e.target.value })}
              className={fieldClass}
            >
              <option value="">Any availability</option>
              <option>Available</option>
              <option>Borrowed</option>
              <option>Reserved</option>
              <option>Unavailable</option>
              <option>Available for Viewing</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Dewey assignment</span>
            <select
              aria-label="Dewey assignment"
              className={fieldClass}
              value={filters.deweyStatus ?? ''}
              onChange={(event) =>
                changeFilters({ ...filters, deweyStatus: event.target.value as CatalogFilters['deweyStatus'] })
              }
            >
              <option value="">Any Dewey status</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Not assigned</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sl-border)] pt-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {!maintenance && (
              <ExportMenu
                disabled={exportingPdf || loading}
                exports={[
                  { label: 'Catalog Excel/CSV (DDC & Cutter)', onSelect: exportCatalogHoldingsFile },
                  { label: 'CSV', onSelect: () => void downloadInventory('csv') },
                  { label: 'PDF', onSelect: () => void downloadInventory('pdf') },
                ]}
              />
            )}
            <Button variant="secondary" type="button" onClick={() => setFilters(emptyFilters)}>
              Clear filters
            </Button>
          </div>
          <span className="text-xs font-medium text-[var(--sl-text-muted)]">
            Column 1: Accession # · Column 2: DDC + Cutter Table
          </span>
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/40">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Unified catalog results
              </h2>
              <p role="status" className="rounded-full bg-[#0b5ea2]/10 px-2.5 py-0.5 text-xs font-bold text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300">
                {loading ? 'Loading catalog…' : loadError ? 'Catalog could not be loaded.' : `${pagination.total} matching titles`}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              STI Holdings Register format: Accession #, DDC + Cutter Table, bibliographic details, copies, shelf, and remarks.
            </p>
          </div>
          <Button variant="secondary" type="button" onClick={exportCatalogHoldingsFile} disabled={loading}>
            <Download size={15} /> Export holdings CSV
          </Button>
        </div>

        <ResponsiveTable>
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100/90 text-xs font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-3">Accession #</th>
                <th className="px-3 py-3">DDC + Cutter Table</th>
                <th className="px-3 py-3">Book Title &amp; Author</th>
                <th className="px-3 py-3">Edition &amp; Pages</th>
                <th className="px-3 py-3">Publisher &amp; Year</th>
                <th className="px-3 py-3">Copies &amp; Shelf</th>
                <th className="px-3 py-3">ISBN &amp; Remarks</th>
                <th className="px-3 py-3">Availability</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-600 dark:text-slate-300">
                    Loading catalog…
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={9} className="p-5 text-center text-red-700 dark:text-red-300">
                    Unable to show results. Refresh to retry.
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => {
                  const rawCall = (item.callNumber || item.classification || '').trim()
                  const generatedDdc =
                    item.recordType === 'Book'
                      ? generateDdcAndCutter({
                          title: item.title,
                          author: item.authors.join(', '),
                          categoryName: item.categoryName,
                          deweyCode: item.deweyCode || (/^\d{3}(?:\.\d+)?$/.test(rawCall) ? rawCall : null),
                        })
                      : null
                  const hasCutterAlready = /\b\d{3}(?:\.\d+)?\s+[A-Za-z]\d+/.test(rawCall)
                  const ddcCutterDisplay = hasCutterAlready
                    ? rawCall
                    : generatedDdc
                      ? generatedDdc.callNumber
                      : rawCall || '—'
                  const firstAcc =
                    item.accessionNumber ||
                    item.research?.researchCode ||
                    (item.recordType === 'Book' ? `STI-ACC-2026-${String(item.titleId).padStart(6, '0')}` : '—')
                  const hasAccRange = Boolean(
                    item.accessionNumber && item.lastAccessionNumber && item.lastAccessionNumber !== item.accessionNumber,
                  )
                  return (
                    <tr
                      key={item.titleId}
                      className="border-b border-slate-200/70 align-top transition-colors hover:bg-slate-50/80 dark:border-slate-700/50 dark:hover:bg-slate-800/40"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                        <span className="inline-block rounded-md border border-[#0b5ea2]/20 bg-[#0b5ea2]/5 px-2 py-1 font-bold text-[#0b5ea2] dark:border-sky-400/30 dark:bg-sky-950/40 dark:text-sky-200">
                          {firstAcc}
                        </span>
                        {hasAccRange ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            to {item.lastAccessionNumber}
                          </p>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        <span className="inline-block rounded-md border border-amber-300/80 bg-[#FFF200]/35 px-2.5 py-1 font-mono text-xs font-extrabold text-[#132a3f] dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200">
                          {ddcCutterDisplay}
                        </span>
                        {generatedDdc ? (
                          <p
                            className="mt-1 max-w-[150px] truncate text-[11px] font-medium text-slate-500 dark:text-slate-400"
                            title={`DDC ${item.deweyCode || generatedDdc.ddcCode} · ${generatedDdc.subject}`}
                          >
                            DDC {item.deweyCode || generatedDdc.ddcCode} · {generatedDdc.subject}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{item.recordType}</p>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          {item.recordType === 'Book' ? (
                            <BookCoverThumbnail
                              title={item.title}
                              coverImagePath={item.coverImagePath}
                              className="h-16 w-11 shrink-0 rounded-md"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="min-h-11 text-left font-bold text-[#0b5ea2] underline underline-offset-4 hover:text-[#132a3f] dark:text-sky-300"
                              onClick={() => setSelectedTitle(item)}
                            >
                              {item.title}
                            </button>
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              {item.authors.join(', ') || 'Author not recorded'}
                            </p>
                            <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {item.categoryName ?? 'Uncategorized'} · {item.recordType}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-200">
                        <p className="font-semibold">{item.edition || 'Standard edition'}</p>
                        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                          {item.pages ? `${item.pages} pp.` : 'Pages —'}
                          {item.volumes ? ` · ${item.volumes}` : ''}
                        </p>
                      </td>

                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-200">
                        <p className="font-semibold">{item.publisher || '—'}</p>
                        <p className="mt-0.5 tabular-nums text-slate-500 dark:text-slate-400">
                          {item.publicationYear ?? '—'}
                        </p>
                      </td>

                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-200">
                        <p className="font-bold tabular-nums text-[#0b5ea2] dark:text-sky-300">
                          {item.availableCopies} / {item.totalCopies} copies
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                          <MapPin size={13} />
                          {item.actualShelfLocations.length > 0
                            ? item.actualShelfLocations.join(', ')
                            : (item.shelfLocation ?? 'Not mapped')}
                        </span>
                        <p
                          className={`mt-0.5 text-[11px] ${
                            item.shelfStatus === 'Mismatch'
                              ? 'font-bold text-red-700 dark:text-red-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.shelfStatus === 'Mapped'
                            ? `${item.activeInventoryCount} active ${item.activeInventoryCount === 1 ? 'copy' : 'copies'}`
                            : item.shelfStatus === 'Mismatch'
                              ? 'No shelf on copies'
                              : item.shelfStatus}
                        </p>
                      </td>

                      <td className="px-3 py-3 text-xs">
                        <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {item.isbn ?? item.research?.researchCode ?? '—'}
                        </p>
                        {item.remarks ? (
                          <p
                            className="mt-1 line-clamp-2 max-w-[180px] text-[11px] text-slate-500 dark:text-slate-400"
                            title={item.remarks}
                          >
                            {item.remarks}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-400">No remarks</p>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <StatusBadge status={item.availability} />
                      </td>

                      <td className="px-3 py-3">
                        <RowActions label={`Actions for ${item.title}`}>
                          {item.recordType === 'Research/Thesis' ? (
                            <button type="button" onClick={() => setSelectedTitle(item)}>
                              View details
                            </button>
                          ) : null}
                          {item.recordType === 'Book' ? (
                            <button
                              onClick={() => setSelectedTitle(item)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"
                            >
                              <Eye size={15} /> View details
                            </button>
                          ) : item.research?.researchInventoryId ? (
                            <button
                              type="button"
                              onClick={() => setResearchAssetId(item.research!.researchInventoryId)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"
                            >
                              <Eye size={15} /> View codes
                            </button>
                          ) : (
                            <span className="text-xs text-[#0b5ea2]/50">Codes unavailable</span>
                          )}
                          {item.recordType === 'Book' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCategoryError(null)
                                setCategoryItem(item)
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"
                            >
                              <ArrowRightLeft size={15} /> Change category
                            </button>
                          ) : (
                            <a
                              href={`/librarian/maintenance?section=research-groups&titleId=${item.titleId}`}
                              className="inline-flex min-h-10 items-center text-xs font-bold"
                            >
                              Change research group
                            </a>
                          )}
                          {item.recordType === 'Book' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setQuotationItem(item)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"
                              >
                                Supplier quotations
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setArchiveReason('')
                                  setArchiveItem(item)
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"
                              >
                                <Archive size={15} /> Archive book
                              </button>
                            </>
                          ) : null}
                        </RowActions>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">No records match these filters.</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Import your STI holdings Excel/CSV file or click Add book to register new copies with automatic Accession # and DDC + Cutter classifications.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Catalog pagination">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pagination.total
            ? `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} matching titles`
            : '0 results'}{' '}
          · Page {pagination.page} of {Math.max(1, pagination.pages)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={loading || pagination.page <= 1}
            onClick={() => setFilters((current) => ({ ...current, page: pagination.page - 1 }))}
          >
            Previous page
          </Button>
          <Button
            variant="secondary"
            disabled={loading || pagination.page >= pagination.pages}
            onClick={() => setFilters((current) => ({ ...current, page: pagination.page + 1 }))}
          >
            Next page
          </Button>
        </div>
      </div>

      {selectedTitle ? <CatalogTitleDetails item={selectedTitle} onClose={() => setSelectedTitle(null)} /> : null}
      {form === 'book' ? (
        <AddMultipleCopiesModal
          categories={categories.filter((category) => !category.recordKind || category.recordKind === 'Book')}
          locations={managedLocations}
          onClose={() => setForm(null)}
          onCreated={async () => {
            await refresh()
            setNotice({ tone: 'success', text: 'Book copies and printable labels created successfully.' })
          }}
        />
      ) : null}
      {form === 'thesis' ? (
        <AddResearchModal locations={managedLocations} onClose={() => setForm(null)} onCreated={refresh} />
      ) : null}
      {overviewTitleId !== null ? (
        <BookOverview
          titleId={overviewTitleId}
          role="Admin"
          activeBookCount={0}
          selectedBookCount={0}
          alreadySelected={false}
          onAddToCart={() => undefined}
          onClose={() => setOverviewTitleId(null)}
        />
      ) : null}
      {assetCopyId !== null ? (
        <AssetCodeModal physicalCopyId={assetCopyId} onClose={() => setAssetCopyId(null)} />
      ) : null}
      {researchAssetId !== null ? (
        <AssetCodeModal assetType="research" researchInventoryId={researchAssetId} onClose={() => setResearchAssetId(null)} />
      ) : null}
      {categoryItem ? (
        <ChangeTitleCategoryModal
          item={categoryItem}
          categories={categories}
          saving={changingCategory}
          error={categoryError}
          onClose={() => {
            if (!changingCategory) setCategoryItem(null)
          }}
          onConfirm={(categoryId) => void changeCategory(categoryId)}
        />
      ) : null}
      {archiveItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#132a3f]/75 p-4 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Archive book"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
          >
            <h2 className="text-xl font-black text-[#0b5ea2] dark:text-sky-300">Archive {archiveItem.title}?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The book and its copies will leave the active catalog. Their records will remain in Book archive. Active loans or reservations must be completed first.
            </p>
            <label className="mt-5 block text-sm font-bold">
              Reason for archiving
              <textarea
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                maxLength={255}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" disabled={archiving} onClick={() => setArchiveItem(null)}>
                Cancel
              </Button>
              <Button disabled={archiving || !archiveReason.trim()} onClick={() => void archiveBook()}>
                Archive book
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {quotationItem ? (
        <BookQuotationModal
          titleId={quotationItem.titleId}
          title={quotationItem.title}
          onClose={() => setQuotationItem(null)}
        />
      ) : null}
    </div>
  )
}
