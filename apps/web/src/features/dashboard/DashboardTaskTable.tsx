import { formatLoanDate, loanOverdueLabel } from '../circulation/loan-time'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button, EmptyState, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { RowActions } from '../../components/RowActions'
import { CirculationReturnDialog } from '../circulation/CirculationReturnDialog'
import { circulationApi } from '../circulation/circulation-api'
import { reservationApi } from '../reservations/reservation-api'
import { deskDashboardApi, type DeskOverview, type DeskTask, type DeskTaskFilters } from './desk-dashboard-api'
import { useDashboardResource } from './useDashboardResource'
import { DeskDialog } from './DeskDialog'

export const deskField = 'sl-input'
export const deskDate = (value: string) => formatLoanDate(value)
export function academicLabel(row: DeskTask) {
  if (row.role !== 'Student') return row.role
  const grade =
    row.department === 'SHS' && row.level
      ? `Grade ${row.level}`
      : row.department === 'College' && row.level
        ? `${row.level}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<string, string>)[row.level] ?? 'th'} Year`
        : ''
  return [grade, row.program].filter(Boolean).join(' — ') || 'Not recorded'
}

export function DashboardTaskTable({
  filters,
  setFilters,
  overview,
  refreshKey,
  onChanged,
  reminderRequest,
  onReminderBusy,
}: {
  filters: DeskTaskFilters
  setFilters: (value: DeskTaskFilters) => void
  overview: DeskOverview | null
  refreshKey: number
  onChanged: () => void
  reminderRequest: number
  onReminderBusy?: (busy: boolean) => void
}) {
  const loader = useCallback((signal: AbortSignal) => deskDashboardApi.tasks(filters, signal), [filters])
  const { data, error, loading } = useDashboardResource(loader, refreshKey)
  const [action, setAction] = useState<{ type: 'lost' | 'ready'; row: DeskTask } | null>(null)
  const [returnRow, setReturnRow] = useState<DeskTask | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const running = useRef(false)
  const update = (change: Partial<DeskTaskFilters>) => setFilters({ ...filters, ...change, page: change.page ?? 1 })

  const sendReminders = useCallback(
    async (id?: number) => {
      if (running.current) return
      running.current = true
      setBusy(true)
      onReminderBusy?.(true)
      setActionError('')
      setNotice('')
      try {
        const eligible = await deskDashboardApi.reminders(filters, id)
        if (!eligible.items.length) {
          setNotice(
            'No new email reminders are needed. These loans already have an email request, are no longer overdue, or need a school email.',
          )
          return
        }
        const result = await deskDashboardApi.queue(eligible.items.map(row => row.id))
        setNotice(
          `${result.queued} email reminders queued. They will be sent automatically to registered school email addresses. ${result.skipped} were already queued or are no longer eligible.`,
        )
      } catch (cause) {
        setActionError(cause instanceof Error ? cause.message : 'Email reminders could not be queued. Please try again.')
      } finally {
        running.current = false
        setBusy(false)
        onReminderBusy?.(false)
        onChanged()
      }
    },
    [filters, onChanged, onReminderBusy],
  )

  const seenRequest = useRef(0)
  useEffect(() => {
    if (reminderRequest !== seenRequest.current) {
      seenRequest.current = reminderRequest
      void sendReminders()
    }
  }, [reminderRequest, sendReminders])

  async function perform() {
    if (running.current) return
    running.current = true
    setBusy(true)
    setActionError('')
    try {
      if (action) {
        if (action.type === 'lost') {
          await circulationApi.reportLost(action.row.id)
          setNotice('Lost report recorded. Replacement charges remain subject to the existing review.')
        } else {
          await reservationApi.adjustStatus(action.row.id, 'ready_for_pickup')
          setNotice('Copy marked ready. The pickup deadline and notification have been updated.')
        }
        setAction(null)
      }
      onChanged()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'This action could not be completed.')
      onChanged()
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  async function exportList() {
    if (exporting) return
    setExporting(true)
    setActionError('')
    try {
      await deskDashboardApi.export(filters)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const programs = overview?.programs.filter(item => !filters.department || item.department === filters.department).map(item => item.program) ?? []
  const hasFilters = Boolean(filters.department || filters.program || filters.level || filters.q)

  return (
    <section aria-labelledby="desk-tasks-heading" className="mb-6 scroll-mt-24" id="desk-task-list">
      <SectionCard className="overflow-hidden">
        <header className="space-y-4 border-b border-[var(--sl-border)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="desk-tasks-heading" className="font-display text-lg font-semibold text-[var(--sl-text-header)]">
                Overdue &amp; reservation tasks
              </h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                Oldest due first. Reservations keep their queue order.
              </p>
            </div>
            <Button variant="secondary" size="sm" disabled={exporting} onClick={() => void exportList()}>
              <Download size={15} aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export filtered list'}
            </Button>
          </div>

          <div role="group" aria-label="Dashboard task list" className="flex flex-wrap gap-1.5">
            {(
              [
                ['overdue', 'Overdue books'],
                ['holds', 'Pending reservations'],
                ['due', 'Due today'],
              ] as const
            ).map(([tab, label]) => (
              <button
                type="button"
                key={tab}
                aria-pressed={filters.tab === tab}
                onClick={() => update({ tab })}
                className={`min-h-9 rounded-[6px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filters.tab === tab
                    ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white'
                    : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-header)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
              Department
              <select
                aria-label="Department"
                value={filters.department}
                onChange={event => update({ department: event.target.value, program: '', level: '' })}
                className={deskField}
              >
                <option value="">All departments</option>
                <option value="SHS">Senior High School</option>
                <option>College</option>
                <option value="Other">Faculty / Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
              Strand / program
              <select
                aria-label="Strand or program"
                className={deskField}
                value={filters.program}
                onChange={event => update({ program: event.target.value })}
              >
                <option value="">All strands / programs</option>
                {Array.from(
                  new Set([
                    ...programs,
                    ...(filters.department === 'SHS'
                      ? ['STEM', 'ABM', 'HUMSS', 'TVL']
                      : filters.department === 'College'
                        ? ['BSIT', 'BSHM', 'BSTM']
                        : ['STEM', 'ABM', 'HUMSS', 'TVL', 'BSIT', 'BSHM', 'BSTM']),
                  ]),
                )
                  .sort()
                  .map(program => (
                    <option key={program}>{program}</option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
              Grade / year
              <select
                aria-label="Grade or year"
                className={deskField}
                value={filters.level}
                onChange={event => update({ level: event.target.value })}
              >
                <option value="">All levels</option>
                {(filters.department === 'SHS' ? ['11', '12'] : filters.department === 'College' ? ['1', '2', '3', '4'] : ['11', '12', '1', '2', '3', '4']).map(
                  level => (
                    <option key={level} value={level}>
                      {['11', '12'].includes(level) ? 'Grade ' + level : 'Year ' + level}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
              Find in this list
              <input
                aria-label="Search dashboard tasks"
                placeholder="Name, ID, title or barcode"
                maxLength={80}
                className={deskField}
                value={filters.q}
                onChange={event => update({ q: event.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-[var(--sl-text-muted)]">
            Academic groups use current profile details. Faculty and missing details remain visible under All departments.
          </p>
        </header>

        <div className="px-4 pt-3 sm:px-5">
          {loading ? (
            <p role="status" className="mb-3 text-xs font-medium text-[var(--sl-text-secondary)]">
              Updating task list…
            </p>
          ) : null}
          {error ? (
            <NoticeBanner
              tone="error"
              action={
                <button type="button" onClick={onChanged} className="min-h-8 text-xs font-semibold underline">
                  Retry list
                </button>
              }
            >
              {error} {data ? 'Showing the last confirmed list.' : ''}
            </NoticeBanner>
          ) : null}
          {actionError && !action ? <NoticeBanner tone="error">{actionError}</NoticeBanner> : null}
          {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
          {busy ? (
            <p role="status" className="mb-3 text-xs font-medium text-[var(--sl-text-secondary)]">
              Processing your request…
            </p>
          ) : null}
        </div>

        <ResponsiveTable label="Dashboard circulation tasks">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                {['Borrower', 'Department & level/program', 'Book', 'Due / request date', 'Quick actions'].map(label => (
                  <th key={label} scope="col" className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {data?.items.map(row => (
                <tr key={row.kind + row.id} className="align-top">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-[var(--sl-text-header)]">{row.borrower}</p>
                    <p className="mt-0.5 font-mono text-xs text-[var(--sl-text-muted)]">{row.schoolId}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-[var(--sl-text)]">{academicLabel(row)}</p>
                    <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{row.department === 'Other' ? row.role : row.department}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-[var(--sl-text-header)]">{row.title}</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-[var(--sl-text-muted)]">
                      {row.barcode || 'Copy not assigned'}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs text-[var(--sl-text-secondary)] tabular-nums">{deskDate(row.date)}</p>
                    <div className="mt-1.5">
                      <StatusBadge status={row.status} />
                    </div>
                    {row.status === 'Overdue' ? (
                      <p className="mt-1 text-xs font-medium text-[#991b1b] dark:text-[#fca5a5]">
                        {loanOverdueLabel(row.date, data?.generatedAt) ?? 'Overdue'}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col items-start gap-1.5">
                      {row.kind === 'Loan' ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={Boolean(error) || busy || loading || !row.barcode}
                            title={!row.barcode ? 'No physical barcode assigned to this loan' : undefined}
                            onClick={() => setReturnRow(row)}
                          >
                            Return book
                          </Button>
                          {row.status === 'Overdue' ? (
                            row.reminderStatus ? (
                              <span className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                                Email: {row.reminderStatus}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={Boolean(error) || busy || loading}
                                onClick={() => void sendReminders(row.id)}
                              >
                                Send email reminder
                              </Button>
                            )
                          ) : null}
                          {row.lostReported ? (
                            <span className="text-xs font-semibold text-[var(--sl-text-secondary)]">Lost report recorded</span>
                          ) : (
                            <RowActions label={'More actions for ' + row.title}>
                              <button
                                disabled={Boolean(error) || busy || loading}
                                onClick={() => {
                                  setActionError('')
                                  setAction({ type: 'lost', row })
                                }}
                              >
                                Report lost
                              </button>
                            </RowActions>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            disabled={Boolean(error) || busy || loading}
                            onClick={() => {
                              setActionError('')
                              setAction({ type: 'ready', row })
                            }}
                          >
                            Mark ready
                          </Button>
                          <Link
                            className="inline-flex min-h-8 items-center text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
                            to="/librarian/reservations"
                          >
                            Open book queue
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data && !data.items.length ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      title="No tasks match these filters."
                      description={
                        hasFilters
                          ? 'Clear your department, program, or search filters to view all active tasks.'
                          : 'Everything in this queue is clear right now.'
                      }
                      action={
                        hasFilters ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => update({ department: '', program: '', level: '', q: '', page: 1 })}
                          >
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-4 py-3">
          <span className="text-xs font-medium text-[var(--sl-text-secondary)] tabular-nums">
            {data ? `${data.total} matching tasks · Page ${filters.page} of ${Math.max(1, Math.ceil(data.total / 25))}` : 'Task totals unavailable'}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={loading || filters.page === 1} onClick={() => update({ page: filters.page - 1 })}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading || !data || filters.page * 25 >= data.total}
              onClick={() => update({ page: filters.page + 1 })}
            >
              Next
            </Button>
          </div>
        </footer>
      </SectionCard>

      {returnRow ? (
        <CirculationReturnDialog
          barcode={returnRow.barcode}
          onClose={() => setReturnRow(null)}
          onReturned={message => {
            setReturnRow(null)
            setNotice(message)
            onChanged()
          }}
        />
      ) : null}
      {action ? (
        <DeskDialog
          title={action.type === 'lost' ? 'Report lost book' : 'Mark copy ready'}
          busy={busy}
          onClose={() => {
            setAction(null)
            setActionError('')
          }}
        >
          <p className="font-semibold text-[var(--sl-text-header)]">{action.row.title}</p>
          <p className="text-sm text-[var(--sl-text-secondary)]">
            {action.row.borrower} · {action.row.schoolId}
          </p>
          <p className="text-sm leading-relaxed text-[var(--sl-text)]">
            {action.type === 'lost'
              ? 'This records a lost-book report for staff review. It does not automatically confirm a replacement charge.'
              : 'Confirm that this exact copy has been pulled from the shelf and is ready for collection. This starts the existing pickup deadline and sends the normal pickup notice.'}
          </p>
          {actionError ? <NoticeBanner tone="error" className="mb-0">{actionError}</NoticeBanner> : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void perform()}>
              {busy ? 'Saving…' : action.type === 'lost' ? 'Submit lost report' : 'Confirm ready'}
            </Button>
          </div>
        </DeskDialog>
      ) : null}
    </section>
  )
}
