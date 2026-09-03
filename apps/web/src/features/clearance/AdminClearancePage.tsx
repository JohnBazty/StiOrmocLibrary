import { AlertTriangle, BadgeCheck, Clock3, Download, Eye, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'
import { clearanceApi } from './clearance-api'
import type { ClearanceList, ClearanceRecord } from './types'

const field = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10'
function money(value: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value) }
function date(value: string | null) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }

export function AdminClearancePage() {
  const [data, setData] = useState<ClearanceList | null>(null)
  const [selected, setSelected] = useState<ClearanceRecord | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [overrideFormOpen, setOverrideFormOpen] = useState(false)
  const [revocationFormOpen, setRevocationFormOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const load = useCallback(async (term = search) => { try { setData(await clearanceApi.list(term)); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Clearance records are unavailable.') } }, [search])
  useEffect(() => { void load('') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function open(userId: number) {
    try {
      setSelected(await clearanceApi.detail(userId))
      setOverrideFormOpen(false)
      setRevocationFormOpen(false)
      setHistoryOpen(false)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Student clearance details are unavailable.') }
  }
  async function override(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()); setBusy(true)
    try {
      const result = await clearanceApi.override(selected.student.userId, { status: 'Cleared', reason: String(values.reason), expiresAt: null })
      setSelected(result.clearance)
      setOverrideFormOpen(false)
      setError('')
      await load()
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The override could not be recorded.') } finally { setBusy(false) }
  }
  async function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected?.activeOverride || busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const reason = String(values.reason ?? '').trim()
    if (!reason) return
    setBusy(true)
    try {
      setSelected(await clearanceApi.revoke(selected.student.userId, selected.activeOverride.overrideId, reason))
      setRevocationFormOpen(false)
      setError('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The override could not be revoked.') } finally { setBusy(false) }
  }
  async function decide(reportId: number, status: 'Confirmed' | 'Rejected', fallbackPrice: number | null) {
    let charge: number | undefined
    if (status === 'Confirmed' && !fallbackPrice) { const value = window.prompt('This legacy book has no purchase price. Enter the replacement charge:'); if (!value) return; charge = Number(value) }
    setBusy(true); try { await clearanceApi.decideLost(reportId, status, charge); if (selected) await open(selected.student.userId); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'The lost-book report could not be updated.') } finally { setBusy(false) }
  }
  async function settle(reportId: number) { setBusy(true); try { await clearanceApi.settleLost(reportId); if (selected) await open(selected.student.userId); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'The replacement payment could not be recorded.') } finally { setBusy(false) } }
  async function exportCsv() {
    const headers = new Headers({ Accept: 'text/csv' }); const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch('/api/v1/admin/clearance/export.csv', { headers }); if (!response.ok) { setError('Clearance export failed.'); return }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'smartlib-clearance.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <>
    <PageHeader eyebrow="Student standing" title="Clearance management" description="Live obligations, documented exceptions, lost-book charges, and audit history." action={<div className="flex gap-2"><Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button><Button onClick={() => void exportCsv()}><Download size={16} /> Export bulk status</Button></div>} />
    {error ? <div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-4"><StatCard label="Students" value={data?.summary.totalStudents ?? 0} icon={BadgeCheck} tone="blue" /><StatCard label="Cleared" value={data?.summary.cleared ?? 0} icon={BadgeCheck} tone="blue" /><StatCard label="Pending clearance" value={data?.summary.pending ?? 0} icon={Clock3} tone="blue" /><StatCard label="Active overrides" value={data?.summary.activeOverrides ?? 0} icon={ShieldCheck} tone="blue" /></div>
    <SectionCard className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#003399]/15 p-5"><div><h2 className="font-bold text-[#003399]">Clearance master list</h2><p className="text-xs text-[#003399]/60">Computed from authoritative transactions</p></div><form onSubmit={(event) => { event.preventDefault(); void load(search) }} className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or ID" className={`${field} w-64`} /><Button type="submit">Search</Button></form></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Program</th><th className="px-5 py-3">Unreturned</th><th className="px-5 py-3">Outstanding</th><th className="px-5 py-3">Standing</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{data?.items.length ? data.items.map((item) => <tr key={item.student.userId} className="border-b border-[#003399]/10"><td className="px-5 py-4"><p className="font-bold text-[#003399]">{item.student.name}</p><p className="text-xs text-[#003399]/60">{item.student.schoolId}</p></td><td className="px-5 py-4 text-[#003399]">{item.student.program ?? '—'}</td><td className="px-5 py-4 font-bold text-[#003399]">{item.summary.activeLoans}</td><td className="px-5 py-4 font-bold text-[#003399]">{money(item.summary.totalOutstanding)}</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td><td className="max-w-xs px-5 py-4 text-[#003399]/70">{item.reason}</td><td className="px-5 py-4"><button onClick={() => void open(item.student.userId)} className="inline-flex items-center gap-1 rounded-lg border border-[#003399]/20 px-3 py-2 text-xs font-bold text-[#003399]"><Eye size={14} /> Review</button></td></tr>) : <tr><td colSpan={7} className="p-12 text-center font-semibold text-[#003399]">No students match this search.</td></tr>}</tbody></table></div></SectionCard>
    {selected ? <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/75 p-4"><div className="mx-auto my-4 max-w-5xl rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]/60">Clearance review</p><h2 className="font-display text-xl font-bold text-[#003399]">{selected.student.name}</h2><p className="text-sm text-[#003399]/60">{selected.student.schoolId} · {selected.student.program}</p></div><button aria-label="Close" onClick={() => setSelected(null)} className="p-2 text-[#003399]"><X /></button></header><div className="space-y-5 p-5"><div className="grid gap-3 sm:grid-cols-4"><StatCard label="Standing" value={selected.status} icon={BadgeCheck} tone="blue" /><StatCard label="Unreturned" value={selected.summary.activeLoans} icon={Clock3} tone="blue" /><StatCard label="Outstanding fines" value={money(selected.summary.unpaidOverdueFines)} icon={Clock3} tone="blue" /><StatCard label="Lost charges" value={money(selected.summary.unpaidReplacementCharges)} icon={Clock3} tone="blue" /></div>
      <SectionCard className="p-4"><h3 className="font-bold text-[#003399]">Blocking details</h3><p className="mt-1 text-sm text-[#003399]/70">{selected.reason}</p><div className="mt-4 space-y-2">{selected.loans.map((loan) => <div key={loan.transactionId} className="rounded-xl bg-[#003399]/5 p-3 text-sm text-[#003399]"><strong>{loan.title}</strong> · due {date(loan.dueAt)} · {loan.overdueHours} overdue hours · {money(loan.currentFine)}</div>)}</div></SectionCard>
      {selected.lostBooks.length ? <SectionCard className="p-4"><h3 className="font-bold text-[#003399]">Lost-book reports</h3><div className="mt-3 space-y-3">{selected.lostBooks.map((item) => <div key={item.lostBookReportId} className="rounded-xl border border-[#003399]/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-[#003399]">{item.title}</strong><p className="text-xs text-[#003399]/60">Reported {date(item.reportedAt)} · {item.status} · {item.paymentStatus}</p></div><strong className="text-[#003399]">{money(item.replacementCharge || item.purchasePrice || 0)}</strong></div><div className="mt-3 flex flex-wrap gap-2">{item.status === 'Pending' ? <><Button disabled={busy} onClick={() => void decide(item.lostBookReportId, 'Confirmed', item.purchasePrice)}>Confirm loss</Button><Button variant="secondary" disabled={busy} onClick={() => void decide(item.lostBookReportId, 'Rejected', item.purchasePrice)}>Reject report</Button></> : null}{item.status === 'Confirmed' && item.paymentStatus === 'Unpaid' ? <Button disabled={busy} onClick={() => void settle(item.lostBookReportId)}>Record replacement payment</Button> : null}</div></div>)}</div></SectionCard> : null}
      <SectionCard className="p-4">
        <div>
          <h3 className="font-bold text-[#003399]">Clearance exception</h3>
          <p className="text-xs text-[#003399]/60">Use this only when an authorized staff member approves clearing a blocked student.</p>
        </div>

        {selected.activeOverride ? <div className="mt-4 rounded-xl border border-[#003399]/15 bg-[#003399]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-[#003399]">Exception active: {selected.activeOverride.status}</p>
              <p className="mt-1 text-sm text-[#003399]/75">{selected.activeOverride.reason}</p>
              <p className="mt-2 text-xs text-[#003399]/55">Approved by {selected.activeOverride.appliedBy} on {date(selected.activeOverride.appliedAt)}</p>
            </div>
            {!revocationFormOpen ? <Button variant="secondary" disabled={busy} onClick={() => setRevocationFormOpen(true)}>Remove exception</Button> : null}
          </div>
          {revocationFormOpen ? <form onSubmit={revoke} className="mt-4 space-y-3 border-t border-[#003399]/15 pt-4">
            <label htmlFor="revocation-reason" className="block text-sm font-bold text-[#003399]">Reason for removing the exception</label>
            <textarea id="revocation-reason" name="reason" required minLength={10} placeholder="Example: The approved exception is no longer needed." className={`${field} h-20 py-3`} />
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Removing…' : 'Confirm removal'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setRevocationFormOpen(false)}>Cancel</Button></div>
          </form> : null}
        </div> : selected.computedStatus === 'Not Cleared' ? <div className="mt-4">
          <p className="text-sm text-[#003399]/75">This student has library obligations. An exception changes only the clearance status; books, lost-item charges, and fines remain recorded.</p>
          {!overrideFormOpen ? <Button className="mt-4" onClick={() => setOverrideFormOpen(true)}>Clear student as an exception</Button> : <form onSubmit={override} className="mt-4 space-y-3 rounded-xl border border-[#003399]/15 p-4">
            <label htmlFor="override-reason" className="block text-sm font-bold text-[#003399]">Reason for exception</label>
            <textarea id="override-reason" name="reason" required minLength={10} placeholder="Example: Approved by the Head Librarian while payment is being verified." className={`${field} h-20 py-3`} />
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm exception'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setOverrideFormOpen(false)}>Cancel</Button></div>
          </form>}
        </div> : <div className="mt-4 rounded-xl bg-[#003399]/5 p-4 text-sm text-[#003399]">
          No exception is needed because the student is already cleared by the system.
        </div>}

        {selected.overrideHistory.length ? <div className="mt-4 border-t border-[#003399]/15 pt-4">
          <button type="button" onClick={() => setHistoryOpen((value) => !value)} className="text-sm font-bold text-[#003399]">{historyOpen ? 'Hide' : 'View'} exception history ({selected.overrideHistory.length})</button>
          {historyOpen ? <div className="mt-3 space-y-2">{selected.overrideHistory.map((entry) => <div key={entry.overrideId} className="rounded-xl bg-[#003399]/5 p-3 text-xs text-[#003399]"><strong>{entry.status}</strong> · {entry.reason}<br />Applied by {entry.appliedBy} on {date(entry.appliedAt)}{entry.revokedAt ? ` · Removed by ${entry.revokedBy} on ${date(entry.revokedAt)}: ${entry.revocationReason}` : ''}</div>)}</div> : null}
        </div> : null}
      </SectionCard>
    </div></div></div> : null}
  </>
}
