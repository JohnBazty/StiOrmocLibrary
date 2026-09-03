import {
  AlertTriangle, Barcode, BookCopy, CheckCircle2, Download, PackageSearch,
  FileText, GraduationCap, RefreshCw, ScanBarcode, Search, ShieldAlert, X, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { PageHeader, SectionCard, StatCard, cn } from '../../components/ui'
import { inventoryApi, InventoryApiError } from './inventory-api'
import type { InventoryCopy, InventoryFilters, InventoryPagination, InventoryRemovalTarget, InventorySummary, ThesisInventoryFilters, ThesisInventoryRow, ThesisInventorySummary } from './types'
import { useDesktopScanner } from './useDesktopScanner'
import { InventoryRemovalDialog } from './InventoryRemovalDialog'

const EMPTY_SUMMARY: InventorySummary = { total_catalog_materials: 0, total_physical_copies: 0, damaged_copies_count: 0, lost_copies_count: 0 }
const DEFAULT_FILTERS: InventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '' }
const EMPTY_PAGINATION: InventoryPagination = { page: 1, limit: 25, total: 0, total_pages: 0 }
const EMPTY_THESIS_SUMMARY: ThesisInventorySummary = { total_thesis_materials: 0, damaged_thesis_count: 0, lost_thesis_count: 0 }
const DEFAULT_THESIS_FILTERS: ThesisInventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '', publicationYear: '' }
type ConditionInput = 'good' | 'fair' | 'for_repair' | 'damaged' | 'lost'
type AuditableItem = {
  item_title: string
  accession_number: string
  barcode: string
  availability_status: string
  condition_status?: string
  condition_state?: string
}

function ConditionBadge({ condition }: { condition: string }) {
  if (condition === 'Lost') return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#003399] px-2.5 py-1 text-[11px] font-bold text-[#FFFFFF]"><XCircle size={13} /> Lost</span>
  if (condition === 'Damaged' || condition === 'For Repair') return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF200] px-2.5 py-1 text-[11px] font-bold text-[#003399] ring-1 ring-inset ring-[#003399]/20"><AlertTriangle size={13} /> {condition}</span>
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-bold text-[#003399] ring-1 ring-inset ring-[#003399]/25"><CheckCircle2 size={13} /> {condition}</span>
}

function AvailabilityBadge({ status }: { status: string }) {
  const unavailable = status === 'Unavailable' || status === 'Archived'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset', unavailable ? 'bg-[#003399] text-[#FFFFFF] ring-[#003399]' : status === 'Reserved' ? 'bg-[#FFF200] text-[#003399] ring-[#003399]/20' : 'bg-[#FFFFFF] text-[#003399] ring-[#003399]/25')}>{unavailable ? <ShieldAlert size={13} /> : <CheckCircle2 size={13} />}{status}</span>
}

function formatDate(value: string | null) {
  if (!value) return 'Never verified'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date)
}

function displayThesisCondition(value: string) {
  return value === 'for_repair' ? 'For Repair' : value.charAt(0).toUpperCase() + value.slice(1)
}

function displayThesisAvailability(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ConditionModal({ copy, onClose, onSaved, saveCondition }: { copy: AuditableItem; onClose: () => void; onSaved: () => Promise<void>; saveCondition: (barcode: string, condition: ConditionInput) => Promise<unknown> }) {
  const [condition, setCondition] = useState<ConditionInput>('good')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null)
    try { await saveCondition(copy.barcode, condition); await onSaved(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this physical copy.') }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#003399]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="condition-title">
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl shadow-[#003399]/25">
      <div className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Condition audit</p><h2 id="condition-title" className="mt-1 text-xl font-bold text-[#003399]">Update physical condition</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5"><X size={18} /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#003399]/5 p-4 text-sm text-[#003399]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current: <strong>{copy.condition_status ?? copy.condition_state}</strong> · {copy.availability_status}</p></div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
        <fieldset><legend className="mb-2 text-sm font-bold text-[#003399]">New condition</legend><div className="grid grid-cols-2 gap-3">{(['good', 'fair', 'for_repair', 'damaged', 'lost'] as const).map((value) => <label key={value} className={cn('cursor-pointer rounded-xl border p-4 text-sm font-bold transition', condition === value ? 'border-[#003399] bg-[#FFF200] text-[#003399]' : 'border-[#003399]/15 bg-[#FFFFFF] text-[#003399]')}><input className="sr-only" type="radio" name="condition" value={value} checked={condition === value} onChange={() => setCondition(value)} />{value === 'lost' ? <XCircle className="mb-2" size={20} /> : value === 'damaged' || value === 'for_repair' ? <AlertTriangle className="mb-2" size={20} /> : <CheckCircle2 className="mb-2" size={20} />}<span className="capitalize">{value.replace('_', ' ')}</span></label>)}</div></fieldset>
        <div className="flex gap-3 rounded-xl border border-[#003399]/20 bg-[#FFF200]/40 p-3 text-xs leading-5 text-[#003399]"><ShieldAlert className="mt-0.5 shrink-0" size={17} /><p>{condition === 'lost' ? <>Lost is the only automatic exception: availability will be forced to <strong>Unavailable</strong> and this copy will leave reservation allocation.</> : <>Availability remains <strong>{copy.availability_status}</strong>. Use the separate availability control to change it manually.</>}</p></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#003399]/15 p-5"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399] disabled:opacity-50">Cancel</button><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : <ShieldAlert size={15} />}{saving ? 'Updating…' : 'Confirm override'}</button></div>
    </form>
  </div>
}

function AvailabilityConfirmationDialog({
  copy, saving, error, onCancel, onConfirm,
}: {
  copy: AuditableItem
  saving: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmButton = useRef<HTMLButtonElement>(null)
  const nextStatus = copy.availability_status.toLowerCase() === 'available' ? 'Unavailable' : 'Available'
  const becomingUnavailable = nextStatus === 'Unavailable'

  useEffect(() => {
    confirmButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, saving])

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#003399]/60 p-4" role="presentation">
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-[#003399]/20 bg-[#FFFFFF] shadow-2xl shadow-[#003399]/30" role="alertdialog" aria-modal="true" aria-labelledby="availability-dialog-title" aria-describedby="availability-dialog-description">
      <div className="flex items-start gap-4 border-b border-[#003399]/15 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><ShieldAlert size={22} /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Availability control</p><h2 id="availability-dialog-title" className="mt-1 text-xl font-black text-[#003399]">Make copy {nextStatus.toLowerCase()}?</h2></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Close confirmation" className="rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5 disabled:opacity-40"><X size={18} /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#003399]/5 p-4 text-[#003399]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current availability: <strong>{copy.availability_status}</strong></p></div>
        <div id="availability-dialog-description" className="flex gap-3 rounded-xl border border-[#003399]/20 bg-[#FFF200]/45 p-4 text-sm leading-6 text-[#003399]">
          {becomingUnavailable ? <ShieldAlert className="mt-0.5 shrink-0" size={19} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={19} />}
          <p>{becomingUnavailable ? <>This copy will be hidden from student search availability and cannot be assigned to new reservations.</> : <>This copy will return to active search results and may be assigned to a student reservation.</>}</p>
        </div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#003399]/15 p-5">
        <button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Cancel</button>
        <button ref={confirmButton} type="button" onClick={onConfirm} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : becomingUnavailable ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}{saving ? 'Updating…' : `Confirm ${nextStatus.toLowerCase()}`}</button>
      </div>
    </section>
  </div>
}

export function InventoryDashboard() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [thesisSummary, setThesisSummary] = useState(EMPTY_THESIS_SUMMARY)
  const [copies, setCopies] = useState<InventoryCopy[]>([])
  const [thesisRows, setThesisRows] = useState<ThesisInventoryRow[]>([])
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [thesisPagination, setThesisPagination] = useState(EMPTY_PAGINATION)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [thesisDraftFilters, setThesisDraftFilters] = useState(DEFAULT_THESIS_FILTERS)
  const [thesisFilters, setThesisFilters] = useState(DEFAULT_THESIS_FILTERS)
  const [loading, setLoading] = useState(true)
  const [thesisLoading, setThesisLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [selected, setSelected] = useState<InventoryCopy | null>(null)
  const [availabilityTarget, setAvailabilityTarget] = useState<InventoryCopy | null>(null)
  const [selectedThesis, setSelectedThesis] = useState<ThesisInventoryRow | null>(null)
  const [thesisAvailabilityTarget, setThesisAvailabilityTarget] = useState<ThesisInventoryRow | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [thesisExportingPdf, setThesisExportingPdf] = useState(false)
  const [removalTarget, setRemovalTarget] = useState<InventoryRemovalTarget | null>(null)

  const load = useCallback(async (nextFilters: InventoryFilters) => {
    setLoading(true); setError(null)
    try {
      const [nextSummary, register] = await Promise.all([
        inventoryApi.summary(), inventoryApi.copies(nextFilters),
      ])
      setSummary(nextSummary); setCopies(register.items); setPagination(register.pagination)
    } catch (reason) { setError(reason instanceof InventoryApiError ? reason.message : 'Unable to load the inventory register.') }
    finally { setLoading(false) }
  }, [])

  const loadThesis = useCallback(async (nextFilters: ThesisInventoryFilters) => {
    setThesisLoading(true); setError(null)
    try {
      const [nextSummary, register] = await Promise.all([
        inventoryApi.thesisSummary(), inventoryApi.thesisRows(nextFilters),
      ])
      setThesisSummary(nextSummary); setThesisRows(register.items); setThesisPagination(register.pagination)
    } catch (reason) { setError(reason instanceof InventoryApiError ? reason.message : 'Unable to load the research and thesis inventory.') }
    finally { setThesisLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => { void load(filters) }, 250); return () => window.clearTimeout(timer) }, [filters, load])
  useEffect(() => { void loadThesis(thesisFilters) }, [loadThesis, thesisFilters])

  const scan = useCallback(async (barcode: string) => {
    if (scanning) return
    setScanning(true); setError(null); setNotice(null)
    try {
      const thesis = thesisRows.find((row) => row.barcode.toUpperCase() === barcode.trim().toUpperCase())
      if (thesis) {
        setSelectedThesis(thesis)
        setNotice(`${thesis.accession_number} scanned. Select the audited thesis condition.`)
        return
      }
      const copy = await inventoryApi.scan(barcode); setNotice(`${copy.accession_number} verified successfully.`); await load(filters)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The scanned barcode could not be verified.') }
    finally { setScanning(false) }
  }, [filters, load, scanning, thesisRows])
  useDesktopScanner(scan, !selected && !availabilityTarget && !selectedThesis && !thesisAvailabilityTarget)

  const downloadPdf = async () => {
    setExportingPdf(true); setError(null)
    try { await inventoryApi.download('pdf'); setNotice('PDF inventory report downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the inventory report.') }
    finally { setExportingPdf(false) }
  }

  const downloadThesisPdf = async () => {
    setThesisExportingPdf(true); setError(null)
    try { await inventoryApi.downloadThesis('pdf'); setNotice('Thesis PDF report downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the thesis report.') }
    finally { setThesisExportingPdf(false) }
  }

  const requestAvailabilityChange = (copy: InventoryCopy) => {
    setAvailabilityError(null)
    setAvailabilityTarget(copy)
  }

  const confirmAvailabilityChange = async () => {
    if (!availabilityTarget) return
    const next = availabilityTarget.availability_status === 'Available' ? 'unavailable' : 'available'
    setAvailabilitySaving(true); setAvailabilityError(null); setError(null); setNotice(null)
    try {
      const updated = await inventoryApi.changeAvailability(availabilityTarget.barcode, next)
      setNotice(`${availabilityTarget.accession_number} is now ${updated.availability_status}.`)
      setAvailabilityTarget(null)
      await load(filters)
    } catch (reason) { setAvailabilityError(reason instanceof Error ? reason.message : 'Unable to update availability.') }
    finally { setAvailabilitySaving(false) }
  }

  const requestThesisAvailabilityChange = (copy: ThesisInventoryRow) => {
    setAvailabilityError(null)
    setThesisAvailabilityTarget(copy)
  }

  const confirmThesisAvailabilityChange = async () => {
    if (!thesisAvailabilityTarget) return
    const next = thesisAvailabilityTarget.availability_status === 'available' ? 'unavailable' : 'available'
    setAvailabilitySaving(true); setAvailabilityError(null); setError(null); setNotice(null)
    try {
      const updated = await inventoryApi.changeThesisAvailability(thesisAvailabilityTarget.barcode, next)
      setNotice(`${thesisAvailabilityTarget.accession_number} is now ${updated.availability_status}.`)
      setThesisAvailabilityTarget(null)
      await loadThesis(thesisFilters)
    } catch (reason) { setAvailabilityError(reason instanceof Error ? reason.message : 'Unable to update thesis availability.') }
    finally { setAvailabilitySaving(false) }
  }

  const completeRemoval = async (action: 'deleted' | 'archived') => {
    const target = removalTarget
    if (!target) return
    setRemovalTarget(null)
    setNotice(`${target.accession_number} ${action} successfully.`)
    if (target.kind === 'book') {
      const nextFilters = copies.length === 1 && pagination.page > 1
        ? { ...filters, page: pagination.page - 1 }
        : filters
      if (nextFilters.page !== filters.page) setFilters(nextFilters)
      else await load(nextFilters)
      return
    }
    const nextFilters = thesisRows.length === 1 && thesisPagination.page > 1
      ? { ...thesisFilters, page: thesisPagination.page - 1 }
      : thesisFilters
    if (nextFilters.page !== thesisFilters.page) setThesisFilters(nextFilters)
    else await loadThesis(nextFilters)
  }

  return <div className="flex flex-col">
    <PageHeader eyebrow="Collection control" title="Inventory management" description="Verify accessioned copies, track physical condition, and protect unavailable assets from reservation workflows." action={<button disabled={exportingPdf} onClick={() => void downloadPdf()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={15} />{exportingPdf ? 'Preparing PDF…' : 'Download PDF'}</button>} />
    {error ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={17} /></button></div> : null}
    {notice ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-4 text-sm font-semibold text-[#003399]" role="status"><span className="flex items-center gap-2"><CheckCircle2 size={17} />{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={17} /></button></div> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Catalog materials" value={summary.total_catalog_materials} note="Active title records" icon={PackageSearch} tone="blue" /><StatCard label="Physical copies" value={summary.total_physical_copies} note="Active accession rows" icon={BookCopy} tone="blue" /><StatCard label="Damaged copies" value={summary.damaged_copies_count} note="Audited condition records" icon={AlertTriangle} tone="amber" /><StatCard label="Lost copies" value={summary.lost_copies_count} note="Forced unavailable" icon={XCircle} tone="red" /></div>
    <section aria-labelledby="thesis-inventory-title" className="order-[4] mb-8 mt-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <SectionCard className="p-5"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#003399] text-[#FFFFFF]"><GraduationCap size={21} /></span><p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#003399]/60">Published papers</p><p className="mt-1 text-3xl font-black text-[#003399]">{thesisSummary.total_thesis_materials}</p></SectionCard>
        <SectionCard className="p-5"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF200]/45 text-[#003399]"><AlertTriangle size={21} /></span><p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#003399]/60">Damaged research copies</p><p className="mt-1 text-3xl font-black text-[#003399]">{thesisSummary.damaged_thesis_count}</p></SectionCard>
        <SectionCard className="p-5"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF200] text-[#003399]"><XCircle size={21} /></span><p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#003399]/60">Lost research papers</p><p className="mt-1 text-3xl font-black text-[#003399]">{thesisSummary.lost_thesis_count}</p></SectionCard>
      </div>
      <SectionCard className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#003399]/15 p-5 sm:flex-row sm:items-center"><h2 id="thesis-inventory-title" className="flex-1 text-lg font-black text-[#003399]">Research and thesis inventory</h2><button disabled={thesisExportingPdf} onClick={() => void downloadThesisPdf()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><FileText size={15} />{thesisExportingPdf ? 'Preparing Thesis PDF…' : 'Download Thesis PDF'}</button></div>
        <form onSubmit={(event) => { event.preventDefault(); setThesisFilters({ ...thesisDraftFilters, page: 1 }) }} className="grid gap-3 border-b border-[#003399]/15 bg-[#003399]/5 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_140px_auto_auto]">
          <label className="relative"><span className="sr-only">Search research inventory</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45" size={15} /><input value={thesisDraftFilters.query} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Title, author, adviser, barcode…" className="h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-9 pr-3 text-sm text-[#003399] outline-none focus:ring-2 focus:ring-[#003399]/20" /></label>
          <select aria-label="Filter research by condition" value={thesisDraftFilters.conditionState} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, conditionState: event.target.value }))} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399]"><option value="">All conditions</option><option value="good">Good</option><option value="fair">Fair</option><option value="for_repair">For repair</option><option value="damaged">Damaged</option><option value="lost">Lost</option></select>
          <select aria-label="Filter research by availability" value={thesisDraftFilters.availabilityStatus} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, availabilityStatus: event.target.value }))} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399]"><option value="">All availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="borrowed">Borrowed</option><option value="reserved">Reserved</option></select>
          <input aria-label="Filter research by publication year" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={thesisDraftFilters.publicationYear} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, publicationYear: event.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="Year" className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:ring-2 focus:ring-[#003399]/20" />
          <button type="submit" disabled={thesisLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50"><Search size={15} />{thesisLoading ? 'Searching…' : 'Search'}</button>
          <button type="button" onClick={() => { setThesisDraftFilters(DEFAULT_THESIS_FILTERS); setThesisFilters(DEFAULT_THESIS_FILTERS) }} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399]">Clear</button>
        </form>
        <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="px-4 py-3">Title and authors</th><th className="px-4 py-3">Adviser / year</th><th className="px-4 py-3">Accession / barcode</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-[#003399]/10">
          {thesisLoading && thesisRows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-[#003399]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading research inventory…</td></tr> : null}
          {!thesisLoading && thesisRows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center"><GraduationCap className="mx-auto text-[#003399]/45" size={28} /><p className="mt-3 font-bold text-[#003399]">No bound research papers found</p></td></tr> : null}
          {thesisRows.map((thesis) => { const activeCirculation = thesis.availability_status === 'borrowed' || thesis.availability_status === 'reserved'; const availabilityLocked = activeCirculation || thesis.condition_state === 'lost'; const removalLocked = activeCirculation || thesis.condition_state !== 'lost'; const removalTitle = activeCirculation ? 'Resolve the active allocation before removing this research copy.' : thesis.condition_state !== 'lost' ? 'Mark this research copy as Lost before removing it.' : 'Remove this Lost research copy from active inventory.'; return <tr key={thesis.research_inventory_id} className="hover:bg-[#003399]/5"><td className="px-4 py-4"><p className="font-bold text-[#003399]">{thesis.title}</p><p className="mt-1 text-xs text-[#003399]/60">{thesis.authors}</p></td><td className="px-4 py-4 text-[#003399]"><p>{thesis.adviser}</p><p className="mt-1 text-xs text-[#003399]/60">{thesis.publication_year}</p></td><td className="px-4 py-4 font-mono text-xs text-[#003399]"><p className="font-bold">{thesis.accession_number}</p><p className="mt-1 text-[#003399]/60">{thesis.barcode}</p></td><td className="px-4 py-4 text-[#003399]">{thesis.shelf_location}</td><td className="px-4 py-4"><ConditionBadge condition={displayThesisCondition(thesis.condition_state)} /></td><td className="px-4 py-4"><AvailabilityBadge status={displayThesisAvailability(thesis.availability_status)} /></td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button onClick={() => setSelectedThesis(thesis)} className="rounded-lg border border-[#003399]/20 px-3 py-2 text-xs font-bold text-[#003399]">Audit condition</button><button disabled={availabilityLocked} onClick={() => requestThesisAvailabilityChange(thesis)} title={availabilityLocked ? 'Borrowed, reserved, or lost papers cannot be manually toggled.' : 'Toggle thesis availability'} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-[#FFFFFF] disabled:cursor-not-allowed disabled:opacity-40">{thesis.availability_status === 'available' ? 'Make unavailable' : 'Make available'}</button><button aria-label={`Delete ${thesis.accession_number}`} disabled={removalLocked} title={removalTitle} onClick={() => setRemovalTarget({ kind: 'thesis', id: thesis.research_inventory_id, item_title: thesis.item_title, accession_number: thesis.accession_number, barcode: thesis.barcode })} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399] disabled:cursor-not-allowed disabled:opacity-40">Delete</button></div></td></tr>})}
        </tbody></table></div>
        <div className="flex flex-col gap-3 border-t border-[#003399]/15 p-4 text-xs text-[#003399]/70 sm:flex-row sm:items-center sm:justify-between"><span>{thesisPagination.total} research {thesisPagination.total === 1 ? 'record' : 'records'}</span><div className="flex items-center gap-2"><button disabled={thesisPagination.page <= 1 || thesisLoading} onClick={() => setThesisFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#003399]">Page {thesisPagination.page} of {Math.max(thesisPagination.total_pages, 1)}</span><button disabled={thesisPagination.page >= thesisPagination.total_pages || thesisLoading} onClick={() => setThesisFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
      </SectionCard>
    </section>
    <SectionCard className="order-[2] mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><ScanBarcode size={22} /></span><div className="flex-1"><h2 className="font-bold text-[#003399]">Desktop scanner listener</h2><p className="mt-1 text-xs text-[#003399]/65">Scan a barcode at normal scanner speed and press Enter. Verification is recorded without refreshing the page.</p></div><span className="inline-flex items-center gap-2 rounded-xl bg-[#003399] px-4 py-2 text-xs font-bold text-[#FFFFFF]"><span className={cn('h-2 w-2 rounded-full bg-[#FFF200]', scanning && 'animate-pulse')} />{scanning ? 'Verifying scan' : 'Scanner listening'}</span></SectionCard>
    <SectionCard className="order-[3] overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#003399]/15 p-4 lg:flex-row lg:items-center"><h2 className="flex-1 font-bold text-[#003399]">Physical copy register</h2><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45" size={15} /><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, page: 1, query: event.target.value }))} placeholder="Title, author, barcode, accession…" className="h-10 w-full rounded-xl border border-[#003399]/20 bg-[#003399]/5 pl-9 pr-3 text-sm text-[#003399] outline-none focus:bg-[#FFFFFF] lg:w-72" /></label><select aria-label="Filter by condition" value={filters.conditionState} onChange={(event) => setFilters((current) => ({ ...current, page: 1, conditionState: event.target.value }))} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399]"><option value="">All conditions</option>{['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => void load(filters)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399]"><RefreshCw className={cn(loading && 'animate-spin')} size={15} />Refresh</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="px-5 py-3">Item title</th><th className="px-5 py-3">Accession</th><th className="px-5 py-3">Barcode</th><th className="px-5 py-3">Shelf</th><th className="px-5 py-3">Condition</th><th className="px-5 py-3">Availability</th><th className="px-5 py-3">Last verified</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-[#003399]/10">
        {loading && copies.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center text-[#003399]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading physical inventory…</td></tr> : null}
        {!loading && copies.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center"><Barcode className="mx-auto text-[#003399]/45" size={28} /><p className="mt-3 font-bold text-[#003399]">No physical copies found</p></td></tr> : null}
        {copies.map((copy) => { const activeCirculation = copy.availability_status === 'Borrowed' || copy.availability_status === 'Reserved'; const availabilityLocked = activeCirculation || copy.condition_status === 'Lost'; const removalLocked = activeCirculation || copy.condition_status !== 'Lost'; const removalTitle = activeCirculation ? 'Process the return or cancel the reservation before removing this copy.' : copy.condition_status !== 'Lost' ? 'Mark this copy as Lost before removing it.' : 'Remove this Lost copy from active inventory.'; return <tr key={copy.physical_copy_id} className="hover:bg-[#003399]/5"><td className="px-5 py-4"><p className="font-bold text-[#003399]">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/60">{copy.authors.join(', ') || copy.category_name || 'No author metadata'}</p></td><td className="px-5 py-4 font-mono text-xs font-bold text-[#003399]">{copy.accession_number}</td><td className="px-5 py-4 font-mono text-xs text-[#003399]/70">{copy.barcode}</td><td className="px-5 py-4 text-[#003399]">{copy.shelf_location}</td><td className="px-5 py-4"><ConditionBadge condition={copy.condition_status} /></td><td className="px-5 py-4"><AvailabilityBadge status={copy.availability_status} /></td><td className="px-5 py-4 text-xs text-[#003399]/70">{formatDate(copy.last_verified_at)}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button onClick={() => setSelected(copy)} title="Change physical condition" className="rounded-lg border border-[#003399]/20 px-3 py-2 text-xs font-bold text-[#003399]">Condition</button><button onClick={() => requestAvailabilityChange(copy)} disabled={availabilityLocked} title={availabilityLocked ? 'Active circulation and Lost copies cannot be manually toggled.' : 'Toggle availability manually'} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-[#FFFFFF] disabled:cursor-not-allowed disabled:opacity-40">{copy.availability_status === 'Available' ? 'Make unavailable' : 'Make available'}</button><button aria-label={`Delete ${copy.accession_number}`} disabled={removalLocked} title={removalTitle} onClick={() => setRemovalTarget({ kind: 'book', id: copy.physical_copy_id, item_title: copy.item_title, accession_number: copy.accession_number, barcode: copy.barcode })} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399] disabled:cursor-not-allowed disabled:opacity-40">Delete</button></div></td></tr>})}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-[#003399]/15 p-4 text-xs text-[#003399]/70"><span>{pagination.total} physical {pagination.total === 1 ? 'copy' : 'copies'}</span><div className="flex items-center gap-2"><button disabled={pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#003399]">Page {pagination.page} of {Math.max(pagination.total_pages, 1)}</span><button disabled={pagination.page >= pagination.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
    </SectionCard>
    {selected ? <ConditionModal copy={selected} onClose={() => setSelected(null)} onSaved={() => load(filters)} saveCondition={inventoryApi.changeCondition} /> : null}
    {selectedThesis ? <ConditionModal copy={selectedThesis} onClose={() => setSelectedThesis(null)} onSaved={() => loadThesis(thesisFilters)} saveCondition={inventoryApi.auditThesis} /> : null}
    {availabilityTarget ? <AvailabilityConfirmationDialog copy={availabilityTarget} saving={availabilitySaving} error={availabilityError} onCancel={() => { if (!availabilitySaving) setAvailabilityTarget(null) }} onConfirm={() => void confirmAvailabilityChange()} /> : null}
    {thesisAvailabilityTarget ? <AvailabilityConfirmationDialog copy={thesisAvailabilityTarget} saving={availabilitySaving} error={availabilityError} onCancel={() => { if (!availabilitySaving) setThesisAvailabilityTarget(null) }} onConfirm={() => void confirmThesisAvailabilityChange()} /> : null}
    {removalTarget ? <InventoryRemovalDialog
      key={`${removalTarget.kind}-${removalTarget.id}`}
      target={removalTarget}
      deleteItem={() => removalTarget.kind === 'book'
        ? inventoryApi.deleteBookCopy(removalTarget.id)
        : inventoryApi.deleteThesisCopy(removalTarget.id)}
      archiveItem={(reason) => removalTarget.kind === 'book'
        ? inventoryApi.archiveBookCopy(removalTarget.id, reason)
        : inventoryApi.archiveThesisCopy(removalTarget.id, reason)}
      onCancel={() => setRemovalTarget(null)}
      onCompleted={completeRemoval}
    /> : null}
  </div>
}
