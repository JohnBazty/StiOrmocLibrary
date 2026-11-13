import { ResponsiveTable } from '../../components/ResponsiveTable'
import { AlertTriangle, CheckCircle2, FileText, GraduationCap, RefreshCw, Search, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { SectionCard } from '../../components/ui'
import { inventoryApi, InventoryApiError } from './inventory-api'
import type { InventoryPagination, InventoryRemovalTarget, ThesisInventoryFilters, ThesisInventoryRow, ThesisInventorySummary } from './types'
import { useDesktopScanner } from './useDesktopScanner'
import { InventoryRemovalDialog } from './InventoryRemovalDialog'
import { AvailabilityBadge, AvailabilityConfirmationDialog, ConditionBadge, ConditionModal, InventoryActions } from './inventory-parts'

const EMPTY_PAGINATION: InventoryPagination = { page: 1, limit: 25, total: 0, total_pages: 0 }
const EMPTY_THESIS_SUMMARY: ThesisInventorySummary = { total_thesis_materials: 0, damaged_thesis_count: 0, lost_thesis_count: 0 }
const DEFAULT_THESIS_FILTERS: ThesisInventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '', publicationYear: '' }

function displayThesisCondition(value: string) {
  return value === 'for_repair' ? 'For Repair' : value.charAt(0).toUpperCase() + value.slice(1)
}

function displayThesisAvailability(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function ThesisInventorySection() {
  const [thesisSummary, setThesisSummary] = useState(EMPTY_THESIS_SUMMARY)
  const [thesisRows, setThesisRows] = useState<ThesisInventoryRow[]>([])
  const [thesisPagination, setThesisPagination] = useState(EMPTY_PAGINATION)
  const [thesisDraftFilters, setThesisDraftFilters] = useState(DEFAULT_THESIS_FILTERS)
  const [thesisFilters, setThesisFilters] = useState(DEFAULT_THESIS_FILTERS)
  const [thesisLoading, setThesisLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedThesis, setSelectedThesis] = useState<ThesisInventoryRow | null>(null)
  const [thesisAvailabilityTarget, setThesisAvailabilityTarget] = useState<ThesisInventoryRow | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [thesisExportingPdf, setThesisExportingPdf] = useState(false)
  const [removalTarget, setRemovalTarget] = useState<InventoryRemovalTarget | null>(null)

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

  useEffect(() => { void loadThesis(thesisFilters) }, [loadThesis, thesisFilters])

  const scan = useCallback((barcode: string) => {
    setError(null); setNotice(null)
    const thesis = thesisRows.find((row) => row.barcode.toUpperCase() === barcode.trim().toUpperCase())
    if (!thesis) return
    setSelectedThesis(thesis)
    setNotice(`${thesis.accession_number} scanned. Select the audited thesis condition.`)
  }, [thesisRows])
  useDesktopScanner(scan, !selectedThesis && !thesisAvailabilityTarget && !removalTarget)

  const downloadThesisPdf = async () => {
    setThesisExportingPdf(true); setError(null)
    try { await inventoryApi.downloadThesis('pdf'); setNotice('Thesis PDF report downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the thesis report.') }
    finally { setThesisExportingPdf(false) }
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
    const nextFilters = thesisRows.length === 1 && thesisPagination.page > 1
      ? { ...thesisFilters, page: thesisPagination.page - 1 }
      : thesisFilters
    if (nextFilters.page !== thesisFilters.page) setThesisFilters(nextFilters)
    else await loadThesis(nextFilters)
  }

  return <>
    {error ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={17} /></button></div> : null}
    {notice ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-4 text-sm font-semibold text-[#003399]" role="status"><span className="flex items-center gap-2"><CheckCircle2 size={17} />{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={17} /></button></div> : null}
    <section aria-labelledby="thesis-inventory-title" className="mb-8 mt-8">
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
        <ResponsiveTable><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="px-4 py-3">Title and authors</th><th className="px-4 py-3">Adviser / year</th><th className="px-4 py-3">Accession / barcode</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-[#003399]/10">
          {thesisLoading && thesisRows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-[#003399]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading research inventory…</td></tr> : null}
          {!thesisLoading && thesisRows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center"><GraduationCap className="mx-auto text-[#003399]/45" size={28} /><p className="mt-3 font-bold text-[#003399]">No bound research papers found</p></td></tr> : null}
          {thesisRows.map((thesis) => { const activeCirculation = thesis.availability_status === 'borrowed' || thesis.availability_status === 'reserved'; const availabilityLocked = activeCirculation || thesis.condition_state === 'lost'; const removalLocked = activeCirculation || thesis.condition_state !== 'lost'; const removalTitle = activeCirculation ? 'Resolve the active allocation before removing this research copy.' : thesis.condition_state !== 'lost' ? 'Mark this research copy as Lost before removing it.' : 'Remove this Lost research copy from active inventory.'; return <tr key={thesis.research_inventory_id} className="hover:bg-[#003399]/5"><td className="px-4 py-4"><p className="font-bold text-[#003399]">{thesis.title}</p><p className="mt-1 text-xs text-[#003399]/60">{thesis.authors}</p></td><td className="px-4 py-4 text-[#003399]"><p>{thesis.adviser || 'Not recorded'}</p><p className="mt-1 text-xs text-[#003399]/60">{thesis.publication_year}</p></td><td className="px-4 py-4 font-mono text-xs text-[#003399]"><p className="font-bold">{thesis.accession_number}</p><p className="mt-1 text-[#003399]/60">{thesis.barcode}</p></td><td className="px-4 py-4 text-[#003399]">{thesis.shelf_location}</td><td className="px-4 py-4"><ConditionBadge condition={displayThesisCondition(thesis.condition_state)} /></td><td className="px-4 py-4"><AvailabilityBadge status={displayThesisAvailability(thesis.availability_status)} /></td><td className="px-4 py-4"><InventoryActions accession={thesis.accession_number} actions={[
            { label: 'Audit condition', onSelect: () => setSelectedThesis(thesis) },
            { label: thesis.availability_status === 'available' ? 'Make unavailable' : 'Make available', disabled: availabilityLocked,
              description: availabilityLocked ? 'Borrowed, reserved, or lost papers cannot be manually toggled.' : 'Toggle thesis availability',
              onSelect: () => requestThesisAvailabilityChange(thesis) },
            { label: 'Delete', destructive: true, disabled: removalLocked, description: removalTitle,
              onSelect: () => setRemovalTarget({ kind: 'thesis', id: thesis.research_inventory_id, item_title: thesis.item_title, accession_number: thesis.accession_number, barcode: thesis.barcode }) },
          ]} /></td></tr>})}
        </tbody></table></ResponsiveTable>
        <div className="flex flex-col gap-3 border-t border-[#003399]/15 p-4 text-xs text-[#003399]/70 sm:flex-row sm:items-center sm:justify-between"><span>{thesisPagination.total} research {thesisPagination.total === 1 ? 'record' : 'records'}</span><div className="flex items-center gap-2"><button disabled={thesisPagination.page <= 1 || thesisLoading} onClick={() => setThesisFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#003399]">Page {thesisPagination.page} of {Math.max(thesisPagination.total_pages, 1)}</span><button disabled={thesisPagination.page >= thesisPagination.total_pages || thesisLoading} onClick={() => setThesisFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#003399]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
      </SectionCard>
    </section>
    {selectedThesis ? <ConditionModal copy={selectedThesis} onClose={() => setSelectedThesis(null)} onSaved={() => loadThesis(thesisFilters)} saveCondition={inventoryApi.auditThesis} /> : null}
    {thesisAvailabilityTarget ? <AvailabilityConfirmationDialog copy={thesisAvailabilityTarget} saving={availabilitySaving} error={availabilityError} onCancel={() => { if (!availabilitySaving) setThesisAvailabilityTarget(null) }} onConfirm={() => void confirmThesisAvailabilityChange()} /> : null}
    {removalTarget ? <InventoryRemovalDialog
      key={`${removalTarget.kind}-${removalTarget.id}`}
      target={removalTarget}
      deleteItem={() => inventoryApi.deleteThesisCopy(removalTarget.id)}
      archiveItem={(reason) => inventoryApi.archiveThesisCopy(removalTarget.id, reason)}
      onCancel={() => setRemovalTarget(null)}
      onCompleted={completeRemoval}
    /> : null}
  </>
}
