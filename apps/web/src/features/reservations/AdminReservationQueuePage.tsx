import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw, PackageCheck } from 'lucide-react'
import { Button, EmptyState, NoticeBanner, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { getCurrentIdentity } from '../auth/auth-storage'
import { reservationApi } from './reservation-api'
import { DialogShell, SwapCopyDialog } from './ReservationQueueDialogs'
import { AdminScheduledBorrowing } from './AdminScheduledBorrowing'
import { pickupDateLabel } from './borrowing-schedule-api'
import type { ReservationFilters, ReservationQueueItem, ReservationStatus } from './types'

const initial: ReservationFilters = { status: 'active', dateFrom: '', dateTo: '', user: '', role: '', kind: 'Reservation' }
const when = (s: string) =>
  new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
const label = (r: ReservationQueueItem) =>
  r.statusLabel ??
  ({
    pending: 'Waiting for a copy',
    approved: r.assignedCopyId ? 'Preparing' : 'Waiting for a copy',
    ready_for_pickup: 'Ready for pickup',
    claimed: 'Collected',
    expired: 'Expired',
    cancelled: 'Cancelled',
  }[r.status])

export function AdminReservationQueuePage() {
  const [params, setParams] = useSearchParams()
  const scheduled = params.get('tab') === 'scheduled'
  const [scheduleRefresh, setScheduleRefresh] = useState(0)

  function chooseTab(value: boolean) {
    const next = new URLSearchParams(params)
    if (value) next.set('tab', 'scheduled')
    else next.delete('tab')
    setParams(next, { replace: true })
  }

  const [filters, setFilters] = useState(initial)
  const [page, setPage] = useState(1)
  const query = useLiveQuery(`reservation-queue:${JSON.stringify(filters)}:${page}`, () => reservationApi.queue(filters, page))
  const items = query.data?.items ?? []
  const pages = query.data?.pagination.pages ?? 1
  const loading = query.loading
  const load = query.refresh
  const [busy, setBusy] = useState<number | null>(null)
  const [actionError, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cancel, setCancel] = useState<ReservationQueueItem | null>(null)
  const [swap, setSwap] = useState<ReservationQueueItem | null>(null)

  const cart = filters.kind === 'CartHandover'
  const workspace = getCurrentIdentity()?.role === 'Staff' ? '/staff' : '/librarian'
  const error = actionError || query.error?.message || ''
  const invalidRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
  const hasFilters = Boolean(filters.user || filters.role || filters.dateFrom || filters.dateTo || filters.status !== 'active')

  function filter(value: Partial<ReservationFilters>) {
    setFilters(f => ({ ...f, ...value }))
    setPage(1)
  }

  async function update(r: ReservationQueueItem, status: ReservationStatus) {
    setBusy(r.reservationId)
    setSuccess('')
    setError('')
    try {
      await reservationApi.adjustStatus(r.reservationId, status)
      setCancel(null)
      await load()
      setSuccess(
        status === 'ready_for_pickup'
          ? r.scheduledPickupDate
            ? `${r.materialTitle} is ready. Collect by closing time on ${pickupDateLabel(r.scheduledPickupDate)}.`
            : `${r.materialTitle} is ready. Its pickup timer has started.`
          : `${r.materialTitle} request cancelled.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request action failed.')
    } finally {
      setBusy(null)
    }
  }

  const done = (message: string) => {
    setSwap(null)
    setSuccess(message)
    void load()
  }

  return (
    <>
      <PageHeader
        eyebrow="Circulation desk"
        title="Book queue"
        description={
          cart
            ? 'Review available-book carts held until closing, then confirm handover at the counter.'
            : 'Pull assigned copies from the shelf and mark ready once set aside at the desk. A request is a place in line, not a loan.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-[38px] items-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]"
              to={`${workspace}/circulation`}
            >
              Open counter
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                if (scheduled) setScheduleRefresh(value => value + 1)
                else void load()
              }}
            >
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </Button>
          </div>
        }
      />

      <div
        role="tablist"
        aria-label="Book queue views"
        className="mb-5 flex gap-1 border-b border-[var(--sl-border)]"
        onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const next = e.key === 'Home' ? false : e.key === 'End' ? true : !scheduled
          chooseTab(next)
          e.currentTarget.querySelector<HTMLButtonElement>(next ? '#scheduled-tab' : '#requests-tab')?.focus()
        }}
      >
        <button
          id="requests-tab"
          type="button"
          role="tab"
          aria-selected={!scheduled}
          aria-controls="requests-panel"
          tabIndex={scheduled ? -1 : 0}
          onClick={() => chooseTab(false)}
          className={`-mb-px min-h-10 border-b-2 px-4 text-sm font-semibold transition-colors ${
            !scheduled
              ? 'border-[#0b5ea2] text-[#0b5ea2] dark:border-[#FFF200] dark:text-[#FFF200]'
              : 'border-transparent text-[var(--sl-text-secondary)] hover:text-[var(--sl-text-header)]'
          }`}
        >
          Book requests
        </button>
        <button
          id="scheduled-tab"
          type="button"
          role="tab"
          aria-selected={scheduled}
          aria-controls="scheduled-panel"
          tabIndex={scheduled ? 0 : -1}
          onClick={() => chooseTab(true)}
          className={`-mb-px min-h-10 border-b-2 px-4 text-sm font-semibold transition-colors ${
            scheduled
              ? 'border-[#0b5ea2] text-[#0b5ea2] dark:border-[#FFF200] dark:text-[#FFF200]'
              : 'border-transparent text-[var(--sl-text-secondary)] hover:text-[var(--sl-text-header)]'
          }`}
        >
          Scheduled
        </button>
      </div>

      {scheduled ? (
        <div role="tabpanel" id="scheduled-panel" aria-labelledby="scheduled-tab">
          <AdminScheduledBorrowing refreshKey={scheduleRefresh} />
        </div>
      ) : (
        <div role="tabpanel" id="requests-panel" aria-labelledby="requests-tab">
          {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
          {success ? <NoticeBanner tone="success">{success}</NoticeBanner> : null}
          {invalidRange ? (
            <NoticeBanner tone="warning">Requested from date must be on or before the end date.</NoticeBanner>
          ) : null}

          <SectionCard className="mb-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                Request type
                <select
                  aria-label="Request kind"
                  className="sl-input"
                  value={filters.kind}
                  onChange={e => filter({ kind: e.target.value as ReservationFilters['kind'], status: 'active' })}
                >
                  <option value="Reservation">Reservations</option>
                  <option value="CartHandover">Cart handovers</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                Borrower
                <input
                  aria-label="Find borrower"
                  placeholder="Name, school ID or email"
                  className="sl-input"
                  value={filters.user}
                  onChange={e => filter({ user: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                Status
                <select
                  aria-label="Request status"
                  className="sl-input"
                  value={filters.status}
                  onChange={e => filter({ status: e.target.value })}
                >
                  <option value="active">Active queue</option>
                  <option value="">All reservations and history</option>
                  <option value="approved">Preparing</option>
                  <option value="pending">Waiting for a copy</option>
                  <option value="ready_for_pickup">Ready for pickup</option>
                  <option value="claimed">Collected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                Role
                <select
                  aria-label="Borrower role"
                  className="sl-input"
                  value={filters.role}
                  onChange={e => filter({ role: e.target.value })}
                >
                  <option value="">Student + Faculty</option>
                  <option>Student</option>
                  <option>Faculty</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                Requested from
                <input
                  aria-label="Requested from"
                  className="sl-input"
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => filter({ dateFrom: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                Requested through
                <input
                  aria-label="Requested through"
                  className="sl-input"
                  type="date"
                  value={filters.dateTo}
                  onChange={e => filter({ dateTo: e.target.value })}
                />
              </label>
            </div>
          </SectionCard>

          {loading && !query.data ? (
            <SectionCard className="p-8 text-center text-sm text-[var(--sl-text-secondary)]">Loading book requests…</SectionCard>
          ) : items.length ? (
            <SectionCard className="overflow-hidden">
              <ResponsiveTable label="Book queue table">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <caption className="sr-only">Reservation queue in original waiting order</caption>
                  <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                    <tr>
                      {['Book & request', 'Borrower', 'Queue & status', 'Assigned copy & pickup', 'Actions'].map(h => (
                        <th scope="col" className="px-4 py-3" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sl-border)]">
                    {items.map(r => {
                      const terminal = ['claimed', 'cancelled', 'expired'].includes(r.status)
                      return (
                        <tr key={r.reservationId} className="align-top">
                          <td className="max-w-xs break-words px-4 py-3.5">
                            <p className="font-semibold text-[var(--sl-text-header)]">{r.materialTitle}</p>
                            <p className="mt-1 text-xs text-[var(--sl-text-muted)]">
                              {r.requestKind === 'CartHandover' ? 'Cart handover' : 'Reservation'} · {when(r.reservedAt)}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-[var(--sl-text)]">{r.userName}</p>
                            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                              {r.userRole} · {r.program ?? 'Program not recorded'}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-xs text-[var(--sl-text-muted)]">{r.institutionalId}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={label(r)} />
                            {!terminal && r.queuePosition !== null ? (
                              <p className="mt-1.5 text-xs font-semibold text-[var(--sl-text-header)] tabular-nums">
                                Queue position #{r.queuePosition}
                              </p>
                            ) : null}
                            {!terminal && r.lastSkipReason ? (
                              <p className="mt-1 text-xs text-[#92400e] dark:text-[#fcd34d]">
                                Skipped: {r.lastSkipReason}
                                {r.lastSkippedAt ? `, ${when(r.lastSkippedAt)}` : ''}
                              </p>
                            ) : null}
                          </td>
                          <td className="max-w-xs px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">
                            <p className="break-all font-mono font-semibold text-[var(--sl-text-header)]">
                              {r.barcode ?? 'Waiting for copy assignment'}
                            </p>
                            <p className="mt-0.5 text-[var(--sl-text-muted)]">
                              {r.accessionNumber ? `Acc. ${r.accessionNumber}` : 'No accession'} · {r.shelfLocation ?? 'Shelf not recorded'}
                            </p>
                            {r.scheduledPickupDate ? (
                              <p className="mt-1.5 font-semibold text-[var(--sl-text-header)]">
                                Scheduled pickup: {pickupDateLabel(r.scheduledPickupDate)} — hold ends at closing time.
                              </p>
                            ) : null}
                            {r.requestKind === 'CartHandover' && r.pickupDeadline && !terminal ? (
                              <p className="mt-1.5 font-semibold text-[#92400e] dark:text-[#fcd34d]">
                                Auto-cancels {when(r.pickupDeadline)}
                              </p>
                            ) : r.pickupDeadline ? (
                              <p className="mt-1.5 font-semibold text-[var(--sl-text-header)]">
                                Pickup deadline: {when(r.pickupDeadline)}
                              </p>
                            ) : !terminal ? (
                              <p className="mt-1.5 text-[var(--sl-text-muted)]">Pickup timer has not started.</p>
                            ) : null}
                            {r.emailStatus === 'Failed' ? (
                              <p role="status" data-tone="warning" className="mt-2 rounded-[6px] border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-xs text-[#92400e] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(180,83,9,0.24)] dark:text-[#fcd34d]">
                                Email delivery failed. In-app notice is live; retries run automatically (up to 5 attempts).
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {r.status === 'approved' && r.barcode && r.requestKind !== 'CartHandover' ? (
                                <Button size="sm" disabled={busy !== null} onClick={() => void update(r, 'ready_for_pickup')}>
                                  <PackageCheck size={14} aria-hidden="true" /> {busy === r.reservationId ? 'Working…' : 'Mark ready'}
                                </Button>
                              ) : null}
                              {r.status === 'ready_for_pickup' || (r.requestKind === 'CartHandover' && r.status === 'approved') ? (
                                <Link
                                  className="inline-flex min-h-8 items-center rounded-[6px] bg-[#0b5ea2] px-3 text-xs font-semibold text-white hover:bg-[#094e87]"
                                  to={`${workspace}/circulation?requestId=${r.reservationId}`}
                                >
                                  Start checkout
                                </Link>
                              ) : null}
                              {r.requestKind !== 'CartHandover' && ['approved', 'ready_for_pickup'].includes(r.status) && r.assignedCopyId ? (
                                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setSwap(r)}>
                                  Swap copy
                                </Button>
                              ) : null}
                              {!terminal ? (
                                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setCancel(r)}>
                                  Cancel request
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </ResponsiveTable>
            </SectionCard>
          ) : (
            <SectionCard>
              <EmptyState
                title={
                  filters.status === 'active'
                    ? cart
                      ? 'No active cart handovers.'
                      : 'No active reservations.'
                    : 'No book requests match these filters.'
                }
                description={
                  filters.status === 'active'
                    ? cart
                      ? 'Available-book carts sent by borrowers appear here until closing time.'
                      : 'Unavailable-book reservations will appear here in waiting order.'
                    : 'Try adjusting or clearing your filters to see more records.'
                }
                action={
                  hasFilters ? (
                    <Button variant="secondary" size="sm" onClick={() => { setFilters(initial); setPage(1) }}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </SectionCard>
          )}

          {items.length > 0 || page > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="text-xs font-medium text-[var(--sl-text-secondary)] tabular-nums">
                Page {page} of {Math.max(1, pages)}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}

          {swap ? <SwapCopyDialog item={swap} onClose={() => setSwap(null)} onDone={done} /> : null}
          {cancel ? (
            <DialogShell titleId="cancel-request-title" title="Cancel this book request?" busy={busy !== null} onClose={() => setCancel(null)}>
              <p className="my-4 text-sm text-[var(--sl-text)]">
                <strong>{cancel.materialTitle}</strong> for {cancel.userName}. The borrower will be notified and the held copy will be offered to the next eligible person waiting.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" disabled={busy !== null} onClick={() => setCancel(null)}>
                  Keep request
                </Button>
                <Button variant="danger" disabled={busy !== null} onClick={() => void update(cancel, 'cancelled')}>
                  Confirm cancellation
                </Button>
              </div>
            </DialogShell>
          ) : null}
        </div>
      )}
    </>
  )
}
