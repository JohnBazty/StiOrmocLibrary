import { useEffect, useState } from 'react'
import { Button, EmptyState, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { borrowingScheduleApi, pickupDateLabel, type ScheduleQueue, type ScheduleQueueFilters } from './borrowing-schedule-api'

const initial: ScheduleQueueFilters = { user: '', role: '', dateFrom: '', dateTo: '' }
const when = (date: string) =>
  new Date(date).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

export function AdminScheduledBorrowing({ refreshKey }: { refreshKey: number }) {
  const [filters, setFilters] = useState(initial)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ScheduleQueue>({ available: true, items: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const invalidDateRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
  const hasFilters = Boolean(filters.user || filters.role || filters.dateFrom || filters.dateTo)

  useEffect(() => {
    if (invalidDateRange) return
    const controller = new AbortController()
    let running = false
    async function load() {
      if (running) return
      running = true
      setLoading(true)
      try {
        const result = await borrowingScheduleApi.queue(filters, page, controller.signal)
        if (!controller.signal.aborted) {
          setData(result)
          setError('')
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Scheduled pickups could not be loaded.')
      } finally {
        running = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    const first = setTimeout(() => void load(), 180)
    const timer = setInterval(() => void load(), 30000)
    return () => {
      controller.abort()
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [filters, page, refreshKey, invalidDateRange])

  function filter(value: Partial<ScheduleQueueFilters>) {
    setFilters(previous => ({ ...previous, ...value }))
    setPage(1)
  }

  return (
    <section aria-label="Scheduled pickups">
      <p className="mb-4 text-sm text-[var(--sl-text-secondary)]">
        Future pickup requests do not hold copies yet. Preparation starts one open library day before pickup, then prepared requests move into Book requests.
      </p>

      <SectionCard className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
            Borrower or book
            <input
              aria-label="Find scheduled borrower or book"
              placeholder="Borrower, school ID or book title"
              className="sl-input"
              value={filters.user}
              onChange={e => filter({ user: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
            Borrower role
            <select
              aria-label="Scheduled borrower role"
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
            Pickup from
            <input
              aria-label="Pickup from"
              className="sl-input"
              type="date"
              value={filters.dateFrom}
              onChange={e => filter({ dateFrom: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
            Pickup through
            <input
              aria-label="Pickup through"
              className="sl-input"
              type="date"
              value={filters.dateTo}
              onChange={e => filter({ dateTo: e.target.value })}
            />
          </label>
        </div>
      </SectionCard>

      {invalidDateRange ? (
        <NoticeBanner tone="warning">Pickup from date must be on or before the Pickup through date.</NoticeBanner>
      ) : null}
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {loading ? (
        <p role="status" className="mb-3 text-xs font-medium text-[var(--sl-text-secondary)]">
          {data.items.length ? 'Refreshing scheduled pickups…' : 'Loading scheduled pickups…'}
        </p>
      ) : null}

      {data.items.length ? (
        <SectionCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sl-border)] px-5 py-3">
            <h2 className="font-display text-sm font-semibold text-[var(--sl-text-header)]">
              Pending scheduled pickups
            </h2>
            <span className="text-xs font-medium text-[var(--sl-text-muted)] tabular-nums">
              {data.pagination.total} pending {data.pagination.total === 1 ? 'schedule' : 'schedules'}
            </span>
          </div>
          <ResponsiveTable label="Scheduled pickup requests">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Book</th>
                  <th scope="col" className="px-4 py-2.5">Borrower</th>
                  <th scope="col" className="px-4 py-2.5">Preferred pickup</th>
                  <th scope="col" className="px-4 py-2.5">Preparation starts</th>
                  <th scope="col" className="px-5 py-2.5">Status &amp; notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {data.items.map(item => (
                  <tr key={item.scheduleId} className="align-top">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[var(--sl-text-header)]">{item.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">Requested {when(item.requestedAt)}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-[var(--sl-text)]">{item.userName}</p>
                      <p className="mt-0.5 break-all text-xs text-[var(--sl-text-muted)]">
                        {item.schoolId} · {item.userRole}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-[var(--sl-text-header)] tabular-nums">
                      {pickupDateLabel(item.pickupDate)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">
                      {item.preparationStartsAt ? (
                        when(item.preparationStartsAt)
                      ) : (
                        <div className="space-y-1">
                          <p className="font-semibold text-[#92400e] dark:text-[#fcd34d]">Pickup calendar needs review</p>
                          <a
                            href="/librarian/library-schedule"
                            className="inline-block font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
                          >
                            Review library schedule
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status="Scheduled" />
                      <p className="mt-1.5 text-xs text-[var(--sl-text-secondary)]">
                        {item.reason ?? 'No copy held. Waiting for the preparation window.'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </SectionCard>
      ) : !loading ? (
        <SectionCard>
          <EmptyState
            title={data.available ? 'No pending schedules match these filters.' : 'Scheduled borrowing is not available yet.'}
            description={
              hasFilters
                ? 'Clear your search or date filters to view upcoming scheduled pickups.'
                : 'When students or faculty schedule a future pickup date, it will appear here.'
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
      ) : null}

      {data.items.length > 0 || page > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="text-xs font-medium text-[var(--sl-text-secondary)] tabular-nums">
            Page {page} of {Math.max(1, data.pagination.pages)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= data.pagination.pages || loading}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  )
}
