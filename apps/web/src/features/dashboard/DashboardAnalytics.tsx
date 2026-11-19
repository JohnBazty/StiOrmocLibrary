import { Link } from 'react-router-dom'
import { SectionCard } from '../../components/ui'
import type { AdminDashboardData } from './types'

type AnalyticsData = Pick<AdminDashboardData, 'weeklyAttendance' | 'popularCategories'>

export function DashboardAnalytics({ data }: { data: AnalyticsData }) {
  const attendanceMax = Math.max(1, ...data.weeklyAttendance.map(item => item.value))
  const categoryMax = Math.max(1, ...data.popularCategories.map(item => item.value))
  const hasVisits = data.weeklyAttendance.some(item => item.value > 0)
  const visits = data.weeklyAttendance.reduce((total, item) => total + item.value, 0)

  return (
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
      <SectionCard className="min-w-0 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Weekly attendance</h3>
            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">This week · Philippine time</p>
          </div>
          <span className="shrink-0 rounded-[6px] bg-[var(--sl-info-soft)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#0b5ea2] dark:text-[#93c5fd]">
            {visits} <span className="font-normal">{visits === 1 ? 'visit' : 'visits'}</span>
          </span>
        </div>

        {hasVisits ? (
          <div className="relative mt-6">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex h-28 flex-col justify-between">
              <div className="border-t border-dashed border-[var(--sl-border)]" />
              <div className="border-t border-dashed border-[var(--sl-border)]" />
              <div className="border-t border-[var(--sl-border)]" />
            </div>
            <ul aria-label="Daily attendance counts" className="relative flex h-36 items-end gap-3 pt-6 sm:gap-5">
              {data.weeklyAttendance.map(item => {
                const pct = (item.value / attendanceMax) * 100
                return (
                  <li key={item.label} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                    <div className="relative flex flex-1 items-end">
                      <div
                        aria-hidden="true"
                        title={`${item.label}: ${item.value} ${item.value === 1 ? 'visit' : 'visits'}`}
                        className="w-full rounded-t-[4px] bg-[var(--sl-chart-0)] transition-opacity group-hover:opacity-85"
                        style={{ height: `${Math.max(item.value > 0 ? 6 : 0, pct)}%` }}
                      />
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-[var(--sl-text-header)]"
                        style={{ bottom: `calc(${Math.max(item.value > 0 ? 6 : 0, pct)}% + 4px)` }}
                      >
                        {item.value}
                      </span>
                    </div>
                    <span className="text-center text-xs font-medium text-[var(--sl-text-secondary)]">{item.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-3.5 py-2.5">
            <p className="text-sm text-[var(--sl-text-secondary)]">No visits recorded this week.</p>
            <Link to="/librarian/attendance" className="inline-flex min-h-9 items-center text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]">
              Open attendance records
            </Link>
          </div>
        )}
      </SectionCard>

      <SectionCard className="min-w-0 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Popular categories</h3>
          <span className="text-xs text-[var(--sl-text-muted)]">Last 30 days</span>
        </div>
        {data.popularCategories.length ? (
          <ul aria-label="Borrowing counts by category" className="mt-4 space-y-3.5">
            {data.popularCategories.map(item => (
              <li key={item.label}>
                <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words font-medium text-[var(--sl-text)]">{item.label}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--sl-text-secondary)]">
                    {item.value} {item.value === 1 ? 'borrow' : 'borrows'}
                  </span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--sl-bg-subtle)]">
                  <div
                    className="h-full rounded-full bg-[var(--sl-chart-0)] transition-all"
                    style={{ width: `${(item.value / categoryMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-3.5 py-2.5">
            <p className="text-sm text-[var(--sl-text-secondary)]">No borrowing activity in the last 30 days.</p>
            <Link to="/librarian/reports" className="inline-flex min-h-9 items-center text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]">
              Open collection reports
            </Link>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
