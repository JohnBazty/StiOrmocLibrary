import { formatLoanDate } from './loan-time'
import { BookOpen, CalendarPlus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, NoticeBanner, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { reservationApi } from '../reservations/reservation-api'
import { getCurrentIdentity } from '../auth/auth-storage'
import { circulationApi } from './circulation-api'
import type { CirculationMonitorData } from './types'
import { CancelBorrowRequestDialog } from './CancelBorrowRequestDialog'
import { ReportLostDialog } from './ReportLostDialog'
import { StaffRenewLoanDialog } from './StaffRenewLoanDialog'
import { CirculationDesk } from './CirculationDesk'
import { DamageCasesPanel } from './DamageCasesPanel'
import { RefreshButton } from '../../components/RefreshButton'

function formatDate(value: string | null) {
  return formatLoanDate(value, '—')
}

export function AdminCirculationMonitor() {
  const [data, setData] = useState<CirculationMonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [returnBarcode, setReturnBarcode] = useState<{ value: string; key: number }>()
  const [borrowerRequest, setBorrowerRequest] = useState<{ reservationId?: number; transactionId?: number; key: number }>()
  const [deskBusy, setDeskBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'overdue' | 'pending'>('all')
  const [cancelTarget, setCancelTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [lostTarget, setLostTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [renewTarget, setRenewTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [lostError, setLostError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await circulationApi.monitor())
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Circulation records are unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const requestId = Number(new URLSearchParams(window.location.search).get('requestId'))
    if (Number.isSafeInteger(requestId) && requestId > 0) setBorrowerRequest({ reservationId: requestId, key: Date.now() })
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('smartlib:circulation-updated', refresh)
    }
  }, [load])

  async function cancelCart(id: number) {
    if (locked) return
    setBusyId(id)
    setError('')
    try {
      await reservationApi.adjustStatus(id, 'cancelled')
      setSuccess('Cart handover cancelled. The copy is available for the next borrower.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The cart could not be cancelled.')
    } finally {
      setBusyId(null)
    }
  }

  async function penalty(transactionId: number) {
    setBusyId(transactionId)
    setError('')
    setSuccess('')
    try {
      const result = await circulationApi.calculatePenalty(transactionId)
      setSuccess(`Calculated penalty: ₱${result.amount.toFixed(2)}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Penalty could not be calculated.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancelPending(reason: string) {
    if (!cancelTarget || busyId !== null) return
    const target = cancelTarget
    setBusyId(target.transactionId)
    setCancelError('')
    setError('')
    setSuccess('')
    try {
      await circulationApi.cancelRequest(target.transactionId, reason)
      setData(current =>
        current
          ? {
              ...current,
              summary: { ...current.summary, pendingClaims: Math.max(0, current.summary.pendingClaims - 1) },
              items: current.items.filter(item => item.transactionId !== target.transactionId),
            }
          : current,
      )
      setCancelTarget(null)
      setSuccess(`${target.title} pending claim was cancelled and released.`)
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
      await load()
    } catch (reasonValue) {
      setCancelError(reasonValue instanceof Error ? reasonValue.message : 'The pending request could not be cancelled.')
    } finally {
      setBusyId(null)
    }
  }

  async function reportLost() {
    if (!lostTarget || busyId !== null) return
    setBusyId(lostTarget.transactionId)
    setLostError('')
    setError('')
    setSuccess('')
    try {
      const result = await circulationApi.reportLost(lostTarget.transactionId)
      setSuccess(
        result.alreadyReported
          ? 'This loss is already awaiting staff review.'
          : 'Loss reported and borrower notified. Review it in Clearance management.',
      )
      setLostTarget(null)
      await load()
    } catch (reason) {
      setLostError(reason instanceof Error ? reason.message : 'The loss could not be reported.')
    } finally {
      setBusyId(null)
    }
  }

  const lanes = useMemo(
    () => ({
      pending:
        data?.items.filter(
          item => item.status === 'Pending' && !data.requests?.some(request => request.reservationId === item.reservationId),
        ) ?? [],
      active: data?.items.filter(item => ['Borrowed', 'Active'].includes(item.status)) ?? [],
      overdue: data?.items.filter(item => item.status === 'Overdue') ?? [],
    }),
    [data],
  )

  const openItems =
    data?.items.filter(
      item =>
        ['Pending', 'Borrowed', 'Active', 'Overdue'].includes(item.status) &&
        !(item.status === 'Pending' && data.requests?.some(request => request.reservationId === item.reservationId)),
    ) ?? []

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = (filter === 'all' ? openItems : lanes[filter]).filter(item =>
    [item.userName, item.schoolId, item.title, item.barcode, item.accessionNumber ?? ''].some(value =>
      value.toLowerCase().includes(normalizedQuery),
    ),
  )
  const pickups = (data?.requests ?? []).filter(item =>
    [item.userName, item.schoolId, item.title, item.barcode].some(value => value.toLowerCase().includes(normalizedQuery)),
  )
  const workspace = getCurrentIdentity()?.role === 'Staff' ? '/staff' : '/librarian'
  const locked = deskBusy || busyId !== null
  const showPickups = (filter === 'all' || filter === 'pending') && pickups.length > 0
  const hasFilters = Boolean(normalizedQuery) || filter !== 'all'

  return (
    <>
      <PageHeader
        eyebrow="Library counter"
        title="Borrow & return"
        description="Scan borrowers and copies at the counter, hand over ready pickups, and process returns (Philippine time)."
        action={
          <RefreshButton onRefresh={() => load()} variant="secondary" />
        }
      />
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {success ? <NoticeBanner tone="success">{success}</NoticeBanner> : null}

      <CirculationDesk
        onChanged={() => void load()}
        returnBarcode={returnBarcode}
        borrowerRequest={borrowerRequest}
        onBusyChange={setDeskBusy}
      />

      <SectionCard className="overflow-hidden">
        <div className="border-b border-[var(--sl-border)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Active counter queue &amp; open loans</h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                {data?.summary.returnedToday ?? 0} returned today · Click an action to load the copy into the counter above.
              </p>
            </div>
            <label className="relative block w-full sm:w-80">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sl-text-muted)]" aria-hidden="true" />
              <span className="sr-only">Search loans</span>
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search book, borrower, school ID or barcode"
                className="sl-input pl-9"
              />
            </label>
          </div>
          <div role="group" aria-label="Loan filters" className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'All open', openItems.length + (data?.requests?.length ?? 0)],
                ['active', 'Borrowed', lanes.active.length],
                ['overdue', 'Overdue', lanes.overdue.length],
                ['pending', 'Pending pickup', lanes.pending.length + (data?.requests?.length ?? 0)],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === value
                    ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white'
                    : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-header)]'
                }`}
              >
                <span>{label}</span>
                <span className={`rounded-full px-1.5 py-0.2 tabular-nums ${filter === value ? 'bg-white/20 text-white' : 'bg-[var(--sl-bg-subtle)] text-[var(--sl-text-muted)]'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {showPickups ? (
          <div className="border-b border-[var(--sl-border)]">
            <div className="bg-[var(--sl-bg-subtle)] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--sl-text-secondary)]">
              Ready for counter handover ({pickups.length})
            </div>
            <ResponsiveTable label="Ready pickups and cart handovers">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]">
                  <tr>
                    <th scope="col" className="px-5 py-2.5">Book &amp; barcode</th>
                    <th scope="col" className="px-4 py-2.5">Borrower</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5">Pickup window</th>
                    <th scope="col" className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {pickups.map(item => (
                    <tr key={`request-${item.reservationId}`} className="align-middle">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-[var(--sl-text-header)]">{item.title}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-[var(--sl-text-muted)]">{item.barcode}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--sl-text)]">{item.userName}</p>
                        <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{item.schoolId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.requestKind === 'CartHandover' ? 'Awaiting handover' : 'Ready for pickup'} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--sl-text-secondary)]">
                        <p>{item.requestKind === 'CartHandover' ? 'Cart sent to desk' : `Collect by ${formatDate(item.pickupDeadline)}`}</p>
                        <p className="mt-0.5 text-[var(--sl-text-muted)]">No loan started yet</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={locked}
                            onClick={() => {
                              setError('')
                              setSuccess('')
                              setBorrowerRequest(previous => ({
                                reservationId: item.reservationId,
                                key: (previous?.key ?? 0) + 1,
                              }))
                            }}
                          >
                            <BookOpen size={14} aria-hidden="true" /> Start checkout
                          </Button>
                          {item.requestKind === 'CartHandover' ? (
                            <Button size="sm" variant="secondary" disabled={locked} onClick={() => void cancelCart(item.reservationId)}>
                              Cancel handover
                            </Button>
                          ) : (
                            <a
                              href={`${workspace}/reservations`}
                              className="inline-flex min-h-8 items-center rounded-[6px] px-2.5 text-xs font-semibold text-[#0b5ea2] hover:bg-[var(--sl-bg-hover)] dark:text-[#93c5fd]"
                            >
                              Manage reservation
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        ) : null}

        {loading && !data ? (
          <p role="status" className="p-8 text-center text-sm text-[var(--sl-text-secondary)]">
            Loading loans…
          </p>
        ) : filtered.length ? (
          <ResponsiveTable label="Open circulation loans">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Book &amp; barcode</th>
                  <th scope="col" className="px-4 py-2.5">Borrower</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  <th scope="col" className="px-4 py-2.5">Due / requested</th>
                  <th scope="col" className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {filtered.map(item => (
                  <tr
                    key={item.transactionId}
                    className={item.status === 'Overdue' ? 'bg-[#fef2f2]/45 align-top dark:bg-[rgba(180,35,24,0.10)]' : 'align-top'}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[var(--sl-text-header)]">{item.title}</p>
                      <p className="mt-0.5 break-all font-mono text-xs text-[var(--sl-text-muted)]">{item.barcode}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-[var(--sl-text)]">{item.userName}</p>
                      <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{item.schoolId}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge
                        status={
                          item.status === 'Pending'
                            ? item.reservationId
                              ? 'In request queue'
                              : 'Pending pickup'
                            : item.status
                        }
                      />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)] tabular-nums">
                      <p>{item.status === 'Pending' ? `Requested ${formatDate(item.requestedAt)}` : `Due ${formatDate(item.dueDate)}`}</p>
                      {item.status !== 'Pending' && typeof item.renewalCount === 'number' ? (
                        <p className="mt-1 text-[var(--sl-text-muted)]">
                          Renewed {item.renewalCount} of {item.maxRenewals}
                          {item.lastRenewalDecisionSource ? ` · Last renewal: ${item.lastRenewalDecisionSource}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                        {item.status === 'Pending' && item.reservationId ? (
                          <a
                            href={`${workspace}/reservations`}
                            className="inline-flex min-h-8 items-center justify-center rounded-[6px] bg-[#0b5ea2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#094e87]"
                          >
                            Prepare request
                          </a>
                        ) : item.status === 'Pending' ? (
                          <Button
                            size="sm"
                            disabled={locked}
                            onClick={() => {
                              setError('')
                              setSuccess('')
                              setBorrowerRequest(previous => ({
                                ...(item.reservationId ? { reservationId: item.reservationId } : { transactionId: item.transactionId }),
                                key: (previous?.key ?? 0) + 1,
                              }))
                            }}
                          >
                            <BookOpen size={14} aria-hidden="true" /> Start checkout
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={locked}
                            onClick={() => {
                              setError('')
                              setSuccess('')
                              setReturnBarcode(previous => ({ value: item.barcode, key: (previous?.key ?? 0) + 1 }))
                            }}
                          >
                            Return book
                          </Button>
                        )}
                        <details className="text-right text-xs">
                          <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-[6px] px-2.5 py-1 font-semibold text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]">
                            More actions
                          </summary>
                          <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                            {item.status === 'Pending' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={locked}
                                onClick={() => {
                                  setCancelError('')
                                  setCancelTarget(item)
                                }}
                              >
                                Cancel request
                              </Button>
                            ) : (
                              <>
                                {item.canRequestRenewal && item.status === 'Borrowed' ? (
                                  <Button size="sm" variant="secondary" disabled={locked} onClick={() => setRenewTarget(item)}>
                                    <CalendarPlus size={13} aria-hidden="true" /> Renew on behalf
                                  </Button>
                                ) : null}
                                {item.status === 'Overdue' ? (
                                  <Button size="sm" variant="secondary" disabled={locked} onClick={() => void penalty(item.transactionId)}>
                                    Calculate penalty
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={locked}
                                  onClick={() => {
                                    setLostError('')
                                    setLostTarget(item)
                                  }}
                                >
                                  Report lost
                                </Button>
                              </>
                            )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        ) : (
          <EmptyState
            title={
              showPickups
                ? 'Borrowed books will appear here after handover.'
                : normalizedQuery
                  ? 'No loans match your search.'
                  : 'No loans in this view.'
            }
            description={
              hasFilters
                ? 'Try clearing your search or switching back to All open loans.'
                : 'Scan a borrower ID or book barcode at the counter above to start a checkout.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </SectionCard>

      <DamageCasesPanel />

      {cancelTarget ? (
        <CancelBorrowRequestDialog
          title={cancelTarget.title}
          busy={busyId === cancelTarget.transactionId}
          error={cancelError}
          onCancel={() => {
            if (busyId === null) setCancelTarget(null)
          }}
          onConfirm={reason => void cancelPending(reason)}
        />
      ) : null}
      {renewTarget ? (
        <StaffRenewLoanDialog
          transactionId={renewTarget.transactionId}
          title={renewTarget.title}
          borrowerName={renewTarget.userName}
          onCancel={() => setRenewTarget(null)}
          onSuccess={decision => {
            setRenewTarget(null)
            setSuccess(`${renewTarget.title} was renewed for ${renewTarget.userName} until ${formatDate(decision.newDueAt)}.`)
            window.dispatchEvent(new Event('smartlib:circulation-updated'))
            void load()
          }}
        />
      ) : null}
      {lostTarget ? (
        <ReportLostDialog
          title={lostTarget.title}
          busy={busyId === lostTarget.transactionId}
          error={lostError}
          onCancel={() => {
            if (busyId === null) setLostTarget(null)
          }}
          onConfirm={() => void reportLost()}
        />
      ) : null}
    </>
  )
}
