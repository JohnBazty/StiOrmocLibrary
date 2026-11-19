import { Link } from 'react-router-dom'
import { SectionCard } from '../../components/ui'
import type { DeskOverview } from './desk-dashboard-api'
import { deskField } from './DashboardTaskTable'

export function CollectionSnapshot({
  data,
  loading = false,
  days,
  onDays,
}: {
  data: DeskOverview | null
  loading?: boolean
  days: number
  onDays: (days: number) => void
}) {
  const max = Math.max(1, ...(data?.groups.map(group => group.count) ?? [0]))
  return (
    <section aria-labelledby="collection-snapshot-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="collection-snapshot-heading" className="font-display text-base font-semibold text-[var(--sl-text-header)]">
            Collection snapshot
          </h2>
          <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
            {data
              ? `${data.days} days ending ${new Date(data.generatedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`
              : 'Completed checkout events'}
          </p>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--sl-text-secondary)]">
          Reporting period
          <select
            aria-label="Reporting period"
            value={days}
            onChange={event => onDays(Number(event.target.value))}
            className={`${deskField} w-auto`}
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </label>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <SectionCard className="min-w-0 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Top 5 most borrowed resources</h3>
            <span className="text-xs text-[var(--sl-text-muted)]">Checkouts</span>
          </div>
          {!data ? (
            <p className="mt-3 text-sm text-[var(--sl-text-muted)]">
              {loading ? 'Loading reporting data…' : 'Reporting data unavailable.'}
            </p>
          ) : data.topBooks.length ? (
            <ol className="mt-3 divide-y divide-[var(--sl-border)]">
              {data.topBooks.map((book, index) => (
                <li key={book.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-[var(--sl-info-soft)] text-xs font-bold tabular-nums text-[#0b5ea2] dark:text-[#93c5fd]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--sl-text-header)]" title={book.title}>
                      {book.title}
                    </p>
                    <p className="text-xs text-[var(--sl-text-muted)]">{book.kind}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--sl-text-header)]" aria-label={`${book.count} checkouts`}>
                    {book.count}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-sm text-[var(--sl-text-secondary)]">
              No completed checkouts in this period.
            </p>
          )}
          <Link className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]" to="/librarian/reports">
            Open detailed reports
          </Link>
        </SectionCard>

        <SectionCard className="min-w-0 p-5">
          <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Books borrowed by group</h3>
          {data ? (
            <ul aria-label="Checkout counts by academic group" className="mt-4 space-y-2.5">
              {data.groups.map(group => (
                <li key={group.label} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 break-words text-[var(--sl-text)] sm:w-32">{group.label}</span>
                  <div aria-hidden="true" className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--sl-bg-subtle)]">
                    <div className="h-full rounded-full bg-[var(--sl-chart-1)]" style={{ width: `${(group.count / max) * 100}%` }} />
                  </div>
                  <strong className="min-w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--sl-text-header)]">
                    {group.count}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--sl-text-muted)]">
              {loading ? 'Loading group breakdown…' : 'Reporting data unavailable.'}
            </p>
          )}
        </SectionCard>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-[var(--sl-text-muted)]">
        Completed take-home checkouts only; library-only thesis use is separate. Groups use current profiles, with faculty and unclassified records included.
      </p>
    </section>
  )
}
