import { BadgeCheck, Clock3, Download, Eye, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import {
  Button,
  LumoDialog,
  NoticeBanner,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { getCsrfToken } from '../auth/auth-storage'
import { usePaymentUpdates } from '../payments/payment-updates'
import { clearanceApi } from './clearance-api'
import { ClearanceScheduleEditor } from './ClearanceScheduleEditor'
import type { ClearanceList, ClearanceRecord } from './types'
import { RefreshButton } from '../../components/RefreshButton'

function lostResolution(item: ClearanceRecord['lostBooks'][number]) {
  return (
    item.chargeResolution ||
    (item.status === 'Confirmed' ? (item.replacementCharge > 0 ? 'Quoted' : 'Awaiting Quotation') : 'Awaiting Review')
  )
}

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
}

function date(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function AdminClearancePage() {
  const isLibrarian = useLocation().pathname.startsWith('/librarian/')
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab')
  const tab =
    requestedTab === 'lost' && isLibrarian
      ? 'lost'
      : requestedTab === 'schedules' && isLibrarian
        ? 'schedules'
        : 'students'

  function openTab(next: string) {
    const nextParams = new URLSearchParams(params)
    if (next === 'students') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setParams(nextParams)
  }

  const statusFilter = params.get('status') ?? ''
  const activeOnly = params.get('active') === '1'

  function updateUrlFilters(nextStatus: string, nextActiveOnly: boolean) {
    const nextParams = new URLSearchParams(params)
    if (nextStatus) nextParams.set('status', nextStatus)
    else nextParams.delete('status')
    if (nextActiveOnly) nextParams.set('active', '1')
    else nextParams.delete('active')
    setParams(nextParams)
  }

  const [data, setData] = useState<ClearanceList | null>(null)
  const [selected, setSelected] = useState<ClearanceRecord | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [busy, setBusy] = useState(false)
  const [overrideFormOpen, setOverrideFormOpen] = useState(false)
  const [revocationFormOpen, setRevocationFormOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const selectedId = useRef<number | null>(null)
  selectedId.current = selected?.student.userId ?? null
  const loadSequence = useRef(0)

  const hasFilters = Boolean(search.trim() || statusFilter || activeOnly)

  const load = useCallback(
    async (term = search) => {
      const sequence = ++loadSequence.current
      const userId = selectedId.current
      try {
        const [result, detail] = await Promise.all([
          clearanceApi.list(term, statusFilter, activeOnly),
          userId ? clearanceApi.detail(userId) : Promise.resolve(null),
        ])
        if (sequence !== loadSequence.current) return
        setData(result)
        if (detail) setSelected(current => (current?.student.userId === userId ? detail : current))
        setError('')
      } catch (reason) {
        if (sequence === loadSequence.current) {
          setError(reason instanceof Error ? reason.message : 'Clearance records are unavailable.')
        }
      }
    },
    [search, statusFilter, activeOnly],
  )

  useEffect(() => {
    void load('')
  }, [statusFilter, activeOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  usePaymentUpdates(() => (busy ? undefined : load()))

  async function open(userId: number) {
    try {
      setSelected(await clearanceApi.detail(userId))
      setOverrideFormOpen(false)
      setRevocationFormOpen(false)
      setHistoryOpen(false)
      setModalError('')
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Student clearance details are unavailable.')
    }
  }

  async function override(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    setBusy(true)
    setModalError('')
    try {
      const result = await clearanceApi.override(selected.student.userId, {
        status: 'Cleared',
        reason: String(values.reason),
        expiresAt: null,
      })
      setSelected(result.clearance)
      setOverrideFormOpen(false)
      setError('')
      await load()
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : 'The override could not be recorded.'
      setModalError(msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected?.activeOverride || busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const reason = String(values.reason ?? '').trim()
    if (!reason) return
    setBusy(true)
    setModalError('')
    try {
      setSelected(await clearanceApi.revoke(selected.student.userId, selected.activeOverride.overrideId, reason))
      setRevocationFormOpen(false)
      setError('')
      await load()
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'The override could not be revoked.'
      setModalError(msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function decide(
    reportId: number,
    status: 'Confirmed' | 'Rejected',
    quotedAmount: number | null,
    titlePrice: number | null,
  ) {
    if (
      status === 'Confirmed' &&
      !window.confirm(
        titlePrice
          ? `Confirm this loss and charge the book price of ${money(titlePrice)}? No extra fee is added.`
          : quotedAmount
            ? `Confirm this loss and charge the supplier quotation amount of ${money(quotedAmount)}?`
            : 'Confirm this loss with no charge yet? Staff can record a quotation or record a documented non-monetary resolution later.',
      )
    ) {
      return
    }
    setBusy(true)
    setModalError('')
    try {
      await clearanceApi.decideLost(reportId, status, status === 'Confirmed' ? titlePrice ?? quotedAmount : null)
      if (selected) await open(selected.student.userId)
      await load()
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'The lost-book report could not be updated.'
      setModalError(msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function settle(reportId: number) {
    setBusy(true)
    setModalError('')
    try {
      await clearanceApi.settleLost(reportId)
      if (selected) await open(selected.student.userId)
      await load()
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'The replacement payment could not be recorded.'
      setModalError(msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function resolve(reportId: number, action: 'Charge' | 'Waive', quotedAmount: number | null) {
    const reason =
      action === 'Waive' ? window.prompt('Document the non-monetary resolution (at least 10 characters):')?.trim() : ''
    if (action === 'Waive') {
      if (reason == null) return
      if (reason.length < 10) {
        setModalError('Enter at least 10 characters documenting the non-monetary resolution.')
        return
      }
    }
    if (action === 'Charge' && (!quotedAmount || !window.confirm(`Assess ${money(quotedAmount)} from the current supplier quotation?`))) {
      return
    }
    setBusy(true)
    setModalError('')
    try {
      await clearanceApi.resolveLost(reportId, action, reason)
      if (selected) await open(selected.student.userId)
      await load()
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'The loss resolution could not be recorded.'
      setModalError(msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv() {
    const headers = new Headers({ Accept: 'text/csv' })
    const token = getCsrfToken()
    if (token) headers.set('X-CSRF-Token', token)
    const response = await fetch('/api/v1/admin/clearance/export.csv', { headers })
    if (!response.ok) {
      setError('Clearance export failed.')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'smartlib-clearance.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setSearch('')
    updateUrlFilters('', false)
    void load('')
  }

  const tabs = [
    ['students', 'Student clearance'],
    ...(isLibrarian
      ? [
          ['lost', 'Lost-book reports'],
          ['schedules', 'Schedules'],
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow="Student standing"
        title="Clearance management"
        description="Live obligations, documented exceptions, lost-book charges, and audit history."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton onRefresh={() => load()} variant="secondary" />
            <Button onClick={() => void exportCsv()}>
              <Download size={16} aria-hidden="true" /> Export bulk status
            </Button>
          </div>
        }
      />

      <nav aria-label="Clearance tasks" className="mb-5 flex flex-wrap gap-1 border-b border-[var(--sl-border)]">
        {tabs.map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => openTab(key)}
              className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#0b5ea2] text-[#0b5ea2] dark:border-[#93c5fd] dark:text-[#93c5fd]'
                  : 'border-transparent text-[var(--sl-text-secondary)] hover:border-[var(--sl-border-strong)] hover:text-[var(--sl-text-header)]'
              }`}
            >
              {label}
            </button>
          )
        })}
      </nav>

      {tab === 'schedules' && isLibrarian ? <ClearanceScheduleEditor /> : null}
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}

      {tab === 'students' ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <StatCard label="Students" value={data?.summary.totalStudents ?? '—'} icon={BadgeCheck} />
          <StatCard label="Cleared" value={data?.summary.cleared ?? '—'} icon={BadgeCheck} tone="success" />
          <StatCard label="Pending clearance" value={data?.summary.pending ?? '—'} icon={Clock3} tone="warning" />
          <StatCard label="Active overrides" value={data?.summary.activeOverrides ?? '—'} icon={ShieldCheck} />
        </div>
      ) : null}

      {isLibrarian && tab === 'lost' ? (
        <SectionCard className="mb-5 overflow-hidden">
          <div className="border-b border-[var(--sl-border)] px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
              Lost-book reports awaiting review ({data?.pendingLostReports.length ?? 0})
            </h2>
            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
              Student and faculty reports appear here as soon as they are submitted.
            </p>
          </div>
          {!data ? (
            <p className="p-6 text-sm text-[var(--sl-text-secondary)]">Loading lost-book reports…</p>
          ) : data.pendingLostReports.length ? (
            <ResponsiveTable label="Lost-book reports awaiting review">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                  <tr>
                    {['Book title', 'Borrower', 'Role', 'Reported date', 'Actions'].map(col => (
                      <th key={col} scope="col" className="px-4 py-2.5">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {data.pendingLostReports.map(report => (
                    <tr key={report.lostBookReportId} className="align-middle">
                      <td className="px-4 py-3.5 font-semibold text-[var(--sl-text-header)]">{report.title}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-[var(--sl-text)]">{report.borrowerName}</p>
                        <p className="text-xs text-[var(--sl-text-muted)]">{report.schoolId}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">{report.role}</td>
                      <td className="px-4 py-3.5 text-xs tabular-nums text-[var(--sl-text-secondary)]">
                        Reported {date(report.reportedAt)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button variant="secondary" size="sm" onClick={() => void open(report.userId)}>
                          <Eye size={14} aria-hidden="true" /> Review report
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          ) : (
            <p className="p-6 text-sm text-[var(--sl-text-secondary)]">
              No lost-book reports are waiting for review.
            </p>
          )}
        </SectionCard>
      ) : null}

      {tab === 'students' ? (
        <SectionCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
                Clearance master list
              </h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">Computed from authoritative transactions</p>
            </div>
            <form
              onSubmit={event => {
                event.preventDefault()
                void load(search)
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label="Find a student"
                placeholder="Search student or ID"
                className="sl-input w-64"
              />
              <Button type="submit" size="sm">
                Search
              </Button>
            </form>
          </div>

          <div
            role="group"
            aria-label="Filter clearance standing"
            className="flex flex-wrap items-center gap-1.5 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-2.5"
          >
            {(
              [
                ['', 'All standings'],
                ['Cleared', 'Cleared'],
                ['Not Cleared', 'Not Cleared'],
              ] as const
            ).map(([value, label]) => {
              const active = statusFilter === value
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateUrlFilters(value, activeOnly)}
                  className={`inline-flex min-h-8 items-center rounded-[6px] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white'
                      : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
            <button
              type="button"
              aria-pressed={activeOnly}
              onClick={() => updateUrlFilters(statusFilter, !activeOnly)}
              className={`inline-flex min-h-8 items-center rounded-[6px] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                activeOnly
                  ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white'
                  : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]'
              }`}
            >
              Active accounts only
            </button>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={13} aria-hidden="true" /> Clear filters
              </Button>
            ) : null}
          </div>

          <ResponsiveTable label="Clearance master list">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Student</th>
                  <th scope="col" className="px-4 py-2.5">Program</th>
                  <th scope="col" className="px-4 py-2.5">Unreturned</th>
                  <th scope="col" className="px-4 py-2.5">Outstanding</th>
                  <th scope="col" className="px-4 py-2.5">Standing</th>
                  <th scope="col" className="px-4 py-2.5">Reason</th>
                  <th scope="col" className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {data?.items.length ? (
                  data.items.map(item => (
                    <tr key={item.student.userId} className="align-top">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-[var(--sl-text-header)]">{item.student.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{item.student.schoolId}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">
                        {item.student.program ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
                        {item.summary.activeLoans}
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
                        {money(item.summary.totalOutstanding)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="max-w-xs px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">{item.reason}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Button variant="secondary" size="sm" onClick={() => void open(item.student.userId)}>
                          <Eye size={14} aria-hidden="true" /> Review
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-10 text-center">
                      <p className="font-semibold text-[var(--sl-text-header)]">
                        {!data
                          ? error
                            ? 'Unable to load clearance records. Use Refresh to try again.'
                            : 'Loading clearance records…'
                          : 'No students match this search.'}
                      </p>
                      {data && hasFilters ? (
                        <div className="mt-3">
                          <Button variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </SectionCard>
      ) : null}

      {selected ? (
        <LumoDialog
          title={selected.student.name}
          description={`${selected.student.schoolId} · ${selected.student.program ?? 'No program listed'}`}
          size="lg"
          busy={busy}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0b5ea2] dark:text-[#93c5fd]">
              Clearance review
            </p>

            {modalError ? <NoticeBanner tone="error">{modalError}</NoticeBanner> : null}

            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard
                label="Standing"
                value={selected.status}
                icon={BadgeCheck}
                tone={selected.status === 'Cleared' ? 'success' : 'error'}
              />
              <StatCard label="Unreturned" value={selected.summary.activeLoans} icon={Clock3} />
              <StatCard label="Outstanding fines" value={money(selected.summary.unpaidOverdueFines)} icon={Clock3} />
              <StatCard label="Lost charges" value={money(selected.summary.unpaidReplacementCharges)} icon={Clock3} />
            </div>

            <SectionCard className="p-4">
              <h3 className="font-display text-sm font-semibold text-[var(--sl-text-header)]">Blocking details</h3>
              <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">{selected.reason}</p>
              {selected.loans.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {selected.loans.map(loan => (
                    <div
                      key={loan.transactionId}
                      className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-xs text-[var(--sl-text)] tabular-nums"
                    >
                      <strong className="text-[var(--sl-text-header)]">{loan.title}</strong> · due {date(loan.dueAt)} ·{' '}
                      {loan.overdueHours} overdue hours · {money(loan.currentFine)}
                    </div>
                  ))}
                </div>
              ) : null}
              {selected.fines?.length ? (
                <div className="mt-3 space-y-2">
                  {selected.fines.map(fine => (
                    <div
                      key={fine.fineId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-xs tabular-nums"
                    >
                      <div>
                        <strong className="text-[var(--sl-text-header)]">{fine.title}</strong>
                        <p className="mt-0.5 text-[var(--sl-text-secondary)]">
                          {fine.basis} · Applied {date(fine.appliedAt)}
                          {fine.notes ? ` · ${fine.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status="Unpaid" />
                        <strong className="text-[var(--sl-text-header)]">{money(fine.amount)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </SectionCard>

            {selected.lostBooks.length > 0 && isLibrarian ? (
              <SectionCard className="p-4">
                <h3 className="font-display text-sm font-semibold text-[var(--sl-text-header)]">Lost-book reports</h3>
                <div className="mt-3 space-y-3">
                  {selected.lostBooks.map(item => {
                    const resolution = lostResolution(item)
                    return (
                      <div
                        key={item.lostBookReportId}
                        className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <strong className="text-sm text-[var(--sl-text-header)]">{item.title}</strong>
                            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                              Reported {date(item.reportedAt)} · {item.status} · {resolution} · {item.paymentStatus}
                            </p>
                          </div>
                          <strong className="text-sm tabular-nums text-[var(--sl-text-header)]">
                            {item.status === 'Pending'
                              ? item.titlePrice
                                ? `Book price: ${money(item.titlePrice)}`
                                : item.quotedAmount
                                  ? `Quotation: ${money(item.quotedAmount)}`
                                  : 'Awaiting quotation'
                              : item.status === 'Rejected' || resolution === 'Waived'
                                ? 'No charge'
                                : resolution === 'Awaiting Quotation'
                                  ? 'Awaiting quotation'
                                  : money(item.replacementCharge)}
                          </strong>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.status === 'Pending' ? (
                            <>
                              <Button
                                size="sm"
                                disabled={busy || !item.chargeResolution}
                                onClick={() =>
                                  void decide(
                                    item.lostBookReportId,
                                    'Confirmed',
                                    item.quotedAmount,
                                    item.titlePrice ?? null,
                                  )
                                }
                              >
                                Confirm loss
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void decide(
                                    item.lostBookReportId,
                                    'Rejected',
                                    item.quotedAmount,
                                    item.titlePrice ?? null,
                                  )
                                }
                              >
                                Reject report
                              </Button>
                              {!item.quotationId ? (
                                isLibrarian ? (
                                  <a
                                    href="/librarian/catalog"
                                    className="self-center text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
                                  >
                                    Attach quotation in catalog
                                  </a>
                                ) : (
                                  <span className="self-center text-xs text-[var(--sl-text-secondary)]">
                                    Ask a Librarian to attach a quotation.
                                  </span>
                                )
                              ) : null}
                            </>
                          ) : null}

                          {item.status === 'Confirmed' &&
                          ['Quoted', 'Book Price'].includes(resolution) &&
                          item.paymentStatus === 'Unpaid' ? (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => void settle(item.lostBookReportId)}>
                                Record replacement payment
                              </Button>
                              {resolution === 'Book Price' ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => void resolve(item.lostBookReportId, 'Waive', null)}
                                >
                                  Waive charge
                                </Button>
                              ) : null}
                            </>
                          ) : null}

                          {item.status === 'Confirmed' && resolution === 'Awaiting Quotation' ? (
                            <>
                              {item.quotedAmount ? (
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => void resolve(item.lostBookReportId, 'Charge', item.quotedAmount)}
                                >
                                  Confirm quotation charge {money(item.quotedAmount)}
                                </Button>
                              ) : isLibrarian ? (
                                <a
                                  href="/librarian/catalog"
                                  className="self-center text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
                                >
                                  Record supplier quotation
                                </a>
                              ) : (
                                <span className="self-center text-xs text-[var(--sl-text-secondary)]">
                                  Ask a Librarian to record a supplier quotation.
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void resolve(item.lostBookReportId, 'Waive', null)}
                              >
                                Document non-monetary resolution
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard className="p-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-[var(--sl-text-header)]">Clearance exception</h3>
                <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                  Use this only when an authorized staff member approves clearing a blocked student.
                </p>
              </div>

              {selected.activeOverride ? (
                <div className="mt-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--sl-text-header)]">
                        Exception active: {selected.activeOverride.status}
                      </p>
                      <p className="mt-1 text-xs text-[var(--sl-text)]">{selected.activeOverride.reason}</p>
                      <p className="mt-1.5 text-xs text-[var(--sl-text-muted)]">
                        Approved by {selected.activeOverride.appliedBy} on {date(selected.activeOverride.appliedAt)}
                      </p>
                    </div>
                    {!revocationFormOpen ? (
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => setRevocationFormOpen(true)}>
                        Remove exception
                      </Button>
                    ) : null}
                  </div>
                  {revocationFormOpen ? (
                    <UnsavedGuard className="contents" cleanOnSubmit>
                      <form onSubmit={revoke} className="mt-3 space-y-3 border-t border-[var(--sl-border)] pt-3">
                        <label
                          htmlFor="revocation-reason"
                          className="block text-xs font-semibold text-[var(--sl-text-secondary)]"
                        >
                          Reason for removing the exception
                        </label>
                        <textarea
                          id="revocation-reason"
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Example: The approved exception is no longer needed."
                          className="sl-input h-20 py-2.5"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" disabled={busy}>
                            {busy ? 'Removing…' : 'Confirm removal'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => setRevocationFormOpen(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </UnsavedGuard>
                  ) : null}
                </div>
              ) : selected.computedStatus === 'Not Cleared' ? (
                <div className="mt-3">
                  <p className="text-xs text-[var(--sl-text-secondary)]">
                    This student has library obligations. An exception changes only the clearance status; books, lost-item charges, and fines remain recorded.
                  </p>
                  {!overrideFormOpen ? (
                    <Button className="mt-3" size="sm" onClick={() => setOverrideFormOpen(true)}>
                      Clear student as an exception
                    </Button>
                  ) : (
                    <UnsavedGuard className="contents" cleanOnSubmit>
                      <form
                        onSubmit={override}
                        className="mt-3 space-y-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4"
                      >
                        <label
                          htmlFor="override-reason"
                          className="block text-xs font-semibold text-[var(--sl-text-secondary)]"
                        >
                          Reason for exception
                        </label>
                        <textarea
                          id="override-reason"
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Example: Approved by the Head Librarian while payment is being verified."
                          className="sl-input h-20 py-2.5"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" size="sm" disabled={busy}>
                            {busy ? 'Saving…' : 'Confirm exception'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => setOverrideFormOpen(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </UnsavedGuard>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5 text-xs text-[var(--sl-text-secondary)]">
                  No exception is needed because the student is already cleared by the system.
                </div>
              )}

              {selected.overrideHistory.length ? (
                <div className="mt-3 border-t border-[var(--sl-border)] pt-3">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(value => !value)}
                    className="text-xs font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
                  >
                    {historyOpen ? 'Hide' : 'View'} exception history ({selected.overrideHistory.length})
                  </button>
                  {historyOpen ? (
                    <div className="mt-2.5 space-y-2">
                      {selected.overrideHistory.map(entry => (
                        <div
                          key={entry.overrideId}
                          className="rounded-[6px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-2.5 text-xs text-[var(--sl-text)]"
                        >
                          <strong>{entry.status}</strong> · {entry.reason}
                          <br />
                          <span className="text-[var(--sl-text-muted)]">
                            Applied by {entry.appliedBy} on {date(entry.appliedAt)}
                            {entry.revokedAt
                              ? ` · Removed by ${entry.revokedBy} on ${date(entry.revokedAt)}: ${entry.revocationReason}`
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          </div>
        </LumoDialog>
      ) : null}
    </>
  )
}
