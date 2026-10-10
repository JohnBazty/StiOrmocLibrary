import {
  AlertTriangle, CheckCircle2, ClipboardList, Download, RefreshCw, ScanBarcode, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { SectionCard, cn } from '../../components/ui'
import { inventoryApi, InventoryApiError } from './inventory-api'
import type { StocktakeDiscrepancy, StocktakeScopeOptions, StocktakeSession } from './types'
import { useDesktopScanner } from './useDesktopScanner'

const FINDING_LABELS: Record<string, string> = {
  present: 'Present',
  unknown: 'Unknown barcode',
  duplicate: 'Duplicate scan',
  out_of_scope: 'Out of scope',
  archived: 'Archived',
  wrong_location: 'Wrong location',
  borrowed_but_found: 'Borrowed but found',
  lost_but_found: 'Lost but found',
  missing: 'Missing',
  borrowed_out: 'Borrowed out',
  known_lost: 'Known lost',
}

function FindingBadge({ code }: { code: string }) {
  const label = FINDING_LABELS[code] ?? code
  const Icon = code === 'missing' || code === 'unknown' ? XCircle
    : code === 'wrong_location' || code === 'lost_but_found' ? AlertTriangle
      : CheckCircle2
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-bold text-[#003399]">
      <Icon size={13} aria-hidden />
      {label}
    </span>
  )
}

function newRequestKey() {
  return `stk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function StocktakePanel({ onSessionScanningChange }: { onSessionScanningChange?: (active: boolean) => void } = {}) {
  const formId = useId()
  const [sessions, setSessions] = useState<StocktakeSession[]>([])
  const [options, setOptions] = useState<StocktakeScopeOptions | null>(null)
  const [active, setActive] = useState<StocktakeSession | null>(null)
  const [findings, setFindings] = useState<StocktakeDiscrepancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [scopeKind, setScopeKind] = useState('shelf')
  const [scopeId, setScopeId] = useState('')
  const [assetKind, setAssetKind] = useState('book')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [observedShelfId, setObservedShelfId] = useState<number | ''>('')
  const [observedColumn, setObservedColumn] = useState('')
  const [observedRow, setObservedRow] = useState('')
  const [manualBarcode, setManualBarcode] = useState('')
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshList = useCallback(async () => {
    const [list, scopeOptions] = await Promise.all([
      inventoryApi.stocktakeSessions(1),
      inventoryApi.stocktakeScopeOptions(),
    ])
    setSessions(list.items)
    setOptions(scopeOptions)
    if (!observedShelfId && scopeOptions.shelves[0]) setObservedShelfId(scopeOptions.shelves[0].id)
  }, [observedShelfId])

  const openSession = useCallback(async (id: number) => {
    const [session, discrepancyPage] = await Promise.all([
      inventoryApi.stocktakeSession(id),
      inventoryApi.stocktakeDiscrepancies(id, 1),
    ])
    setActive(session)
    setFindings(discrepancyPage.items)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        await refreshList()
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load stocktakes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [refreshList])

  useEffect(() => {
    if (!options) return
    if (scopeKind === 'shelf' && options.shelves[0]) setScopeId(String(options.shelves[0].id))
    else if (scopeKind === 'category' && options.categories[0]) setScopeId(String(options.categories[0].id))
    else if (scopeKind === 'room' && options.rooms[0]) setScopeId(options.rooms[0].id)
    else setScopeId('')
  }, [scopeKind, options])

  useEffect(() => {
    if (!scopeKind || (scopeKind !== 'collection' && !scopeId)) {
      setPreviewCount(null)
      return
    }
    let cancelled = false
    void inventoryApi.stocktakePreview({
      scopeKind,
      scopeId: scopeKind === 'collection' ? undefined : scopeId,
      assetKind,
    }).then((preview) => {
      if (!cancelled) setPreviewCount(preview.expected_count)
    }).catch(() => {
      if (!cancelled) setPreviewCount(null)
    })
    return () => { cancelled = true }
  }, [scopeKind, scopeId, assetKind])

  const submitScan = useCallback(async (barcode: string, source: 'scanner' | 'manual') => {
    if (!active || active.status !== 'in_progress') return
    if (!observedShelfId) {
      setError('Select the observed shelf before scanning.')
      return
    }
    setBusy(true); setError(null)
    try {
      const result = await inventoryApi.stocktakeScan(active.stocktake_session_id, {
        requestKey: newRequestKey(),
        barcode,
        observedShelfId: Number(observedShelfId),
        observedColumn: observedColumn ? Number(observedColumn) : null,
        observedRow: observedRow ? Number(observedRow) : null,
        source,
      })
      const label = FINDING_LABELS[result.classification] ?? result.classification
      setLastScan(`${result.entered_barcode}: ${label}${result.title ? ` · ${result.title}` : ''}`)
      setNotice(lastScan ? `Latest scan: ${label}` : label)
      await openSession(active.stocktake_session_id)
      await refreshList()
    } catch (reason) {
      setError(reason instanceof InventoryApiError ? reason.message : 'Unable to record this scan.')
    } finally { setBusy(false) }
  }, [active, observedShelfId, observedColumn, observedRow, openSession, refreshList, lastScan])

  const sessionScanning = Boolean(active && active.status === 'in_progress' && !busy)
  useEffect(() => { onSessionScanningChange?.(sessionScanning) }, [sessionScanning, onSessionScanningChange])
  useDesktopScanner((barcode) => { void submitScan(barcode, 'scanner') }, sessionScanning)

  const createSession = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(null)
    try {
      const created = await inventoryApi.createStocktake({
        name,
        scopeKind,
        scopeId: scopeKind === 'collection' ? null : scopeId,
        assetKind,
      })
      setName('')
      setNotice(`Started “${created.session_name}” with ${created.expected_count} expected items.`)
      await refreshList()
      await openSession(created.stocktake_session_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start stocktake.')
    } finally { setBusy(false) }
  }

  const closeActive = async () => {
    if (!active) return
    setBusy(true); setError(null)
    try {
      const closed = await inventoryApi.closeStocktake(active.stocktake_session_id)
      setNotice('Stocktake closed. Findings are frozen for review.')
      await openSession(closed!.stocktake_session_id)
      await refreshList()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to close stocktake.')
    } finally { setBusy(false) }
  }

  const reviewActive = async () => {
    if (!active) return
    setBusy(true); setError(null)
    try {
      await inventoryApi.reviewStocktake(active.stocktake_session_id)
      setNotice('Stocktake marked reviewed.')
      await openSession(active.stocktake_session_id)
      await refreshList()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to mark reviewed.')
    } finally { setBusy(false) }
  }

  const resolveFinding = async (finding: StocktakeDiscrepancy, action: 'dismiss' | 'confirm_found_at_home') => {
    if (!active) return
    const reason = window.prompt(action === 'dismiss' ? 'Reason for dismissal' : 'Reason for confirming found at home')
    if (!reason?.trim()) return
    setBusy(true); setError(null)
    try {
      await inventoryApi.resolveStocktakeFinding(active.stocktake_session_id, finding.stocktake_discrepancy_id, {
        expectedRowVersion: finding.row_version,
        action,
        reason: reason.trim(),
      })
      await openSession(active.stocktake_session_id)
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Unable to resolve finding.')
    } finally { setBusy(false) }
  }

  const observedShelf = options?.shelves.find((shelf) => shelf.id === Number(observedShelfId))

  return (
    <SectionCard className="order-[1] mb-5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#003399]/15 p-4 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#003399] text-[#FFFFFF]"><ClipboardList size={22} /></span>
        <div className="flex-1">
          <h2 className="font-bold text-[#003399]">Stocktakes</h2>
          <p className="mt-1 text-xs text-[#003399]/65">Start a scoped count, scan with an observed shelf, then close and review frozen findings.</p>
        </div>
        <button type="button" onClick={() => void refreshList()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399]">
          <RefreshCw className={cn(loading && 'animate-spin')} size={15} />Refresh
        </button>
      </div>

      {error ? <div className="m-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]" role="alert">{error}</div> : null}
      {notice ? <div className="m-4 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-3 text-sm font-semibold text-[#003399]" role="status">{notice}</div> : null}

      {!active ? (
        <div className="grid gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form id={formId} onSubmit={(event) => void createSession(event)} className="space-y-3 rounded-xl border border-[#003399]/15 bg-[#003399]/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#003399]/60">Start session</p>
            <label className="block text-sm font-bold text-[#003399]">Name
              <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm" />
            </label>
            <label className="block text-sm font-bold text-[#003399]">Scope
              <select value={scopeKind} onChange={(event) => setScopeKind(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm">
                <option value="shelf">Shelf</option>
                <option value="category">Category</option>
                <option value="room">Room</option>
                <option value="collection">Collection-wide</option>
              </select>
            </label>
            {scopeKind !== 'collection' ? (
              <label className="block text-sm font-bold text-[#003399]">
                {scopeKind === 'shelf' ? 'Shelf' : scopeKind === 'category' ? 'Category' : 'Room'}
                <select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm">
                  {scopeKind === 'shelf' ? options?.shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.label}</option>) : null}
                  {scopeKind === 'category' ? options?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>) : null}
                  {scopeKind === 'room' ? options?.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>) : null}
                </select>
              </label>
            ) : null}
            <label className="block text-sm font-bold text-[#003399]">Asset kind
              <select value={assetKind} onChange={(event) => setAssetKind(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm">
                <option value="book">Books</option>
                <option value="research">Research</option>
                <option value="both">Both</option>
              </select>
            </label>
            <p className="text-xs text-[#003399]/70">Expected items preview: <strong>{previewCount == null ? '…' : previewCount}</strong></p>
            <button disabled={busy || !name.trim()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">
              {busy ? <RefreshCw className="animate-spin" size={15} /> : <ClipboardList size={15} />}
              Start stocktake
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-[#003399]/15">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]">
                <tr>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Counts</th>
                  <th className="px-4 py-3">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#003399]/10">
                {loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-[#003399]/65">Loading stocktakes…</td></tr> : null}
                {!loading && sessions.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-[#003399]/65">No stocktake sessions yet.</td></tr> : null}
                {sessions.map((session) => (
                  <tr key={session.stocktake_session_id} className="hover:bg-[#003399]/5">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => void openSession(session.stocktake_session_id)} className="text-left font-bold text-[#003399] underline-offset-2 hover:underline">
                        {session.session_name}
                      </button>
                      <p className="mt-1 text-xs text-[#003399]/60">{session.asset_kind}</p>
                    </td>
                    <td className="px-4 py-3 text-[#003399]">{session.scope_kind}: {session.scope_label}</td>
                    <td className="px-4 py-3 font-bold text-[#003399]">{session.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-xs text-[#003399]">
                      Expected {session.expected_count} · Present {session.present_count} · Missing {session.missing_count}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#003399]">{session.open_discrepancy_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button type="button" onClick={() => setActive(null)} className="text-xs font-bold text-[#003399]/70 hover:text-[#003399]">← Back to list</button>
              <h3 className="mt-2 text-lg font-black text-[#003399]">{active.session_name}</h3>
              <p className="mt-1 text-sm text-[#003399]/70">{active.scope_kind}: {active.scope_label} · {active.asset_kind} · {active.status.replace('_', ' ')}</p>
              <p className="mt-2 text-xs text-[#003399]/70">Expected {active.expected_count} · Present {active.present_count} · Missing {active.missing_count} · Exceptions {active.exception_count} · Open {active.open_discrepancy_count}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {active.status === 'in_progress' ? (
                <button type="button" disabled={busy} onClick={() => void closeActive()} className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">Close count</button>
              ) : null}
              {active.status === 'closed' ? (
                <button type="button" disabled={busy || active.open_discrepancy_count > 0} onClick={() => void reviewActive()} className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">Mark reviewed</button>
              ) : null}
              <button type="button" onClick={() => void inventoryApi.downloadStocktakeDiscrepancies(active.stocktake_session_id, 'csv')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399]/20 px-4 text-sm font-bold text-[#003399]"><Download size={15} />CSV</button>
              <button type="button" onClick={() => void inventoryApi.downloadStocktakeDiscrepancies(active.stocktake_session_id, 'pdf')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399]"><Download size={15} />PDF</button>
            </div>
          </div>

          {active.status === 'in_progress' ? (
            <div className="rounded-xl border border-[#003399]/15 bg-[#003399]/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#003399]"><ScanBarcode size={18} /> Scanning · observed shelf must stay selected</div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-sm font-bold text-[#003399] md:col-span-2">Observed shelf
                  <select value={observedShelfId} onChange={(event) => setObservedShelfId(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm">
                    {options?.shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold text-[#003399]">Column
                  <input value={observedColumn} onChange={(event) => setObservedColumn(event.target.value.replace(/\D/g, ''))} placeholder={observedShelf ? `1–${observedShelf.columnCount}` : ''} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm" />
                </label>
                <label className="text-sm font-bold text-[#003399]">Row
                  <input value={observedRow} onChange={(event) => setObservedRow(event.target.value.replace(/\D/g, ''))} placeholder={observedShelf ? `1–${observedShelf.rowCount}` : ''} className="mt-1 h-10 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm" />
                </label>
              </div>
              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (manualBarcode.trim()) { void submitScan(manualBarcode.trim(), 'manual'); setManualBarcode('') } }}>
                <input value={manualBarcode} onChange={(event) => setManualBarcode(event.target.value)} placeholder="Manual barcode entry" className="h-10 flex-1 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 font-mono text-sm" />
                <button disabled={busy || !manualBarcode.trim()} className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">Record scan</button>
              </form>
              {lastScan ? <p className="mt-3 text-sm font-semibold text-[#003399]">{lastScan}</p> : null}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-[#003399]/15">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]">
                <tr>
                  <th className="px-4 py-3">Finding</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Home shelf</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#003399]/10">
                {findings.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-[#003399]/65">No findings yet.</td></tr> : null}
                {findings.map((finding) => (
                  <tr key={finding.stocktake_discrepancy_id}>
                    <td className="px-4 py-3"><FindingBadge code={finding.finding_code} /></td>
                    <td className="px-4 py-3 text-[#003399]">
                      <p className="font-bold">{finding.title ?? '—'}</p>
                      <p className="mt-1 font-mono text-xs text-[#003399]/60">{finding.accession_number ?? finding.barcode ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-[#003399]">{finding.home_shelf_label ?? '—'}</td>
                    <td className="px-4 py-3 font-bold text-[#003399]">{finding.status}</td>
                    <td className="px-4 py-3">
                      {active.status === 'closed' && (finding.status === 'open' || finding.status === 'blocked') ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={busy} onClick={() => void resolveFinding(finding, 'confirm_found_at_home')} className="rounded-lg border border-[#003399]/20 px-3 py-2 text-xs font-bold text-[#003399]">Confirm at home</button>
                          <button type="button" disabled={busy} onClick={() => void resolveFinding(finding, 'dismiss')} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399]">Dismiss</button>
                        </div>
                      ) : <span className="text-xs text-[#003399]/50">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
