import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, FileText, Plus, ScanBarcode, Search, X } from 'lucide-react'
import { PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { ApiError, catalogApi } from './catalog-api'
import type { CatalogFilters, CatalogItem, Category, PhysicalCopy } from './types'
import { useBarcodeScanner } from './useBarcodeScanner'

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
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

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
          title: data.title, authors: [data.author], isbn: data.isbn, categoryId: data.categoryId || null,
          publicationYear: data.publicationYear || null, publisher: data.publisher, callNumber: data.callNumber,
          copy: { barcode: data.barcode, accessionNumber: data.accessionNumber, shelfLocation: data.shelfLocation, conditionStatus: data.conditionStatus },
        }
      : {
          title: data.title, authors: [data.author], adviser: data.adviser, year: data.year,
          abstract: data.abstract, categoryId: data.categoryId || null, researchCode: data.researchCode,
          departmentOrProgram: data.departmentOrProgram, keywords: data.keywords,
        }
    setSavingKind(kind); setFieldErrors({})
    try {
      if (kind === 'book') await catalogApi.createBook(body); else await catalogApi.createThesis(body)
      formElement.reset(); setForm(null); await refresh()
      setNotice({ tone: 'success', text: `${kind === 'book' ? 'Book and physical copy' : 'Research/thesis'} created successfully.` })
    } catch (error) {
      const apiError = error as ApiError
      const errors = apiError.details?.errors ?? {}
      setFieldErrors(errors)
      setNotice({ tone: 'error', text: apiError.message })
    } finally { setSavingKind(null) }
  }

  async function download(format: 'csv' | 'pdf') {
    setExporting(format)
    try {
      await catalogApi.downloadInventory(format, filters)
      setNotice({ tone: 'success', text: `${format.toUpperCase()} inventory report downloaded successfully.` })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The inventory report could not be generated.' })
    } finally { setExporting(null) }
  }

  const totals = useMemo(() => ({ books: items.filter((item) => item.recordType === 'Book').length, research: items.filter((item) => item.recordType === 'Research/Thesis').length }), [items])
  return <>
    <PageHeader eyebrow="Catalog administration" title="Books and research management" description="Register, search, update, archive, scan, and export the campus collection." action={<div className="flex flex-wrap gap-2"><button onClick={() => { setFieldErrors({}); setForm('thesis') }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399] bg-white px-4 text-sm font-bold text-[#003399]"><FileText size={16} /> Add thesis</button><button onClick={() => { setFieldErrors({}); setForm('book') }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-white"><Plus size={16} /> Add book</button></div>} />

    {notice ? <div role="alert" className={`mb-4 flex items-start justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === 'success' ? 'border-[#003399] bg-white text-[#003399]' : 'border-[#FFF200] bg-[#FFF200] text-[#003399]'}`}><span>{notice.text}</span><button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div> : null}

    <div className="mb-5 grid gap-3 sm:grid-cols-3"><SectionCard className="p-5"><BookOpen className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Visible book titles</p><p className="mt-1 text-3xl font-black text-[#003399]">{totals.books}</p></SectionCard><SectionCard className="p-5"><FileText className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Visible research</p><p className="mt-1 text-3xl font-black text-[#003399]">{totals.research}</p></SectionCard><SectionCard className="p-5"><ScanBarcode className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Tracked copies</p><p className="mt-1 text-3xl font-black text-[#003399]">{copies.length}</p></SectionCard></div>

    <SectionCard className="mb-5 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex flex-1 items-center gap-3"><span className="rounded-xl bg-[#FFF200] p-3 text-[#003399]"><ScanBarcode /></span><div><h2 className="font-bold text-[#003399]">Hardware scanner hook</h2><p className="text-xs text-[#003399]/65">Scan a barcode or ISBN at normal scanner speed, followed by Enter.</p></div></div><button onClick={() => setScannerActive((active) => !active)} className={`rounded-xl border border-[#003399] px-4 py-2 text-sm font-bold ${scannerActive ? 'bg-[#003399] text-white' : 'bg-white text-[#003399]'}`}>{scannerActive ? 'Scanner listening' : 'Scanner paused'}</button></div></SectionCard>

    <SectionCard className="mb-5 p-5"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3.5 text-[#003399]/50" size={16} /><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Title, ISBN, author, code..." className={`${fieldClass} pl-9`} /></label><select value={filters.scope} onChange={(e) => setFilters({ ...filters, scope: e.target.value as CatalogFilters['scope'] })} className={fieldClass}><option value="all">Books + research</option><option value="books">Books only</option><option value="research">Research only</option></select><select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className={fieldClass}><option value="">All categories</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select><input value={filters.author} onChange={(e) => setFilters({ ...filters, author: e.target.value })} placeholder="Author" className={fieldClass} /><input value={filters.publicationYear} onChange={(e) => setFilters({ ...filters, publicationYear: e.target.value })} placeholder="Year" inputMode="numeric" className={fieldClass} /><select value={filters.availability} onChange={(e) => setFilters({ ...filters, availability: e.target.value })} className={fieldClass}><option value="">Any availability</option><option>Available</option><option>Borrowed</option><option>Reserved</option><option>Unavailable</option><option>Available for Viewing</option></select></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={exporting !== null} onClick={() => void download('csv')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-white disabled:opacity-50"><Download size={15} /> {exporting === 'csv' ? 'Preparing CSV…' : 'CSV'}</button><button disabled={exporting !== null} onClick={() => void download('pdf')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={15} /> {exporting === 'pdf' ? 'Preparing PDF…' : 'PDF'}</button><button onClick={() => setFilters(emptyFilters)} className="h-10 rounded-xl border border-[#003399]/20 bg-white px-4 text-sm font-bold text-[#003399]">Clear filters</button></div></SectionCard>

    <SectionCard className="mb-5 overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Unified catalog results</h2><p className="text-xs text-[#003399]/60">Combined optional filters are executed by prepared MySQL queries.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">ISBN / code</th><th className="px-4 py-3">Availability</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-[#003399]">Loading catalog…</td></tr> : items.length ? items.map((item) => <tr key={item.titleId} className="border-b border-[#003399]/10"><td className="px-4 py-3"><p className="font-bold text-[#003399]">{item.title}</p><p className="text-xs text-[#003399]/60">{item.authors.join(', ')}</p></td><td className="px-4 py-3 text-[#003399]">{item.recordType}</td><td className="px-4 py-3 text-[#003399]">{item.categoryName ?? 'Uncategorized'}</td><td className="px-4 py-3 text-[#003399]">{item.publicationYear ?? '—'}</td><td className="px-4 py-3 font-mono text-xs text-[#003399]">{item.isbn ?? item.research?.researchCode ?? '—'}</td><td className="px-4 py-3"><StatusBadge status={item.availability} /></td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-[#003399]">No records match these filters.</td></tr>}</tbody></table></div></SectionCard>

    <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Physical copy register</h2><p className="text-xs text-[#003399]/60">Accession, condition, shelf, availability, and last scan audit trail.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#FFF200] text-[#003399]"><tr><th className="px-4 py-3">Accession</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last scanned</th></tr></thead><tbody>{copies.map((copy) => <tr key={copy.physicalCopyId} className="border-b border-[#003399]/10"><td className="px-4 py-3 font-mono font-bold text-[#003399]">{copy.accessionNumber}</td><td className="px-4 py-3 text-[#003399]">{copy.title}</td><td className="px-4 py-3 font-mono text-xs text-[#003399]">{copy.barcode}</td><td className="px-4 py-3 text-[#003399]">{copy.shelfLocation}</td><td className="px-4 py-3 text-[#003399]">{copy.conditionStatus}</td><td className="px-4 py-3"><StatusBadge status={copy.availabilityStatus} /></td><td className="px-4 py-3 text-xs text-[#003399]/65">{copy.lastScannedAt ? new Date(copy.lastScannedAt).toLocaleString() : 'Never'}</td></tr>)}</tbody></table></div></SectionCard>

    {form ? <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/80 p-4"><div className="mx-auto my-6 max-w-3xl rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Catalog entry</p><h2 className="text-xl font-black text-[#003399]">Add {form === 'book' ? 'book and physical copy' : 'research / thesis'}</h2></div><button disabled={savingKind !== null} onClick={() => setForm(null)} className="rounded-xl p-2 text-[#003399] disabled:opacity-50"><X /></button></div>{Object.keys(fieldErrors).length ? <div className="mx-5 mt-5 rounded-xl bg-[#FFF200] p-4 text-sm text-[#003399]"><p className="font-black">Please correct these fields:</p><ul className="mt-2 list-inside list-disc">{Object.entries(fieldErrors).map(([field, message]) => <li key={field}><span className="font-bold">{field}:</span> {message}</li>)}</ul></div> : null}<form onSubmit={(event) => void submit(event, form)} className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Title" name="title" required /><Field label="Author" name="author" required />{form === 'book' ? <><Field label="ISBN" name="isbn" /><Field label="Publication year" name="publicationYear" /><Field label="Publisher" name="publisher" /><Field label="Call number" name="callNumber" /><Field label="Barcode" name="barcode" required /><Field label="Accession number" name="accessionNumber" required /><Field label="Shelf location" name="shelfLocation" required /><Field label="Condition" name="conditionStatus"><select name="conditionStatus" className={fieldClass}><option>New</option><option>Good</option><option>Fair</option><option>Damaged</option><option>For Repair</option><option>Lost</option></select></Field></> : <><Field label="Research code" name="researchCode" required /><Field label="Year" name="year" required /><Field label="Adviser" name="adviser" required /><Field label="Department / program" name="departmentOrProgram" required /><Field label="Keywords" name="keywords" /><label className="sm:col-span-2"><span className={labelClass}>Abstract *</span><textarea name="abstract" required minLength={20} rows={6} className={`${fieldClass} h-auto py-3`} /></label></>}<Field label="Category" name="categoryId"><select name="categoryId" className={fieldClass}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select></Field><div className="flex items-end justify-end gap-2 sm:col-span-2"><button disabled={savingKind !== null} type="button" onClick={() => setForm(null)} className="h-11 rounded-xl border border-[#003399] bg-white px-5 font-bold text-[#003399] disabled:opacity-50">Cancel</button><button disabled={savingKind !== null} type="submit" className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-white disabled:opacity-50">{savingKind ? 'Saving record…' : 'Create record'}</button></div></form></div></div> : null}
  </>
}
