import { ExportMenu } from '../../components/ExportMenu'
import { CatalogTitleDetails } from './CatalogTitleDetails'

import { RowActions } from '../../components/RowActions'

import { ResponsiveTable } from '../../components/ResponsiveTable'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Archive, ArrowRightLeft, BookOpen, Download, Eye, FileText, MapPin, Plus, ScanBarcode, Search, X } from 'lucide-react'

import { PageHeader, SectionCard, StatusBadge } from '../../components/ui'

import { ApiError, catalogApi } from './catalog-api'

import type { CatalogFilters, CatalogItem, Category, PhysicalCopy } from './types'

import { enhancedCatalog } from './enhanced-catalog-api'

import { useBarcodeScanner } from './useBarcodeScanner'

import { BookOverview } from './BookOverview'

import { AssetCodeModal } from './AssetCodeModal'

import { AddMultipleCopiesModal } from './AddMultipleCopiesModal'

import { AddResearchModal } from './AddResearchModal'

import { ChangeTitleCategoryModal } from './ChangeTitleCategoryModal'

import { BookCoverThumbnail } from './BookCoverThumbnail'

import { BookQuotationModal } from './BookQuotationModal'



const fieldClass = 'h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10'

const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#0b5ea2]'

const emptyFilters: CatalogFilters = { page: 1, limit: 25, q: '', scope: 'all', categoryId: '', author: '', publicationYear: '', availability: '' }



function Field({ label, name, required, children }: { label: string; name: string; required?: boolean; children?: React.ReactNode }) {

  return <label><span className={labelClass}>{label}{required ? ' *' : ''}</span>{children ?? <input name={name} required={required} className={fieldClass} />}</label>

}



export function CatalogManagementPage({maintenance=false}: {maintenance?:boolean} = {}) {

  const requestSequence = useRef(0)
  const [items, setItems] = useState<CatalogItem[]>([])

  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 })

  const [loadError, setLoadError] = useState('')

  const [selectedTitle, setSelectedTitle] = useState<CatalogItem | null>(null)

  const [categories, setCategories] = useState<Category[]>([])

  const [managedLocations,setManagedLocations] = useState<string[]>([])

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

  const [categoryItem, setCategoryItem] = useState<CatalogItem | null>(null)

  const [changingCategory, setChangingCategory] = useState(false)

  const [categoryError, setCategoryError] = useState<string | null>(null)

  const [archiveItem, setArchiveItem] = useState<CatalogItem | null>(null)

  const [quotationItem, setQuotationItem] = useState<CatalogItem | null>(null)

  const [archiveReason, setArchiveReason] = useState('')

  const [archiving, setArchiving] = useState(false)



  const loadCatalog = useCallback(async (isCurrent: () => boolean = () => true) => {
    const sequence = ++requestSequence.current
    const current = () => isCurrent() && sequence === requestSequence.current


    setLoading(true)

    setLoadError('')

    try {

      const [catalog, categoryRows, managed] = await Promise.all([

        catalogApi.search(filters), catalogApi.categories(), enhancedCatalog.options(true),

      ])

      if (!current()) return

      const limit = catalog.pagination.limit ?? filters.limit ?? 25

      setItems(catalog.items)

      setPagination({ page: catalog.pagination.page ?? filters.page ?? 1, limit, total: catalog.pagination.total, pages: catalog.pagination.pages ?? Math.ceil(catalog.pagination.total / limit) })

      setCategories(categoryRows)

      setManagedLocations(managed.locations.filter(location => location.status === 'Active').map(location => location.name))

    } catch (error) {

      if (current()) setLoadError(error instanceof Error ? error.message : 'Catalog data could not be loaded.')

    } finally { if (current()) setLoading(false) }

  }, [filters])

  const refresh = useCallback(() => loadCatalog(), [loadCatalog])

  useEffect(() => {

    let current = true

    const timer = window.setTimeout(() => void loadCatalog(() => current), 220)

    return () => { current = false; window.clearTimeout(timer) }

  }, [loadCatalog])

  const changeFilters = (next: CatalogFilters) => { requestSequence.current++; setFilters({ ...next, page: 1 }) }



  const scanned = useCallback(async (value: string) => {

    try {

      const result = await catalogApi.parseRegistry(value)

      setNotice({ tone: 'success', text: result.match ? `${result.kind} ${result.normalizedValue} matched an existing catalog record.` : `${result.kind} ${result.normalizedValue} is valid and ready for registration.` })

      setFilters((current) => ({ ...current, page: 1, q: result.normalizedValue }))

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



  async function downloadInventory(format: 'csv' | 'pdf') {

    setExportingPdf(true)

    try {

      await catalogApi.downloadInventory(format, filters)

      setNotice({ tone: 'success', text: `${format.toUpperCase()} inventory report downloaded successfully.` })

    } catch (error) {

      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The inventory report could not be generated.' })

    } finally { setExportingPdf(false) }

  }



  async function changeCategory(targetCategoryId: number) {

    if (!categoryItem) return

    setChangingCategory(true); setCategoryError(null)

    try {

      const result = await catalogApi.changeTitleCategory(categoryItem.titleId, targetCategoryId, categoryItem.rowVersion)

      setCategoryItem(null)

      await refresh()

      const count = result.bookCopies + result.researchCopies

      setNotice({ tone: 'success', text: `${categoryItem.title} moved to ${result.categoryName} and ${result.shelfLocation}. ${count} active ${count === 1 ? 'copy was' : 'copies were'} updated.` })

    } catch (error) {

      setCategoryError(error instanceof Error ? error.message : 'The category could not be changed.')

    } finally { setChangingCategory(false) }

  }



  async function archiveBook() {

    if (!archiveItem || !archiveReason.trim()) return

    setArchiving(true)

    try {

      await catalogApi.archiveBook(archiveItem.titleId, archiveReason.trim())

      const title = archiveItem.title

      setArchiveItem(null); setArchiveReason('')

      await refresh()

      setNotice({ tone: 'success', text: `${title} moved to Book archive.` })

    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The book could not be archived.' }) }

    finally { setArchiving(false) }

  }



  const totals = useMemo(() => ({ books: items.filter((item) => item.recordType === 'Book').length, research: items.filter((item) => item.recordType === 'Research/Thesis').length }), [items])

  return <>

    <PageHeader eyebrow="Catalog administration" title="Catalog" description="Find a title, review its details, and manage its copies in Inventory." action={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-11 rounded-xl border px-4 text-sm font-bold disabled:opacity-50">Refresh</button><a className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold" href="/librarian/catalog?tool=imports">Import books</a><button onClick={() => { setFieldErrors({}); setForm('thesis') }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#0b5ea2] bg-white px-4 text-sm font-bold text-[#0b5ea2]"><FileText size={16} /> Add research</button><button onClick={() => { setFieldErrors({}); setForm('book') }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white"><Plus size={16} /> Add book</button></div>} />



    {notice ? <div role={notice.tone === 'success' ? 'status' : 'alert'} className={`mb-4 flex items-start justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === 'success' ? 'border-[#0b5ea2] bg-white text-[#0b5ea2]' : 'border-[#FFF200] bg-[#FFF200] text-[#0b5ea2]'}`}><span>{notice.text}</span><button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div> : null}



    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">

      <p role="status">{loading ? 'Loading catalog…' : loadError ? 'Catalog could not be loaded.' : `${pagination.total} matching titles`}</p>

      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" role="switch" checked={scannerActive} onChange={event => setScannerActive(event.target.checked)} /> Barcode scanner {scannerActive ? 'listening' : 'paused'}</label>

    </div>

    {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError} Use Refresh to try again.</p>}

    <SectionCard className="mb-5 p-5"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3.5 text-[#0b5ea2]/50" size={16} /><input aria-label="Search catalog" value={filters.q} onChange={(e) => changeFilters({ ...filters, q: e.target.value })} placeholder="Title, ISBN, author, code..." className={`${fieldClass} pl-9`} /></label><select aria-label="Resource type" value={filters.scope} onChange={(e) => changeFilters({ ...filters, scope: e.target.value as CatalogFilters['scope'] })} className={fieldClass}><option value="all">Books + research</option><option value="books">Books only</option><option value="research">Research only</option></select><select aria-label="Category" value={filters.categoryId} onChange={(e) => changeFilters({ ...filters, categoryId: e.target.value })} className={fieldClass}><option value="">All categories</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select><input aria-label="Author" value={filters.author} onChange={(e) => changeFilters({ ...filters, author: e.target.value })} placeholder="Author" className={fieldClass} /><input aria-label="Publication year" value={filters.publicationYear} onChange={(e) => changeFilters({ ...filters, publicationYear: e.target.value })} placeholder="Year" inputMode="numeric" className={fieldClass} /><select aria-label="Availability" value={filters.availability} onChange={(e) => changeFilters({ ...filters, availability: e.target.value })} className={fieldClass}><option value="">Any availability</option><option>Available</option><option>Borrowed</option><option>Reserved</option><option>Unavailable</option><option>Available for Viewing</option></select><label>Dewey assignment<select className={fieldClass} value={filters.deweyStatus??''} onChange={event=>changeFilters({...filters,deweyStatus:event.target.value as CatalogFilters['deweyStatus']})}><option value="">Any Dewey assignment</option><option value="assigned">Assigned</option><option value="unassigned">Not assigned</option></select></label></div><div className="mt-4 flex flex-wrap gap-2">{!maintenance && <ExportMenu disabled={exportingPdf||loading} exports={(['csv','pdf'] as const).map(format=>({label:format.toUpperCase(),onSelect:()=>void downloadInventory(format)}))}/>}<button onClick={() => setFilters(emptyFilters)} className="h-10 rounded-xl border border-[#0b5ea2]/20 bg-white px-4 text-sm font-bold text-[#0b5ea2]">Clear filters</button></div></SectionCard>



    <SectionCard className="mb-5 overflow-hidden">

      <div className="border-b border-[#0b5ea2]/15 px-5 py-4"><h2 className="font-bold text-[#0b5ea2]">Unified catalog results</h2></div>

      <ResponsiveTable><table className="w-full min-w-[1180px] text-left text-sm">

        <thead className="bg-[#0b5ea2] text-white"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">ISBN / code</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Actions</th></tr></thead>

        <tbody>{loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-[#0b5ea2]">Loading catalog…</td></tr> : loadError ? <tr><td colSpan={8} className="p-5 text-center">Unable to show results. Refresh to retry.</td></tr> : items.length ? items.map((item) => <tr key={item.titleId} className="border-b border-[#0b5ea2]/10 align-top">

          <td className="px-4 py-3"><div className="flex items-center gap-3">{item.recordType === 'Book' ? <BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-16 w-11 rounded-md" /> : null}<div className="min-w-0"><button type="button" className="min-h-11 text-left font-bold text-[#0b5ea2] underline underline-offset-4" onClick={() => setSelectedTitle(item)}>{item.title}</button><p className="text-xs text-[#0b5ea2]/60">{item.authors.join(', ')}</p></div></div></td>

          <td className="px-4 py-3 text-[#0b5ea2]">{item.recordType}</td>

          <td className="px-4 py-3 text-[#0b5ea2]">{item.categoryName ?? 'Uncategorized'}</td>

          <td className="px-4 py-3 text-[#0b5ea2]"><span className="inline-flex items-center gap-1.5 font-semibold"><MapPin size={14} />{item.shelfLocation ?? 'Not mapped'}</span><p className={`mt-1 text-[11px] ${item.shelfStatus === 'Mismatch' ? 'font-bold text-red-700' : 'text-[#0b5ea2]/55'}`}>{item.shelfStatus === 'Mapped' ? `${item.activeInventoryCount} active ${item.activeInventoryCount === 1 ? 'copy' : 'copies'}` : item.shelfStatus}</p></td>

          <td className="px-4 py-3 text-[#0b5ea2]">{item.publicationYear ?? '—'}</td>

          <td className="px-4 py-3 font-mono text-xs text-[#0b5ea2]">{item.isbn ?? item.research?.researchCode ?? '—'}</td>

          <td className="px-4 py-3"><StatusBadge status={item.availability} /></td>

          <td className="px-4 py-3"><RowActions label={`Actions for ${item.title}`}>{item.recordType === 'Research/Thesis' ? <button type="button" onClick={() => setSelectedTitle(item)}>View details</button> : null}{item.recordType === 'Book' ? <button onClick={() => setSelectedTitle(item)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"><Eye size={15} /> View details</button> : item.research?.researchInventoryId ? <button type="button" onClick={() => setResearchAssetId(item.research!.researchInventoryId)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"><Eye size={15} /> View codes</button> : <span className="text-xs text-[#0b5ea2]/50">Codes unavailable</span>}{item.recordType === 'Book' ? <button type="button" onClick={() => { setCategoryError(null); setCategoryItem(item) }} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"><ArrowRightLeft size={15} /> Change category</button> : <a href={`/librarian/maintenance?section=research-groups&titleId=${item.titleId}`} className="inline-flex min-h-10 items-center text-xs font-bold">Change research group</a>}{item.recordType === 'Book' ? <><button type="button" onClick={() => setQuotationItem(item)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]">Supplier quotations</button><button type="button" onClick={() => { setArchiveReason(''); setArchiveItem(item) }} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5ea2]"><Archive size={15} /> Archive book</button></> : null}</RowActions></td>

        </tr>) : <tr><td colSpan={8} className="px-4 py-8 text-center text-[#0b5ea2]">No records match these filters.</td></tr>}</tbody>

      </table></ResponsiveTable>

    </SectionCard>



    <div className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-label="Catalog pagination">

      <p className="text-sm">{pagination.total ? `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} matching titles` : '0 results'} · Page {pagination.page} of {Math.max(1, pagination.pages)}</p>

      <div className="flex gap-2"><button className="min-h-11 rounded-xl border px-4 disabled:opacity-50" disabled={loading || pagination.page <= 1} onClick={() => setFilters(current => ({ ...current, page: pagination.page - 1 }))}>Previous page</button><button className="min-h-11 rounded-xl border px-4 disabled:opacity-50" disabled={loading || pagination.page >= pagination.pages} onClick={() => setFilters(current => ({ ...current, page: pagination.page + 1 }))}>Next page</button></div>

    </div>

    {selectedTitle ? <CatalogTitleDetails item={selectedTitle} onClose={() => setSelectedTitle(null)} /> : null}

    {form === 'book' ? <AddMultipleCopiesModal categories={categories} locations={managedLocations} onClose={() => setForm(null)} onCreated={async () => { await refresh(); setNotice({ tone: 'success', text: 'Book copies and printable labels created successfully.' }) }} /> : null}

    {form === 'thesis' ? <AddResearchModal locations={managedLocations} onClose={() => setForm(null)} onCreated={refresh} /> : null}

    {overviewTitleId !== null ? <BookOverview titleId={overviewTitleId} role="Admin" activeBookCount={0} selectedBookCount={0} alreadySelected={false} onAddToCart={() => undefined} onClose={() => setOverviewTitleId(null)} /> : null}

    {assetCopyId !== null ? <AssetCodeModal physicalCopyId={assetCopyId} onClose={() => setAssetCopyId(null)} /> : null}

    {researchAssetId !== null ? <AssetCodeModal assetType="research" researchInventoryId={researchAssetId} onClose={() => setResearchAssetId(null)} /> : null}

    {categoryItem ? <ChangeTitleCategoryModal item={categoryItem} categories={categories} saving={changingCategory} error={categoryError} onClose={() => { if (!changingCategory) setCategoryItem(null) }} onConfirm={(categoryId) => void changeCategory(categoryId)} /> : null}

    {archiveItem ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b5ea2]/75 p-4"><div role="dialog" aria-modal="true" aria-label="Archive book" className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0b5ea2]"><h2 className="text-xl font-black">Archive {archiveItem.title}?</h2><p className="mt-2 text-sm">The book and its copies will leave the active catalog. Their records will remain in Book archive. Active loans or reservations must be completed first.</p><label className="mt-5 block text-sm font-bold">Reason for archiving<textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} maxLength={255} rows={3} className="mt-2 w-full rounded-xl border border-[#0b5ea2]/20 p-3" /></label><div className="mt-5 flex justify-end gap-2"><button disabled={archiving} onClick={() => setArchiveItem(null)} className="rounded-xl border border-[#0b5ea2] px-4 py-2 font-bold">Cancel</button><button disabled={archiving || !archiveReason.trim()} onClick={() => void archiveBook()} className="rounded-xl bg-[#0b5ea2] px-4 py-2 font-bold text-white disabled:opacity-50">Archive book</button></div></div></div> : null}

    {quotationItem ? <BookQuotationModal titleId={quotationItem.titleId} title={quotationItem.title} onClose={() => setQuotationItem(null)} /> : null}

  </>

}
