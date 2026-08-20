import {
  AlertTriangle, Barcode, BookCopy, CheckCircle2, Download, PackageSearch,
  RefreshCw, ScanBarcode, Search, ShieldAlert, X, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageHeader, SectionCard, StatCard, cn } from '../../components/ui'
import { inventoryApi, InventoryApiError } from './inventory-api'
import type { InventoryCopy, InventoryFilters, InventoryPagination, InventorySummary } from './types'
import { useDesktopScanner } from './useDesktopScanner'

const EMPTY_SUMMARY: InventorySummary = { total_catalog_materials: 0, total_physical_copies: 0, damaged_copies_count: 0, lost_copies_count: 0 }
const DEFAULT_FILTERS: InventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '' }
const EMPTY_PAGINATION: InventoryPagination = { page: 1, limit: 25, total: 0, total_pages: 0 }

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

function ConditionModal({ copy, onClose, onSaved }: { copy: InventoryCopy; onClose: () => void; onSaved: () => Promise<void> }) {
  const [condition, setCondition] = useState<'damaged' | 'lost'>('damaged')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null)
    try { await inventoryApi.changeCondition(copy.barcode, condition); await onSaved(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this physical copy.') }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#003399]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="condition-title">
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl shadow-[#003399]/25">
      <div className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Audit status override</p><h2 id="condition-title" className="mt-1 text-xl font-bold text-[#003399]">Mark copy as unavailable</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5"><X size={18} /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#003399]/5 p-4 text-sm text-[#003399]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current: <strong>{copy.condition_status}</strong> · {copy.availability_status}</p></div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
        <fieldset><legend className="mb-2 text-sm font-bold text-[#003399]">New condition</legend><div className="grid grid-cols-2 gap-3">{(['damaged', 'lost'] as const).map((value) => <label key={value} className={cn('cursor-pointer rounded-xl border p-4 text-sm font-bold capitalize transition', condition === value ? 'border-[#003399] bg-[#FFF200] text-[#003399]' : 'border-[#003399]/15 bg-[#FFFFFF] text-[#003399]')}><input className="sr-only" type="radio" name="condition" value={value} checked={condition === value} onChange={() => setCondition(value)} />{value === 'damaged' ? <AlertTriangle className="mb-2" size={20} /> : <XCircle className="mb-2" size={20} />}{value}</label>)}</div></fieldset>
        <div className="flex gap-3 rounded-xl border border-[#003399]/20 bg-[#FFF200]/40 p-3 text-xs leading-5 text-[#003399]"><ShieldAlert className="mt-0.5 shrink-0" size={17} /><p>Confirmation sets availability to <strong>Unavailable</strong>. Student mobile reservations will be blocked for this asset copy.</p></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#003399]/15 p-5"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399] disabled:opacity-50">Cancel</button><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : <ShieldAlert size={15} />}{saving ? 'Updating…' : 'Confirm override'}</button></div>
    </form>
  </div>
}

export function InventoryDashboard() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [copies, setCopies] = useState<InventoryCopy[]>([])
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [selected, setSelected] = useState<InventoryCopy | null>(null)

  const load = useCallback(async (nextFilters: InventoryFilters) => {
    setLoading(true); setError(null)
    try {
      const [nextSummary, register] = await Promise.all([inventoryApi.summary(), inventoryApi.copies(nextFilters)])
      setSummary(nextSummary); setCopies(register.items); setPagination(register.pagination)
    } catch (reason) { setError(reason instanceof InventoryApiError ? reason.message : 'Unable to load the inventory register.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => { void load(filters) }, 250); return () => window.clearTimeout(timer) }, [filters, load])

  const scan = useCallback(async (barcode: string) => {
    if (scanning) return
    setScanning(true); setError(null); setNotice(null)
    try { const copy = await inventoryApi.scan(barcode); setNotice(`${copy.accession_number} verified successfully.`); await load(filters) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The scanned barcode could not be verified.') }
    finally { setScanning(false) }
  }, [filters, load, scanning])
  useDesktopScanner(scan, !selected)

  const download = async (format: 'csv' | 'pdf') => {
    setExporting(format); setError(null)
    try { await inventoryApi.download(format); setNotice(`${format.toUpperCase()} inventory report downloaded.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the inventory report.') }
    finally { setExporting(null) }
  }

  return <>
    <PageHeader eyebrow="Collection control" title="Inventory management" description="Verify accessioned copies, track physical condition, and protect unavailable assets from reservation workflows." action={<div className="flex flex-wrap gap-2"><button disabled={exporting !== null} onClick={() => void download('csv')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={15} />{exporting === 'csv' ? 'Preparing CSV…' : 'CSV'}</button><button disabled={exporting !== null} onClick={() => void download('pdf')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={15} />{exporting === 'pdf' ? 'Preparing PDF…' : 'PDF'}</button></div>} />
    {error ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={17} /></button></div> : null}
    {notice ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-4 text-sm font-semibold text-[#003399]" role="status"><span className="flex items-center gap-2"><CheckCircle2 size={17} />{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={17} /></button></div> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Catalog materials" value={summary.total_catalog_materials} note="Active title records" icon={PackageSearch} tone="blue" /><StatCard label="Physical copies" value={summary.total_physical_copies} note="Active accession rows" icon={BookCopy} tone="blue" /><StatCard label="Damaged copies" value={summary.damaged_copies_count} note="Unavailable for reservation" icon={AlertTriangle} tone="amber" /><StatCard label="Lost copies" value={summary.lost_copies_count} note="Missing from collection" icon={XCircle} tone="red" /></div>
    <SectionCard className="mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><ScanBarcode size={22} /></span><div className="flex-1"><h2 className="font-bold text-[#003399]">Desktop scanner listener</h2><p className="mt-1 text-xs text-[#003399]/65">Scan a barcode at normal scanner speed and press Enter. Verification is recorded without refreshing the page.</p></div><span className="inline-flex items-center gap-2 rounded-xl bg-[#003399] px-4 py-2 text-xs font-bold text-[#FFFFFF]"><span className={cn('h-2 w-2 rounded-full bg-[#FFF200]', scanning && 'animate-pulse')} />{scanning ? 'Verifying scan' : 'Scanner listening'}</span></SectionCard>
    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#003399]/15 p-4 lg:flex-row lg:items-center"><div className="flex-1"><h2 className="font-bold text-[#003399]">Physical copy register</h2><p className="mt-1 text-xs text-[#003399]/65">Accession, condition, availability, and latest verification</p></div><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45" size={15} /><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, page: 1, query: event.target.value }))} placeholder="Title, author, barcode, accession…" className="h-10 w-full rounded-xl border border-[#003399]/20 bg-[#003399]/5 pl-9 pr-3 text-sm text-[#003399] outline-none focus:bg-[#FFFFFF] lg:w-72" /></label><select aria-label="Filter by condition" value={filters.conditionState} onChange={(event) => setFilters((current) => ({ ...current, page: 1, conditionState: event.target.value }))} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399]"><option value="">All conditions</option>{['New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost'].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => void load(filters)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399]"><RefreshCw className={cn(loading && 'animate-spin')} size={15} />Refresh</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="px-5 py-3">Item title</th><th className="px-5 py-3">Accession</th><th className="px-5 py-3">Barcode</th><th className="px-5 py-3">Shelf</th><th className="px-5 py-3">Condition</th><th className="px-5 py-3">Availability</th><th className="px-5 py-3">Last verified</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-[#003399]/10">
        {loading && copies.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center text-[#003399]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading physical inventory…</td></tr> : null}
        {!loading && copies.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center"><Barcode className="mx-auto text-[#003399]/45" size={28} /><p className="mt-3 font-bold text-[#003399]">No physical copies found</p><p className="mt-1 text-xs text-[#003399]/65">Add copies through Books &amp; Research or clear the current filters.</p></td></tr> : null}
        {copies.map((copy) => <tr key={copy.physical_copy_id} className="hover:bg-[#003399]/5"><td className="px-5 py-4"><p className="font-bold text-[#003399]">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/60">{copy.authors.join(', ') || copy.category_name || 'No author metadata'}</p></td><td className="px-5 py-4 font-mono text-xs font-bold text-[#003399]">{copy.accession_number}</td><td className="px-5 py-4 font-mono text-xs text-[#003399]/70">{copy.barcode}</td><td className="px-5 py-4 text-[#003399]">{copy.shelf_location}</td><td className="px-5 py-4"><ConditionBadge condition={copy.condition_status} /></td><td className="px-5 py-4"><AvailabilityBadge status={copy.availability_status} /></td><td className="px-5 py-4 text-xs text-[#003399]/70">{formatDate(copy.last_verified_at)}</td><td className="px-5 py-4"><button onClick={() => setSelected(copy)} disabled={copy.availability_status === 'Borrowed' || copy.availability_status === 'Reserved'} title={copy.availability_status === 'Borrowed' || copy.availability_status === 'Reserved' ? 'Return or reassign this copy before overriding its condition.' : 'Change physical condition'} className="rounded-lg border border-[#003399]/20 px-3 py-2 text-xs font-bold text-[#003399] disabled:cursor-not-allowed disabled:opacity-40">Set condition</button></td></tr>)}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-[#003399]/15 p-4 text-xs text-[#003399]/70"><span>{pagination.total} physical {pagination.total === 1 ? 'copy' : 'copies'}</span><div className="flex items-center gap-2"><button disabled={pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#003399]">Page {pagination.page} of {Math.max(pagination.total_pages, 1)}</span><button disabled={pagination.page >= pagination.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
    </SectionCard>
    {selected ? <ConditionModal copy={selected} onClose={() => setSelected(null)} onSaved={() => load(filters)} /> : null}
  </>
}
