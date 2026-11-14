import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, SectionCard, StatusBadge } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { circulationApi } from './circulation-api'
import type { DamageCaseDetail, DamageCaseListItem, DamageDisposition } from './types'

const STATUSES = ['all', 'Open', 'Under Investigation', 'Reopened', 'Resolved', 'Dismissed'] as const
const DECISIONS: Array<[DamageDisposition, string]> = [
  ['damaged_held', 'Keep out of circulation (still damaged)'],
  ['repaired_available', 'Repaired: return to the shelf'],
  ['lost', 'Damaged beyond use: write off and charge the borrower'],
]
const fieldClass = 'mt-1 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 py-2 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2] dark:border-white/20 dark:bg-white/5 dark:text-white'
const peso = (value: number) => `PHP ${value.toFixed(2)}`

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback }

function CaseReview({ caseId, canDecide, onChanged, revision }: { caseId: number; canDecide: boolean; onChanged: () => void; revision: number }) {
  const [detail, setDetail] = useState<DamageCaseDetail | null>(null)
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(''); const [decision, setDecision] = useState<DamageDisposition>('damaged_held')
  const [decisionReason, setDecisionReason] = useState(''); const [charge, setCharge] = useState(''); const [closingReason, setClosingReason] = useState('')
  const [confirmWriteOff, setConfirmWriteOff] = useState(false)

  useEffect(() => {
    let active = true
    circulationApi.getCase(caseId).then((value) => { if (active) setDetail(value) }).catch((reason) => { if (active) setError(message(reason, 'The case could not be loaded.')) })
    return () => { active = false }
  }, [caseId, revision])

  async function run(action: () => Promise<DamageCaseDetail>, done: string, reset: () => void) {
    setBusy(true); setError(''); setNotice(''); setConfirmWriteOff(false)
    try { setDetail(await action()); reset(); setNotice(done); onChanged() }
    catch (reason) {
      setError(message(reason, 'The action could not be saved.'))
      // The case may have changed (price, status); show the current server state.
      try { setDetail(await circulationApi.getCase(caseId)) } catch { /* keep the last detail; the error above is shown */ }
    }
    finally { setBusy(false) }
  }

  if (!detail) return <div className="p-5 text-sm">{error ? <p role="alert">{error}</p> : <p role="status">Loading case…</p>}</div>
  const closed = ['Resolved', 'Dismissed'].includes(detail.case.status)
  const price = detail.loan?.titlePrice ?? null
  const charged = detail.case.lostBookReportId !== null

  function submitDecision() {
    if (!decisionReason.trim()) { setError('Enter a reason for the decision.'); return }
    const needsCharge = decision === 'lost' && price === null
    const amount = Number(charge)
    if (needsCharge && !(amount > 0)) { setError('Enter the replacement charge for this title.'); return }
    if (decision === 'lost' && !confirmWriteOff) { setError(''); setConfirmWriteOff(true); return }
    void run(() => circulationApi.recordCaseDisposition(caseId, { disposition: decision, reason: decisionReason.trim(), ...(needsCharge ? { replacementCharge: amount } : {}) }),
      'Decision recorded.', () => { setDecisionReason(''); setCharge('') })
  }
  function close(action: 'resolve' | 'dismiss') {
    if (!closingReason.trim()) { setError('Enter a reason before closing the case.'); return }
    void run(() => circulationApi.closeCase(caseId, action, closingReason.trim()), action === 'resolve' ? 'Case resolved.' : 'Case dismissed.', () => setClosingReason(''))
  }
  function reopen() {
    if (!closingReason.trim()) { setError('Enter a reason before reopening the case.'); return }
    void run(() => circulationApi.reopenCase(caseId, closingReason.trim()), 'Case reopened.', () => setClosingReason(''))
  }

  return <section aria-label={`${detail.case.caseType === 'Long Overdue' ? 'Overdue' : 'Damage'} case ${caseId}`} className="space-y-4 border-t border-[#0b5ea2]/10 bg-[#0b5ea2]/[0.03] p-5 text-sm text-[#0b5ea2] dark:border-white/10 dark:bg-white/5 dark:text-white">
    {error ? <p role="alert" className="auth-error rounded-xl px-3 py-2">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-[#FFF200] px-3 py-2 font-semibold text-[#0b5ea2]">{notice}</p> : null}
    {detail.loan ? <div className="grid gap-1 sm:grid-cols-2">
      <p>Copy: <span className="font-mono">{detail.loan.barcode}</span> · {detail.loan.conditionStatus} · {detail.loan.availabilityStatus}</p>
      <p>{price === null ? 'No book price on record' : `Book price: ${peso(price)}`}</p>
      {detail.loan.replacementCharge !== null ? <p>Replacement charge: {peso(detail.loan.replacementCharge)} ({detail.loan.replacementPaymentStatus}). Collect it in Clearance.</p> : null}
    </div> : null}
    <ol className="space-y-2">{detail.events.map((event) => <li key={event.eventId} className="rounded-lg border border-[#0b5ea2]/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <p className="font-semibold">{event.eventType} · {formatDate(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ''}</p>
      {event.reason || event.notes ? <p className="mt-1 opacity-80">{[event.reason, event.notes].filter(Boolean).join(' — ')}</p> : null}
    </li>)}</ol>
    {!closed ? <div>
      <label className="block font-semibold">Note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} className={fieldClass} /></label>
      <Button variant="secondary" className="mt-2" disabled={busy || !note.trim()} onClick={() => void run(() => circulationApi.addCaseNote(caseId, note.trim()), 'Note added.', () => setNote(''))}>Add note</Button>
    </div> : null}
    {canDecide && !closed && !charged && detail.case.caseType !== 'Long Overdue' ? <div className="space-y-2 rounded-xl border border-[#0b5ea2]/15 p-4 dark:border-white/15">
      <label className="block font-semibold">Decision<select value={decision} onChange={(event) => { setDecision(event.target.value as DamageDisposition); setConfirmWriteOff(false) }} className={fieldClass}>{DECISIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {decision === 'lost' ? (price === null
        ? <label className="block font-semibold">Replacement charge (PHP)<input type="number" min="0.01" step="0.01" value={charge} onChange={(event) => setCharge(event.target.value)} className={fieldClass} /></label>
        : <p>The borrower will be charged the book price, {peso(price)}. No extra fee is added.</p>) : null}
      <label className="block font-semibold">Decision reason<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} maxLength={500} className={fieldClass} /></label>
      {confirmWriteOff && decision === 'lost' && detail.loan ? <div role="group" aria-label="Confirm write-off" className="rounded-xl bg-[#FFF200] p-3 font-semibold text-[#0b5ea2]">
        <p>Write off {detail.loan.barcode} and charge {detail.loan.borrowerName} {peso(price ?? Number(charge))}?</p>
        <div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy} onClick={submitDecision}>Confirm write-off</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmWriteOff(false)}>Back</Button></div>
      </div> : <Button disabled={busy} onClick={submitDecision}>Record decision</Button>}
    </div> : null}
    {canDecide ? <div className="space-y-2">
      <label className="block font-semibold">Closing reason<input value={closingReason} onChange={(event) => setClosingReason(event.target.value)} maxLength={500} className={fieldClass} /></label>
      <div className="flex flex-wrap gap-2">{closed
        ? <Button variant="secondary" disabled={busy} onClick={reopen}>Reopen</Button>
        : <><Button disabled={busy} onClick={() => close('resolve')}>Resolve</Button><Button variant="secondary" disabled={busy} onClick={() => close('dismiss')}>Dismiss</Button></>}</div>
    </div> : null}
  </section>
}

/** Damaged-book and long-overdue follow-ups. Librarians decide and close; desk staff add notes. */
export function DamageCasesPanel() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [items, setItems] = useState<DamageCaseListItem[] | null>(null)
  const [error, setError] = useState(''); const [openId, setOpenId] = useState<number | null>(null)
  const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1)
  const [revision, setRevision] = useState(0)
  const canDecide = getCurrentIdentity()?.role === 'Librarian'
  const latestLoad = useRef(0)
  const load = useCallback(async () => {
    const loadId = ++latestLoad.current
    try { const data = await circulationApi.listCases(status, page); if (loadId === latestLoad.current) { setItems(data.items); setTotalPages(data.pagination.totalPages); setRevision(value => value + 1); setError('') } }
    catch (reason) { if (loadId === latestLoad.current) setError(message(reason, 'Book follow-ups are unavailable.')) }
  }, [status, page])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void load() }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('smartlib:circulation-updated', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('smartlib:circulation-updated', refresh); window.removeEventListener('focus', refresh) }
  }, [load])

  return <SectionCard className="mt-5 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#0b5ea2]/10 p-5 dark:border-white/10">
      <h2 className="text-lg font-bold">Book follow-ups</h2>
      <div className="flex flex-wrap items-center gap-3"><label className="text-xs font-semibold">Case status<select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); setOpenId(null) }} className="ml-2 min-h-10 rounded-xl border border-[#0b5ea2]/15 bg-white px-2 text-sm text-[#0b5ea2] dark:border-white/20 dark:bg-white/5 dark:text-white">{STATUSES.map((value) => <option key={value} value={value}>{value === 'all' ? 'All cases' : value}</option>)}</select></label><Button variant="secondary" onClick={() => void load()}>Refresh follow-ups</Button></div>
    </div>
    {error ? <p role="alert" className="auth-error m-5 rounded-xl px-3 py-2 text-sm">{error}</p> : null}
    {!items ? (error ? null : <p role="status" className="p-8 text-center text-sm opacity-65">Loading book follow-ups…</p>) : items.length ? <div className="divide-y divide-[#0b5ea2]/10 dark:divide-white/10">{items.map((item) => <article key={item.caseId}>
      <div className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold">{item.title}</h3><span className="text-xs font-semibold">{item.caseType==='Long Overdue'?'Long overdue':'Damaged book'}</span><StatusBadge status={item.status} /></div>
          <p className="mt-1 text-sm opacity-75">{item.borrowerName} · {item.borrowerSchoolId} · <span className="font-mono">{item.barcode}</span></p>
          <p className="mt-1 text-xs opacity-65">Opened {formatDate(item.openedAt)}{item.summary ? ` · ${item.summary}` : ''}</p></div>
        <Button variant="secondary" onClick={() => setOpenId((current) => current === item.caseId ? null : item.caseId)}><span aria-hidden="true">{openId === item.caseId ? 'Hide' : 'Review'}</span><span className="sr-only">{openId === item.caseId ? 'Hide' : 'Review'} {item.title}</span></Button>
      </div>
      {openId === item.caseId ? <CaseReview caseId={item.caseId} canDecide={canDecide} revision={revision} onChanged={() => void load()} /> : null}
    </article>)}</div> : <p className="p-8 text-center text-sm opacity-65">No book follow-ups in this view.</p>}
    {totalPages > 1 ? <div className="flex flex-wrap items-center justify-end gap-3 border-t p-4"><Button variant="secondary" disabled={page <= 1} onClick={() => { setPage(value => value - 1); setOpenId(null) }}>Previous follow-ups</Button><span className="text-sm">Page {page} of {totalPages}</span><Button variant="secondary" disabled={page >= totalPages} onClick={() => { setPage(value => value + 1); setOpenId(null) }}>Next follow-ups</Button></div> : null}
  </SectionCard>
}
