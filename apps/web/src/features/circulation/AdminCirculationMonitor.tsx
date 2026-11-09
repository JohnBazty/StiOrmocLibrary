import { AlertTriangle, BookOpen, CheckCircle2, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi } from '../reservations/reservation-api'
import { getCurrentIdentity } from '../auth/auth-storage'
import { circulationApi } from './circulation-api'
import type { CirculationMonitorData } from './types'
import { CancelBorrowRequestDialog } from './CancelBorrowRequestDialog'
import { ReportLostDialog } from './ReportLostDialog'
import { CirculationDesk } from './CirculationDesk'

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function AdminCirculationMonitor() {
  const [data, setData] = useState<CirculationMonitorData | null>(null)
  const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState(''); const [success, setSuccess] = useState('')
  const [returnBarcode,setReturnBarcode]=useState<{value:string;key:number}>()
  const [borrowerRequest, setBorrowerRequest] = useState<{reservationId?:number;transactionId?:number;key:number}>()
  const [deskBusy, setDeskBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'overdue' | 'pending'>('all')
  const [cancelTarget, setCancelTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [lostTarget, setLostTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [lostError, setLostError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await circulationApi.monitor()); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Circulation records are unavailable.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const requestId = Number(new URLSearchParams(window.location.search).get('requestId'))
    if (Number.isSafeInteger(requestId) && requestId > 0) setBorrowerRequest({reservationId:requestId,key:Date.now()})
  }, [])
  useEffect(() => {
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('smartlib:circulation-updated', refresh) }
  }, [load])

  async function cancelCart(id:number) {
    if(locked)return
    setBusyId(id);setError('')
    try {await reservationApi.adjustStatus(id,'cancelled');setSuccess('Cart handover cancelled. The copy is available for the next borrower.');await load()}
    catch(reason){setError(reason instanceof Error?reason.message:'The cart could not be cancelled.')}
    finally{setBusyId(null)}
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
  async function reportLost() {
    if (!lostTarget || busyId !== null) return
    setBusyId(lostTarget.transactionId); setLostError(''); setError(''); setSuccess('')
    try {
      const result = await circulationApi.reportLost(lostTarget.transactionId)
      setSuccess(result.alreadyReported ? 'This loss is already awaiting staff review.' : 'Loss reported and borrower notified. Review it in Admin clearance.')
      setLostTarget(null)
      await load()
    } catch (reason) { setLostError(reason instanceof Error ? reason.message : 'The loss could not be reported.') }
    finally { setBusyId(null) }
  }
  const lanes = useMemo(() => ({
    pending: data?.items.filter((item) => item.status === 'Pending' && !data.requests?.some(request => request.reservationId === item.reservationId)) ?? [],
    active: data?.items.filter((item) => ['Borrowed', 'Active'].includes(item.status)) ?? [],
    overdue: data?.items.filter((item) => item.status === 'Overdue') ?? [],
  }), [data])

  const openItems = data?.items.filter(item => ['Pending', 'Borrowed', 'Active', 'Overdue'].includes(item.status) && !(item.status === 'Pending' && data.requests?.some(request => request.reservationId === item.reservationId))) ?? []
  const filtered = (filter === 'all' ? openItems : lanes[filter]).filter(item =>
    [item.userName, item.schoolId, item.title, item.barcode, item.accessionNumber ?? ''].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
  const pickups = (data?.requests ?? []).filter(item => [item.userName,item.schoolId,item.title,item.barcode].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
  const workspace = getCurrentIdentity()?.role === 'Staff' ? '/staff' : '/librarian'
  const locked = deskBusy || busyId !== null

  return <>
    <PageHeader eyebrow="Library counter" title="Borrow & return" action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <div role="alert" className="auth-error mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm"><AlertTriangle size={18} />{error}</div> : null}
    {success ? <div role="status" className="mb-4 flex items-center gap-3 rounded-xl bg-[#FFF200] px-4 py-3 text-sm font-semibold text-[#0b5ea2]"><CheckCircle2 size={18} />{success}</div> : null}
    <CirculationDesk onChanged={() => void load()} returnBarcode={returnBarcode} borrowerRequest={borrowerRequest} onBusyChange={setDeskBusy} />
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#0b5ea2]/10 p-5 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Find a loan</h2><p className="text-xs opacity-60">{data?.summary.returnedToday ?? 0} returned today</p></div>
        <label className="relative mt-4 block"><Search size={18} className="pointer-events-none absolute left-3 top-3.5 opacity-50" /><span className="sr-only">Search loans</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search book, borrower, school ID or barcode" className="min-h-11 w-full rounded-xl border border-[#0b5ea2]/15 bg-white pl-10 pr-3 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2] dark:border-white/20 dark:bg-white/5 dark:text-white" /></label>
        <div role="group" aria-label="Loan filters" className="mt-3 flex flex-wrap gap-2">{([
          ['all', 'All open', openItems.length + (data?.requests?.length ?? 0)], ['active', 'Borrowed', lanes.active.length], ['overdue', 'Overdue', lanes.overdue.length], ['pending', 'Pending pickup', lanes.pending.length + (data?.requests?.length ?? 0)],
        ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold ${filter === value ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white' : 'border-[#0b5ea2]/15 dark:border-white/20'}`}>{label} <span className="ml-1 opacity-65">{count}</span></button>)}</div>
      </div>
      {(filter === 'all' || filter === 'pending') && pickups.length ? <div className="divide-y divide-[#0b5ea2]/10 dark:divide-white/10">{pickups.map(item => <article key={`request-${item.reservationId}`} aria-label={`${item.title} pickup`} className="flex flex-col justify-between gap-4 border-b border-[#0b5ea2]/10 p-5 sm:flex-row sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold">{item.title}</h3><StatusBadge status={item.requestKind==='CartHandover'?'Awaiting handover':'Ready for pickup'} /></div><p className="mt-1 text-sm opacity-75">{item.userName} · {item.schoolId}</p><p className="mt-1 break-all font-mono text-xs opacity-60">{item.barcode}</p><p className="mt-2 text-xs opacity-65">{item.requestKind==='CartHandover'?'Cart sent to desk':`Collect by ${formatDate(item.pickupDeadline)}`} · No loan started</p></div><div className="flex shrink-0 flex-col gap-2"><Button disabled={locked} onClick={() => { setError(''); setSuccess(''); setBorrowerRequest(previous => ({reservationId:item.reservationId,key:(previous?.key ?? 0)+1})) }}><BookOpen size={16} /> Start checkout</Button>{item.requestKind==='CartHandover'?<Button variant="secondary" disabled={locked} onClick={()=>void cancelCart(item.reservationId)}>Cancel handover</Button>:<a href={`${workspace}/reservations`} className="rounded-lg px-3 py-2 text-center text-xs font-semibold">Manage reservation</a>}</div></article>)}</div> : null}
      {loading && !data ? <p role="status" className="p-8 text-center text-sm opacity-65">Loading loans…</p> : <div className="divide-y divide-[#0b5ea2]/10 dark:divide-white/10">{filtered.length ? filtered.map(item => <article key={item.transactionId} aria-label={`${item.title} loan`} className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><h3 className="break-words font-bold">{item.title}</h3><StatusBadge status={item.status === 'Pending' ? (item.reservationId ? 'In request queue' : 'Pending pickup') : item.status} /></div><p className="break-words text-sm opacity-75">{item.userName} · {item.schoolId}</p><p className="mt-1 break-all font-mono text-xs opacity-55">{item.barcode}</p><p className="mt-2 text-xs opacity-65">{item.status === 'Pending' ? `Requested ${formatDate(item.requestedAt)}` : `Due ${formatDate(item.dueDate)}`}</p></div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {item.status === 'Pending' && item.reservationId ? <a href={`${workspace}/reservations`} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0b5ea2] px-4 py-2 text-sm font-semibold text-white">Prepare request</a> : item.status === 'Pending' ? <Button disabled={locked} onClick={() => { setError(''); setSuccess(''); setBorrowerRequest(previous => ({...(item.reservationId ? {reservationId:item.reservationId} : {transactionId:item.transactionId}),key:(previous?.key ?? 0)+1})) }}><BookOpen size={16} /> Start checkout</Button> : <Button disabled={locked} onClick={() => { setError(''); setSuccess(''); setReturnBarcode(previous => ({ value: item.barcode, key: (previous?.key ?? 0) + 1 })) }}>Return book</Button>}
            <details className="text-sm"><summary className="min-h-10 cursor-pointer rounded-lg px-3 py-2 text-center text-xs font-semibold opacity-65 hover:bg-[#0b5ea2]/5 dark:hover:bg-white/10">More actions</summary><div className="mt-2 flex flex-wrap justify-end gap-2">{item.status === 'Pending' ? <Button variant="secondary" disabled={locked} onClick={() => { setCancelError(''); setCancelTarget(item) }}>Cancel request</Button> : <>{item.status === 'Overdue' ? <Button variant="secondary" disabled={locked} onClick={() => void penalty(item.transactionId)}>Calculate penalty</Button> : null}<Button variant="secondary" disabled={locked} onClick={() => { setLostError(''); setLostTarget(item) }}>Report lost</Button></>}</div></details>
          </div>
        </div>
      </article>) : <p className="p-8 text-center text-sm opacity-65">{(filter === 'all' || filter === 'pending') && pickups.length ? 'Borrowed books will appear here after handover.' : query ? 'No loans match your search.' : 'No loans in this view.'}</p>}</div>}
    </SectionCard>
    {cancelTarget ? <CancelBorrowRequestDialog title={cancelTarget.title} busy={busyId === cancelTarget.transactionId} error={cancelError} onCancel={() => { if (busyId === null) setCancelTarget(null) }} onConfirm={reason => void cancelPending(reason)} /> : null}
    {lostTarget ? <ReportLostDialog title={lostTarget.title} busy={busyId === lostTarget.transactionId} error={lostError} onCancel={() => { if (busyId === null) setLostTarget(null) }} onConfirm={() => void reportLost()} /> : null}
  </>
}
