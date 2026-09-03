import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, Eye, FileText, Plus, ScanBarcode, Search, X } from 'lucide-react'
import { PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { ApiError, catalogApi } from './catalog-api'
import type { CatalogFilters, CatalogItem, Category, PhysicalCopy } from './types'
import { useBarcodeScanner } from './useBarcodeScanner'
import { BookOverview } from './BookOverview'
import { AssetCodeModal } from './AssetCodeModal'
import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'
import { AddResearchModal } from './AddResearchModal'

const fieldClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#003399]'
const emptyFilters: CatalogFilters = { q: '', scope: 'all', categoryId: '', author: '', publicationYear: '', availability: '' }

function Field({ label, name, required, children }: { label: string; name: string; required?: boolean; children?: React.ReactNode }) {
  return <label><span className={labelClass}>{label}{required ? ' *' : ''}</span>{children ?? <input name={name} required={required} className={fieldClass} />}</label>
}

export function CatalogManagementPage() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [copies, setCopies] = useState<PhysicalCopy[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filters, setFilters] = useState(emptyFilters)
  const [form, setForm] = useState<'book' | 'thesis' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [scannerActive, setScannerActive] = useState(true)
  const [savingKind, setSavingKind] = useState<'book' | 'thesis' | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [overviewTitleId, setOverviewTitleId] = useState<number | null>(null)
  const [assetCopyId, setAssetCopyId] = useState<number | null>(null)
  const [researchAssetId, setResearchAssetId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [catalog, copyRows, categoryRows] = await Promise.all([
        catalogApi.search(filters), catalogApi.copies(), catalogApi.categories(),
      ])
      setItems(catalog.items); setCopies(copyRows); setCategories(categoryRows); setNotice(null)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Catalog data could not be loaded.' })
    } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 220); return () => window.clearTimeout(timer) }, [refresh])

  const scanned = useCallback(async (value: string) => {
    try {
      const result = await catalogApi.parseRegistry(value)
      setNotice({ tone: 'success', text: result.match ? `${result.kind} ${result.normalizedValue} matched an existing catalog record.` : `${result.kind} ${result.normalizedValue} is valid and ready for registration.` })
      setFilters((current) => ({ ...current, q: result.normalizedValue }))
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The scan could not be parsed.' }) }
  }, [])
  useBarcodeScanner(scanned, scannerActive)

  async function submit(event: FormEvent<HTMLFormElement>, kind: 'book' | 'thesis') {
    event.preventDefault()
    const formElement = event.currentTarget
    const data = Object.fromEntries(new FormData(formElement).entries())
    const body = kind === 'book'
      ? {
          title: data.title, author: data.author, isbn: data.isbn, category_id: data.categoryId,
          shelf_location: data.shelfLocation, number_of_copies: data.numberOfCopies,
          publication_year: data.publicationYear || null, publisher: data.publisher, call_number: data.callNumber,
        }
      : {
          title: data.title, authors: [data.author], adviser: data.adviser, year: data.year,
          abstract: data.abstract, categoryId: data.categoryId || null, researchCode: data.researchCode,
          departmentOrProgram: data.departmentOrProgram, keywords: data.keywords,
          copy: {
            barcode: data.barcode,
            accessionNumber: data.accessionNumber,
            shelfLocation: data.shelfLocation,
            conditionStatus: data.conditionStatus,
          },
        }
    setSavingKind(kind); setFieldErrors({})
    try {
      if (kind === 'book') await catalogApi.createBulkBook(body); else await catalogApi.createThesis(body)
      formElement.reset(); setForm(null); await refresh()
      setNotice({ tone: 'success', text: `${kind === 'book' ? 'Book copies and printable labels' : 'Research/thesis catalog and inventory record'} created successfully.` })
    } catch (error) {
      const apiError = error as ApiError
      const errors = apiError.details?.errors ?? {}
      setFieldErrors(errors)
      setNotice({ tone: 'error', text: apiError.message })
    } finally { setSavingKind(null) }
  }

  async function downloadPdf() {
    setExportingPdf(true)
    try {
      await catalogApi.downloadInventory('pdf', filters)
      setNotice({ tone: 'success', text: 'PDF inventory report downloaded successfully.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The inventory report could not be generated.' })
    } finally { setExportingPdf(false) }
  }

  const totals = useMemo(() => ({ books: items.filter((item) => item.recordType === 'Book').length, research: items.filter((item) => item.recordType === 'Research/Thesis').length }), [items])
  return <>
    <PageHeader eyebrow="Catalog administration" title="Books and research management" description="Register, search, update, archive, scan, and export the campus collection." action={<div className="flex flex-wrap gap-2"><button onClick={() => { setFieldErrors({}); setForm('thesis') }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399] bg-white px-4 text-sm font-bold text-[#003399]"><FileText size={16} /> Add thesis</button><button onClick={() => { setFieldErrors({}); setForm('book') }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-white"><Plus size={16} /> Add book</button></div>} />

    {notice ? <div role="alert" className={`mb-4 flex items-start justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === 'success' ? 'border-[#003399] bg-white text-[#003399]' : 'border-[#FFF200] bg-[#FFF200] text-[#003399]'}`}><span>{notice.text}</span><button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div> : null}

    <div className="mb-5 grid gap-3 sm:grid-cols-3"><SectionCard className="p-5"><BookOpen className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Visible book titles</p><p className="mt-1 text-3xl font-black text-[#003399]">{totals.books}</p></SectionCard><SectionCard className="p-5"><FileText className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Visible research</p><p className="mt-1 text-3xl font-black text-[#003399]">{totals.research}</p></SectionCard><SectionCard className="p-5"><ScanBarcode className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Tracked copies</p><p className="mt-1 text-3xl font-black text-[#003399]">{copies.length}</p></SectionCard></div>

    <SectionCard className="mb-5 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex flex-1 items-center gap-3"><span className="rounded-xl bg-[#FFF200] p-3 text-[#003399]"><ScanBarcode /></span><div><h2 className="font-bold text-[#003399]">Hardware scanner hook</h2><p className="text-xs text-[#003399]/65">Scan a barcode or ISBN at normal scanner speed, followed by Enter.</p></div></div><button onClick={() => setScannerActive((active) => !active)} className={`rounded-xl border border-[#003399] px-4 py-2 text-sm font-bold ${scannerActive ? 'bg-[#003399] text-white' : 'bg-white text-[#003399]'}`}>{scannerActive ? 'Scanner listening' : 'Scanner paused'}</button></div></SectionCard>

    <SectionCard className="mb-5 p-5"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3.5 text-[#003399]/50" size={16} /><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Title, ISBN, author, code..." className={`${fieldClass} pl-9`} /></label><select value={filters.scope} onChange={(e) => setFilters({ ...filters, scope: e.target.value as CatalogFilters['scope'] })} className={fieldClass}><option value="all">Books + research</option><option value="books">Books only</option><option value="research">Research only</option></select><select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className={fieldClass}><option value="">All categories</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select><input value={filters.author} onChange={(e) => setFilters({ ...filters, author: e.target.value })} placeholder="Author" className={fieldClass} /><input value={filters.publicationYear} onChange={(e) => setFilters({ ...filters, publicationYear: e.target.value })} placeholder="Year" inputMode="numeric" className={fieldClass} /><select value={filters.availability} onChange={(e) => setFilters({ ...filters, availability: e.target.value })} className={fieldClass}><option value="">Any availability</option><option>Available</option><option>Borrowed</option><option>Reserved</option><option>Unavailable</option><option>Available for Viewing</option></select></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={exportingPdf} onClick={() => void downloadPdf()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={15} /> {exportingPdf ? 'Preparing PDF…' : 'Download PDF'}</button><button onClick={() => setFilters(emptyFilters)} className="h-10 rounded-xl border border-[#003399]/20 bg-white px-4 text-sm font-bold text-[#003399]">Clear filters</button></div></SectionCard>

    <SectionCard className="mb-5 overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Unified catalog results</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">ISBN / code</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Details</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-[#003399]">Loading catalog…</td></tr> : items.length ? items.map((item) => <tr key={item.titleId} className="border-b border-[#003399]/10"><td className="px-4 py-3"><p className="font-bold text-[#003399]">{item.title}</p><p className="text-xs text-[#003399]/60">{item.authors.join(', ')}</p></td><td className="px-4 py-3 text-[#003399]">{item.recordType}</td><td className="px-4 py-3 text-[#003399]">{item.categoryName ?? 'Uncategorized'}</td><td className="px-4 py-3 text-[#003399]">{item.publicationYear ?? '—'}</td><td className="px-4 py-3 font-mono text-xs text-[#003399]">{item.isbn ?? item.research?.researchCode ?? '—'}</td><td className="px-4 py-3"><StatusBadge status={item.availability} /></td><td className="px-4 py-3">{item.recordType === 'Book' ? <button onClick={() => setOverviewTitleId(item.titleId)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#003399]"><Eye size={15} /> View details</button> : item.research?.researchInventoryId ? <button type="button" onClick={() => setResearchAssetId(item.research!.researchInventoryId)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#003399] px-3 text-xs font-bold text-[#FFFFFF]"><Eye size={15} /> View Codes</button> : <span className="text-xs text-[#003399]/50">Codes unavailable</span>}</td></tr>) : <tr><td colSpan={7} className="px-4 py-8 text-center text-[#003399]">No records match these filters.</td></tr>}</tbody></table></div></SectionCard>

    <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Physical copy register</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-[#FFF200] text-[#003399]"><tr><th className="px-4 py-3">Accession</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last scanned</th><th className="px-4 py-3">Asset Codes</th></tr></thead><tbody>{copies.map((copy) => <tr key={copy.physicalCopyId} className="border-b border-[#003399]/10"><td className="px-4 py-3 font-mono font-bold text-[#003399]">{copy.accessionNumber}</td><td className="px-4 py-3 text-[#003399]">{copy.title}</td><td className="px-4 py-3 font-mono text-xs text-[#003399]">{copy.barcode}</td><td className="px-4 py-3 text-[#003399]">{copy.shelfLocation}</td><td className="px-4 py-3 text-[#003399]">{copy.conditionStatus}</td><td className="px-4 py-3"><StatusBadge status={copy.availabilityStatus} /></td><td className="px-4 py-3 text-xs text-[#003399]/65">{copy.lastScannedAt ? new Date(copy.lastScannedAt).toLocaleString() : 'Never'}</td><td className="px-4 py-3"><button type="button" onClick={() => setAssetCopyId(copy.physicalCopyId)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#003399] px-3 text-xs font-bold text-[#FFFFFF]"><Eye size={15} /> View Codes</button></td></tr>)}</tbody></table></div></SectionCard>

    {form === 'book' ? <AddMultipleCopiesModal categories={categories} onClose={() => setForm(null)} onCreated={async () => { await refresh(); setNotice({ tone: 'success', text: 'Book copies and printable labels created successfully.' }) }} /> : null}
    {form === 'thesis' ? <AddResearchModal locations={Array.from(new Set(categories.map((category) => category.shelfLocation).filter(Boolean)))} onClose={() => setForm(null)} onCreated={refresh} /> : null}
    {overviewTitleId !== null ? <BookOverview titleId={overviewTitleId} role="Admin" activeBookCount={0} selectedBookCount={0} alreadySelected={false} onAddToCart={() => undefined} onClose={() => setOverviewTitleId(null)} /> : null}
    {assetCopyId !== null ? <AssetCodeModal physicalCopyId={assetCopyId} onClose={() => setAssetCopyId(null)} /> : null}
    {researchAssetId !== null ? <AssetCodeModal assetType="research" researchInventoryId={researchAssetId} onClose={() => setResearchAssetId(null)} /> : null}
  </>
}
