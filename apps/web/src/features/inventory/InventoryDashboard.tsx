import { ResponsiveTable } from '../../components/ResponsiveTable'
import { AlertTriangle, Barcode, BookCopy, CheckCircle2, Download, PackageSearch, RefreshCw, ScanBarcode, Search, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SectionCard, StatCard, cn } from '../../components/ui'
import { inventoryApi, InventoryApiError } from './inventory-api'
import type { InventoryCopy, InventoryFilters, InventoryPagination, InventoryRemovalTarget, InventorySummary } from './types'
import { useDesktopScanner } from './useDesktopScanner'
import { InventoryRemovalDialog } from './InventoryRemovalDialog'
import { AvailabilityBadge, AvailabilityConfirmationDialog, ConditionBadge, ConditionModal, InventoryActions } from './inventory-parts'

const EMPTY_SUMMARY: InventorySummary = { total_catalog_materials: 0, total_physical_copies: 0, damaged_copies_count: 0, lost_copies_count: 0 }
const DEFAULT_FILTERS: InventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '' }
const EMPTY_PAGINATION: InventoryPagination = { page: 1, limit: 25, total: 0, total_pages: 0 }

function formatDate(value: string | null) {
  if (!value) return 'Never verified'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date)
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
  const [exportingPdf, setExportingPdf] = useState(false)
  const [selected, setSelected] = useState<InventoryCopy | null>(null)
  const [lostTarget, setLostTarget] = useState<InventoryCopy | null>(null)
  const [availabilityTarget, setAvailabilityTarget] = useState<InventoryCopy | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
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

  useEffect(() => { const timer = window.setTimeout(() => { void load(filters) }, 250); return () => window.clearTimeout(timer) }, [filters, load])

  const scan = useCallback(async (barcode: string) => {
    if (scanning) return
    setScanning(true); setError(null); setNotice(null)
    try {
      const copy = await inventoryApi.scan(barcode); setNotice(`${copy.accession_number} verified successfully.`); await load(filters)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The scanned barcode could not be verified.') }
    finally { setScanning(false) }
  }, [filters, load, scanning])
  useDesktopScanner(scan, !selected && !lostTarget && !availabilityTarget)

  const downloadPdf = async () => {
    setExportingPdf(true); setError(null)
    try { await inventoryApi.download('pdf'); setNotice('PDF inventory report downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the inventory report.') }
    finally { setExportingPdf(false) }
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

  const completeRemoval = async (action: 'deleted' | 'archived') => {
    const target = removalTarget
    if (!target) return
    setRemovalTarget(null)
    setNotice(`${target.accession_number} ${action} successfully.`)
    const nextFilters = copies.length === 1 && pagination.page > 1
      ? { ...filters, page: pagination.page - 1 }
      : filters
    if (nextFilters.page !== filters.page) setFilters(nextFilters)
    else await load(nextFilters)
  }

  return <div className="flex flex-col">
    <PageHeader eyebrow="Collection control" title="Inventory management" description="Verify accessioned copies, track physical condition, and protect unavailable assets from reservation workflows." action={<button disabled={exportingPdf} onClick={() => void downloadPdf()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={15} />{exportingPdf ? 'Preparing PDF…' : 'Download PDF'}</button>} />
    {error ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={17} /></button></div> : null}
    {notice ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-4 text-sm font-semibold text-[#003399]" role="status"><span className="flex items-center gap-2"><CheckCircle2 size={17} />{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={17} /></button></div> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Catalog materials" value={summary.total_catalog_materials} note="Active title records" icon={PackageSearch} tone="blue" /><StatCard label="Physical copies" value={summary.total_physical_copies} note="Active accession rows" icon={BookCopy} tone="blue" /><StatCard label="Damaged copies" value={summary.damaged_copies_count} note="Audited condition records" icon={AlertTriangle} tone="amber" /><StatCard label="Lost copies" value={summary.lost_copies_count} note="Forced unavailable" icon={XCircle} tone="red" /></div>
    <p className="order-[4] mt-5 text-sm text-[#003399]">Research copies moved to <Link to="/librarian/research-maintenance" className="font-bold underline">Research maintenance</Link>.</p>
    <SectionCard className="order-[2] mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF200] text-[#003399]"><ScanBarcode size={22} /></span><div className="flex-1"><h2 className="font-bold text-[#003399]">Desktop scanner listener</h2><p className="mt-1 text-xs text-[#003399]/65">Scan a barcode at normal scanner speed and press Enter. Verification is recorded without refreshing the page.</p></div><span className="inline-flex items-center gap-2 rounded-xl bg-[#003399] px-4 py-2 text-xs font-bold text-[#FFFFFF]"><span className={cn('h-2 w-2 rounded-full bg-[#FFF200]', scanning && 'animate-pulse')} />{scanning ? 'Verifying scan' : 'Scanner listening'}</span></SectionCard>
    <SectionCard className="order-[3] overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#003399]/15 p-4 lg:flex-row lg:items-center"><h2 className="flex-1 font-bold text-[#003399]">Physical copy register</h2><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45" size={15} /><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, page: 1, query: event.target.value }))} placeholder="Title, author, barcode, accession…" className="h-10 w-full rounded-xl border border-[#003399]/20 bg-[#003399]/5 pl-9 pr-3 text-sm text-[#003399] outline-none focus:bg-[#FFFFFF] lg:w-72" /></label><select aria-label="Filter by condition" value={filters.conditionState} onChange={(event) => setFilters((current) => ({ ...current, page: 1, conditionState: event.target.value }))} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399]"><option value="">All conditions</option>{['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => void load(filters)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399]"><RefreshCw className={cn(loading && 'animate-spin')} size={15} />Refresh</button></div>
      <ResponsiveTable><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="px-5 py-3">Item title</th><th className="px-5 py-3">Accession</th><th className="px-5 py-3">Barcode</th><th className="px-5 py-3">Shelf</th><th className="px-5 py-3">Condition</th><th className="px-5 py-3">Availability</th><th className="px-5 py-3">Last verified</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-[#003399]/10">
        {loading && copies.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center text-[#003399]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading physical inventory…</td></tr> : null}
        {!loading && copies.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center"><Barcode className="mx-auto text-[#003399]/45" size={28} /><p className="mt-3 font-bold text-[#003399]">No physical copies found</p></td></tr> : null}
          {copies.map((copy) => { const activeCirculation = copy.availability_status === 'Borrowed' || copy.availability_status === 'Reserved'; const availabilityLocked = activeCirculation || copy.condition_status === 'Lost'; const removalLocked = activeCirculation || copy.condition_status !== 'Lost'; const removalTitle = activeCirculation ? 'Process the return or cancel the reservation before removing this copy.' : copy.condition_status !== 'Lost' ? 'Mark this copy as Lost before removing it.' : 'Remove this Lost copy from active inventory.'; return <tr key={copy.physical_copy_id} className="hover:bg-[#003399]/5"><td className="px-5 py-4"><p className="font-bold text-[#003399]">{copy.item_title}</p><p className="mt-1 text-xs text-[#003399]/60">{copy.authors.join(', ') || copy.category_name || 'No author metadata'}</p></td><td className="px-5 py-4 font-mono text-xs font-bold text-[#003399]">{copy.accession_number}</td><td className="px-5 py-4 font-mono text-xs text-[#003399]/70">{copy.barcode}</td><td className="px-5 py-4 text-[#003399]"><p className="font-bold">{copy.shelf_location} · C{copy.shelf_column} · R{copy.shelf_row}</p><p className="mt-1 font-mono text-[10px] text-[#003399]/60">{copy.call_number||'Call number pending'}</p></td><td className="px-5 py-4"><ConditionBadge condition={copy.condition_status} /></td><td className="px-5 py-4"><AvailabilityBadge status={copy.availability_status} /></td><td className="px-5 py-4 text-xs text-[#003399]/70">{formatDate(copy.last_verified_at)}</td><td className="px-5 py-4"><InventoryActions accession={copy.accession_number} actions={[
            { label: 'Condition', description: 'Change physical condition', onSelect: () => setSelected(copy) },
            ...(copy.condition_status !== 'Lost' ? [{ label: 'Report lost', disabled: copy.availability_status === 'Borrowed',
              description: copy.availability_status === 'Borrowed' ? 'Report a borrowed copy from Circulation.' : 'Record this copy as lost.',
              onSelect: () => setLostTarget(copy) }] : []),
            { label: copy.availability_status === 'Available' ? 'Make unavailable' : 'Make available', disabled: availabilityLocked,
              description: availabilityLocked ? 'Active circulation and Lost copies cannot be manually toggled.' : 'Toggle availability manually',
              onSelect: () => requestAvailabilityChange(copy) },
            { label: 'Delete', destructive: true, disabled: removalLocked, description: removalTitle,
              onSelect: () => setRemovalTarget({ kind: 'book', id: copy.physical_copy_id, item_title: copy.item_title, accession_number: copy.accession_number, barcode: copy.barcode }) },
          ]} /></td></tr>})}
      </tbody></table></ResponsiveTable>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-[#003399]/15 p-4 text-xs text-[#003399]/70"><span>{pagination.total} physical {pagination.total === 1 ? 'copy' : 'copies'}</span><div className="flex items-center gap-2"><button disabled={pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#003399]">Page {pagination.page} of {Math.max(pagination.total_pages, 1)}</span><button disabled={pagination.page >= pagination.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
    </SectionCard>
    {selected ? <ConditionModal copy={selected} onClose={() => setSelected(null)} onSaved={() => load(filters)} saveCondition={inventoryApi.changeCondition} /> : null}
    {lostTarget ? <ConditionModal copy={lostTarget} initialCondition="lost" onClose={() => setLostTarget(null)} onSaved={() => load(filters)} saveCondition={inventoryApi.changeCondition} /> : null}
    {availabilityTarget ? <AvailabilityConfirmationDialog copy={availabilityTarget} saving={availabilitySaving} error={availabilityError} onCancel={() => { if (!availabilitySaving) setAvailabilityTarget(null) }} onConfirm={() => void confirmAvailabilityChange()} /> : null}
    {removalTarget ? <InventoryRemovalDialog
      key={`${removalTarget.kind}-${removalTarget.id}`}
      target={removalTarget}
      deleteItem={() => inventoryApi.deleteBookCopy(removalTarget.id)}
      archiveItem={(reason) => inventoryApi.archiveBookCopy(removalTarget.id, reason)}
      onCancel={() => setRemovalTarget(null)}
      onCompleted={completeRemoval}
    /> : null}
  </div>
}
