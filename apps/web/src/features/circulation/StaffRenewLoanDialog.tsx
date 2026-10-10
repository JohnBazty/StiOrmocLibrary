import { AlertTriangle, CalendarClock, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { circulationApi } from './circulation-api'
import type { RenewalDecisionData, RenewalPreflightData } from './types'

const STAFF_NOTE_MAX = 500

function createRequestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `staff-renewal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatDate(value: string | null) {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function StaffRenewLoanDialog({
  transactionId,
  title,
  borrowerName,
  onCancel,
  onSuccess,
}: {
  transactionId: number
  title: string
  borrowerName: string
  onCancel: () => void
  onSuccess: (decision: RenewalDecisionData) => void
}) {
  const [requestKey] = useState(createRequestKey)
  const [preflight, setPreflight] = useState<RenewalPreflightData | null>(null)
  const [staffNote, setStaffNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const normalizedNote = staffNote.trim()

  async function loadPreflight() {
    setLoading(true)
    setError('')
    try {
      setPreflight(await circulationApi.preflightRenewal(transactionId, true))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Renewal eligibility could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPreflight() }, [transactionId])

  async function confirmRenewal() {
    if (busy || !preflight?.canRequestRenewal || !normalizedNote) return
    setBusy(true)
    setError('')
    try {
      const decision = await circulationApi.staffRenewal(transactionId, requestKey, normalizedNote)
      if (decision.status === 'Approved') onSuccess(decision)
      else {
        setPreflight((current) => current ? { ...current, blockers: decision.blockers, canRequestRenewal: false } : current)
        setError(decision.decisionSummary)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The staff renewal could not be submitted.')
    } finally {
      setBusy(false)
    }
  }

  const usage = preflight?.maxRenewals === null
    ? `${preflight?.renewalCount ?? 0} used`
    : `${preflight?.renewalCount ?? 0} of ${preflight?.maxRenewals ?? 0} used`

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="staff-renew-loan-title" className="fixed inset-0 z-[120] flex items-center justify-center bg-[#003399]/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#003399]/15 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#003399]">Staff renewal</p>
            <h2 id="staff-renew-loan-title" className="mt-1 text-xl font-black text-[#003399]">Renew on behalf</h2>
            <p className="mt-1 text-sm text-[#003399]/70">{title} · {borrowerName}</p>
          </div>
          <button type="button" disabled={busy} aria-label="Close staff renewal" onClick={onCancel} className="rounded-xl p-2 text-[#003399] disabled:opacity-40"><X size={19} /></button>
        </header>
        <div className="space-y-4 p-5">
          {loading ? <div className="flex items-center gap-2 font-semibold text-[#003399]"><RefreshCw className="animate-spin" size={17} /> Checking renewal eligibility…</div> : null}
          {preflight ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#003399]/15 p-3 text-[#003399]"><p className="text-xs font-bold uppercase">Current due</p><p className="mt-1 text-sm font-semibold">{formatDate(preflight.currentDueAt)}</p></div>
                <div className="rounded-xl bg-[#FFF200] p-3 text-[#003399]"><p className="text-xs font-bold uppercase">Proposed due</p><p className="mt-1 text-sm font-semibold">{formatDate(preflight.proposedDueAt)}</p></div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#003399]"><CalendarClock size={17} /> Renewals: {usage}</div>
              {preflight.blockers.length ? (
                <div className="space-y-2 rounded-xl border border-[#003399]/20 p-4 text-[#003399]">
                  <p className="flex items-center gap-2 font-bold"><AlertTriangle size={17} /> Renewal blocked</p>
                  <ul className="space-y-1 text-sm">{preflight.blockers.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
                </div>
              ) : null}
            </>
          ) : null}
          <label className="block text-xs font-bold uppercase text-[#003399]">
            Staff note (required)
            <textarea value={staffNote} maxLength={STAFF_NOTE_MAX} onChange={(event) => setStaffNote(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[#003399]/20 p-3 text-sm font-normal text-[#003399] outline-none focus:border-[#003399]" placeholder="Record why this renewal is being processed on the borrower’s behalf" />
            <span className="mt-1 block text-[11px] font-semibold normal-case text-[#003399]/70">{staffNote.length}/{STAFF_NOTE_MAX} characters</span>
          </label>
          {error ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[#003399]/15 p-4">
          <button type="button" disabled={busy} onClick={onCancel} className="h-10 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Cancel</button>
          {error && !preflight ? <button type="button" disabled={loading} onClick={() => void loadPreflight()} className="h-10 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-40">Retry</button> : null}
          <button type="button" disabled={loading || busy || !preflight?.canRequestRenewal || !normalizedNote} onClick={() => void confirmRenewal()} className="h-10 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-40">{busy ? 'Renewing…' : 'Confirm staff renewal'}</button>
        </footer>
      </div>
    </div>
  )
}
