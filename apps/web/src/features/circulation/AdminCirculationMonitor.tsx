import { AlertTriangle, BookOpen, CalendarClock, CheckCircle2, RefreshCw, ScanBarcode, ShieldAlert } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { circulationApi } from './circulation-api'
import { CheckoutPreflightDialog } from './CheckoutPreflightDialog'
import type { CheckoutFlow, CheckoutPreflightData, CirculationCaseListItem, CirculationMonitorData, PreflightFinding } from './types'
import { CancelBorrowRequestDialog } from './CancelBorrowRequestDialog'

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function resolveCheckoutFlow(items: CirculationMonitorData['items'] | undefined, barcode: string, schoolId: string): CheckoutFlow {
  const normalizedBarcode = barcode.trim().toUpperCase()
  const normalizedSchoolId = schoolId.trim().toUpperCase()
  const pendingMatch = items?.some((item) => (
    item.status === 'Pending'
    && item.barcode.trim().toUpperCase() === normalizedBarcode
    && item.schoolId.trim().toUpperCase() === normalizedSchoolId
  ))
  return pendingMatch ? 'claim' : 'walk_in'
}

export function AdminCirculationMonitor() {
  const [data, setData] = useState<CirculationMonitorData | null>(null)
  const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState(''); const [success, setSuccess] = useState('')
  const [alerts, setAlerts] = useState<PreflightFinding[]>([])
  const [blockers, setBlockers] = useState<PreflightFinding[]>([])
  const [barcode, setBarcode] = useState(''); const [schoolId, setSchoolId] = useState(''); const [submitting, setSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [preflight, setPreflight] = useState<CheckoutPreflightData | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const [pendingFlow, setPendingFlow] = useState<CheckoutFlow>('walk_in')
  const [cases, setCases] = useState<CirculationCaseListItem[]>([])
  const [caseFilter, setCaseFilter] = useState<'all' | 'Long Overdue' | 'Damage'>('all')
  const [damageTarget, setDamageTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [damageDescription, setDamageDescription] = useState('')
  const [damageError, setDamageError] = useState('')
  const [resolveReason, setResolveReason] = useState('')
  const [resolveCaseId, setResolveCaseId] = useState<number | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [monitor, caseList] = await Promise.all([
        circulationApi.monitor(),
        circulationApi.listCases(caseFilter),
      ])
      setData(monitor)
      setCases(caseList.items)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Circulation records are unavailable.') }
    finally { setLoading(false) }
  }, [caseFilter])
  useEffect(() => {
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('smartlib:circulation-updated', refresh) }
  }, [load])

  async function completeCheckout(flow: CheckoutFlow, token: string | null, overrideReason?: string) {
    const payload = { barcode, schoolId, preflightToken: token, overrideReason: overrideReason ?? null }
    if (flow === 'claim') await circulationApi.fulfillClaim(payload)
    else await circulationApi.confirmCheckout(payload)
  }

  async function checkout(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    setAlerts([])
    setBlockers([])
    setConfirmError('')
    try {
      const flow = resolveCheckoutFlow(data?.items, barcode, schoolId)
      setPendingFlow(flow)
      const result = await circulationApi.preflightCheckout(barcode, schoolId, flow)
      if (result.decision === 'blocked') {
        setBlockers(result.blockers)
        setError('Checkout is blocked. Review the reasons below.')
        return
      }
      if (result.decision === 'confirmation_required') {
        setPreflight(result)
        return
      }
      await completeCheckout(flow, result.preflightToken)
      setBarcode('')
      setAlerts(result.alerts)
      setSuccess(flow === 'claim'
        ? 'School ID and barcode verified. The claim is now an active loan.'
        : 'School ID and barcode verified. Walk-in checkout is now an active loan.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Checkout could not be confirmed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmWarningCheckout(reason: string) {
    if (!preflight || submitting) return
    setSubmitting(true)
    setConfirmError('')
    try {
      await completeCheckout(pendingFlow, preflight.preflightToken, reason)
      setBarcode('')
      setAlerts(preflight.alerts)
      setPreflight(null)
      setSuccess(pendingFlow === 'claim'
        ? 'School ID and barcode verified. The claim is now an active loan.'
        : 'School ID and barcode verified. Walk-in checkout is now an active loan.')
      await load()
    } catch (reasonValue) {
      setConfirmError(reasonValue instanceof Error ? reasonValue.message : 'Checkout could not be confirmed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function completeReturn(transactionId: number) {
    setBusyId(transactionId); setError(''); setSuccess('')
    try { await circulationApi.returnBook(transactionId); setSuccess('Return completed and the waiting queue was advanced.'); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Return could not be completed.') }
    finally { setBusyId(null) }
  }
  async function submitDamageReport() {
    if (!damageTarget || busyId !== null) return
    const description = damageDescription.trim()
    if (!description) { setDamageError('Describe the damage observed at return.'); return }
    setBusyId(damageTarget.transactionId); setDamageError(''); setError(''); setSuccess('')
    try {
      await circulationApi.reportDamage(damageTarget.transactionId, description)
      setDamageTarget(null)
      setDamageDescription('')
      setSuccess('Return completed with a damage case. The copy is held unavailable.')
      await load()
    } catch (reason) {
      setDamageError(reason instanceof Error ? reason.message : 'Damage could not be reported.')
    } finally { setBusyId(null) }
  }
  async function resolveOpenCase(caseId: number) {
    const reason = resolveReason.trim()
    if (!reason) { setError('Enter a reason before resolving the case.'); return }
    setBusyId(caseId); setError(''); setSuccess('')
    try {
      await circulationApi.resolveCase(caseId, reason)
      setResolveCaseId(null)
      setResolveReason('')
      setSuccess('Case resolved.')
      await load()
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The case could not be resolved.')
    } finally { setBusyId(null) }
  }
  async function penalty(transactionId: number) {
    setBusyId(transactionId); setError(''); setSuccess('')
    try { const result = await circulationApi.calculatePenalty(transactionId); setSuccess(`Calculated penalty: ₱${result.amount.toFixed(2)}`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Penalty could not be calculated.') }
    finally { setBusyId(null) }
  }
  async function cancelPending(reason: string) {
    if (!cancelTarget || busyId !== null) return
    const target = cancelTarget
    setBusyId(target.transactionId); setCancelError(''); setError(''); setSuccess('')
    try {
      await circulationApi.cancelRequest(target.transactionId, reason)
      setData((current) => current ? {
        ...current,
        summary: { ...current.summary, pendingClaims: Math.max(0, current.summary.pendingClaims - 1) },
        items: current.items.filter((item) => item.transactionId !== target.transactionId),
      } : current)
      setCancelTarget(null)
      setSuccess(`${target.title} pending claim was cancelled and released.`)
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
      await load()
    } catch (reasonValue) {
      setCancelError(reasonValue instanceof Error ? reasonValue.message : 'The pending request could not be cancelled.')
    } finally { setBusyId(null) }
  }
  const lanes = useMemo(() => ({
    pending: data?.items.filter((item) => item.status === 'Pending') ?? [],
    active: data?.items.filter((item) => ['Borrowed', 'Active'].includes(item.status)) ?? [],
    overdue: data?.items.filter((item) => item.status === 'Overdue') ?? [],
  }), [data])

  const table = (items: CirculationMonitorData['items'], empty: string) => <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
    <thead className="bg-[#003399] text-[#FFFFFF]"><tr><th className="px-4 py-3">Borrower</th><th className="px-4 py-3">Book / copy</th><th className="px-4 py-3">Requested / borrowed</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
    <tbody>{items.length ? items.map((item) => <tr key={item.transactionId} className="border-b border-[#003399]/10">
      <td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.userName}</p><p className="text-xs text-[#003399]/60">{item.schoolId} · {item.role}</p></td>
      <td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.title}</p><p className="font-mono text-xs text-[#003399]/60">{item.accessionNumber ?? item.barcode}</p></td>
      <td className="px-4 py-4 text-xs text-[#003399]">{formatDate(item.borrowDate ?? item.requestedAt)}</td><td className="px-4 py-4 text-xs font-semibold text-[#003399]">{formatDate(item.dueDate)}</td><td className="px-4 py-4"><StatusBadge status={item.status === 'Pending' ? 'Pending claim' : item.status} /></td>
      <td className="px-4 py-4"><div className="flex flex-wrap justify-end gap-2">{item.status === 'Pending' ? <><button type="button" onClick={() => { setSchoolId(item.schoolId); setBarcode(item.barcode); setError(''); setBlockers([]); setAlerts([]); setSuccess('Borrower School ID and book barcode loaded. Confirm checkout after verifying the presented ID and book.') }} className="rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#003399]">Verify borrower</button><button disabled={busyId === item.transactionId} onClick={() => { setCancelError(''); setCancelTarget(item) }} className="rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Cancel</button></> : <>{item.status === 'Overdue' ? <button disabled={busyId === item.transactionId} onClick={() => void penalty(item.transactionId)} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Calculate penalty</button> : null}<button disabled={busyId === item.transactionId} onClick={() => void completeReturn(item.transactionId)} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-[#FFFFFF] disabled:opacity-40">Process return</button><button type="button" disabled={busyId === item.transactionId} onClick={() => { setDamageError(''); setDamageDescription(''); setDamageTarget(item) }} className="rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Report damage</button></>}</div></td>
    </tr>) : <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-[#003399]">{empty}</td></tr>}</tbody>
  </table></div>

  return <>
    <PageHeader eyebrow="Circulation desk" title="Borrow and return monitoring" action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <div role="alert" className="mb-4 flex items-center gap-3 rounded-xl bg-[#FFF200] px-4 py-3 font-semibold text-[#003399]"><AlertTriangle size={18} aria-hidden="true" />{error}</div> : null}
    {blockers.length ? (
      <div role="alert" className="mb-4 space-y-2 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 py-3 text-[#003399]">
        <p className="flex items-center gap-2 font-bold"><ShieldAlert size={18} aria-hidden="true" /> Checkout blocked</p>
        <ul className="space-y-1 text-sm">
          {blockers.map((blocker) => (
            <li key={blocker.code} className="flex gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span><strong>{blocker.code.replace(/_/g, ' ')}:</strong> {blocker.message}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    {success ? <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 py-3 font-semibold text-[#003399]"><CheckCircle2 size={18} aria-hidden="true" />{success}</div> : null}
    {alerts.length ? (
      <div role="status" className="mb-4 space-y-2 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 py-3 text-[#003399]">
        <p className="font-bold">Checkout alerts</p>
        <ul className="space-y-1 text-sm">
          {alerts.map((alert) => (
            <li key={alert.code} className="flex gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{alert.message}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    <form onSubmit={checkout} className="mb-5 grid gap-3 rounded-2xl border border-[#003399]/15 bg-[#FFFFFF] p-4 md:grid-cols-[1fr_1fr_auto]">
      <label className="text-xs font-bold text-[#003399]">Book barcode<input required autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan barcode then press Enter" className="mt-2 h-11 w-full rounded-xl border border-[#003399]/20 px-3 text-sm font-medium text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10" /></label>
      <label className="text-xs font-bold text-[#003399]">Verified borrower school ID<input required value={schoolId} onChange={(event) => setSchoolId(event.target.value)} placeholder="Select a pending claimant or enter the presented school ID" className="mt-2 h-11 w-full rounded-xl border border-[#003399]/20 px-3 text-sm font-medium text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10" /></label>
      <Button type="submit" className="self-end" disabled={submitting}>{submitting ? 'Confirming…' : <><ScanBarcode size={16} /> Confirm checkout</>}</Button>
    </form>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Pending claim" value={data?.summary.pendingClaims ?? 0} icon={ScanBarcode} tone="orange" /><StatCard label="Active claims" value={data?.summary.activeLoans ?? 0} icon={BookOpen} tone="blue" /><StatCard label="Due today" value={data?.summary.dueToday ?? 0} icon={CalendarClock} tone="orange" /><StatCard label="Overdue" value={data?.summary.overdueLoans ?? 0} icon={AlertTriangle} tone="red" /><StatCard label="Returned today" value={data?.summary.returnedToday ?? 0} icon={CheckCircle2} tone="blue" /></div>
    {loading && !data ? <SectionCard className="p-10 text-center font-semibold text-[#003399]">Loading circulation monitor…</SectionCard> : <div className="space-y-5"><SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Online carts pending counter claim</h2></div>{table(lanes.pending, 'No students are currently on the way to claim books.')}</SectionCard><SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Active material claims waiting for return</h2></div>{table(lanes.active, 'No active claims.')}</SectionCard><SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Overdue records</h2></div>{table(lanes.overdue, 'No overdue records.')}</SectionCard>
      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#003399]/15 px-5 py-4">
          <h2 className="font-bold text-[#003399]">Long overdue and damage cases</h2>
          <label className="text-xs font-bold text-[#003399]">Filter
            <select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value as typeof caseFilter)} className="ml-2 h-9 rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-2 text-sm text-[#003399]">
              <option value="all">All open cases</option>
              <option value="Long Overdue">Long overdue</option>
              <option value="Damage">Damage</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[#003399] text-[#FFFFFF]"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Borrower / book</th><th className="px-4 py-3">Opened</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Latest action</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody>
              {cases.length ? cases.map((item) => (
                <tr key={item.caseId} className="border-b border-[#003399]/10">
                  <td className="px-4 py-4 font-bold text-[#003399]">{item.caseType}</td>
                  <td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.borrowerName}</p><p className="text-xs text-[#003399]/60">{item.borrowerSchoolId}</p><p className="mt-1 text-sm text-[#003399]">{item.title}</p><p className="font-mono text-xs text-[#003399]/60">{item.accessionNumber ?? item.barcode}</p></td>
                  <td className="px-4 py-4 text-xs text-[#003399]">{formatDate(item.openedAt)}</td>
                  <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-4 text-xs text-[#003399]">{item.latestEventType ?? '—'}</td>
                  <td className="px-4 py-4 text-right">
                    {['Resolved', 'Dismissed'].includes(item.status) ? null : (
                      resolveCaseId === item.caseId ? (
                        <div className="flex flex-col items-end gap-2">
                          <input value={resolveReason} onChange={(event) => setResolveReason(event.target.value)} placeholder="Resolution reason" className="h-9 w-56 rounded-lg border border-[#003399]/20 px-2 text-xs text-[#003399]" />
                          <div className="flex gap-2">
                            <button type="button" className="rounded-lg border border-[#003399]/20 px-3 py-2 text-xs font-bold text-[#003399]" onClick={() => { setResolveCaseId(null); setResolveReason('') }}>Cancel</button>
                            <button type="button" disabled={busyId === item.caseId} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-[#FFFFFF] disabled:opacity-40" onClick={() => void resolveOpenCase(item.caseId)}>Resolve</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-[#FFFFFF]" onClick={() => { setResolveCaseId(item.caseId); setResolveReason('') }}>Resolve</button>
                      )
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-[#003399]">No circulation cases match this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>}
    {damageTarget ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/40 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="damage-report-title" className="w-full max-w-md rounded-2xl border border-[#003399]/20 bg-[#FFFFFF] p-5 text-[#003399]">
          <h3 id="damage-report-title" className="text-lg font-bold">Report damage at return</h3>
          <p className="mt-2 text-sm">{damageTarget.title} · {damageTarget.userName}</p>
          <label className="mt-4 block text-xs font-bold">Observed damage
            <textarea required value={damageDescription} onChange={(event) => setDamageDescription(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-[#003399]/20 px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[#003399]/10" placeholder="Describe the damage found at the desk" />
          </label>
          {damageError ? <p role="alert" className="mt-3 text-sm font-semibold">{damageError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" disabled={busyId === damageTarget.transactionId} onClick={() => { if (busyId === null) setDamageTarget(null) }}>Cancel</Button>
            <Button disabled={busyId === damageTarget.transactionId} onClick={() => void submitDamageReport()}>{busyId === damageTarget.transactionId ? 'Saving…' : 'Complete return with damage case'}</Button>
          </div>
        </div>
      </div>
    ) : null}
    {cancelTarget ? <CancelBorrowRequestDialog title={cancelTarget.title} busy={busyId === cancelTarget.transactionId} error={cancelError} onCancel={() => { if (busyId === null) setCancelTarget(null) }} onConfirm={(reason) => void cancelPending(reason)} /> : null}
    {preflight ? (
      <CheckoutPreflightDialog
        title={preflight.copy?.title ?? 'this copy'}
        warnings={preflight.warnings}
        busy={submitting}
        error={confirmError}
        onCancel={() => { if (!submitting) { setPreflight(null); setConfirmError('') } }}
        onConfirm={(reason) => void confirmWarningCheckout(reason)}
      />
    ) : null}
  </>
}
