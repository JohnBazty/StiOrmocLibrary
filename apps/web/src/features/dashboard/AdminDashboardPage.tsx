import { UrgentCases } from '../fines/UrgentCases'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button, NoticeBanner, PageHeader } from '../../components/ui'
import { dashboardApi } from './dashboard-api'
import { deskDashboardApi, type DeskTaskFilters } from './desk-dashboard-api'
import { useDashboardResource } from './useDashboardResource'
import { DashboardActionCards } from './DashboardActionCards'
import { DashboardTaskTable } from './DashboardTaskTable'
import { CollectionSnapshot } from './CollectionSnapshot'
import { DashboardAnalytics } from './DashboardAnalytics'
import { RefundRequestsNotice } from '../payments/RefundRequestsNotice'

const initial: DeskTaskFilters = { tab: 'overdue', department: '', program: '', level: '', q: '', page: 1 }

export function AdminDashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [days, setDays] = useState(30)
  const [filters, setFilters] = useState(initial)
  const [reminderRequest, setReminderRequest] = useState(0)
  const [reminderBusy, setReminderBusy] = useState(false)

  const loader = useCallback((signal: AbortSignal) => deskDashboardApi.overview(days, signal), [days])
  const overview = useDashboardResource(loader, refreshKey)
  const analyticsLoader = useCallback(() => dashboardApi.admin(), [])
  const analytics = useDashboardResource(analyticsLoader, refreshKey)
  const changed = useCallback(() => setRefreshKey(value => value + 1), [])

  function select(tab: DeskTaskFilters['tab']) {
    setFilters(current => ({ ...current, tab, page: 1 }))
    document.getElementById('desk-task-list')?.scrollIntoView({ block: 'start' })
  }

  return (
    <>
      <PageHeader
        eyebrow="Library overview"
        title="Admin dashboard"
        description="Track today’s overdue returns, pending book requests, and collection activity in Philippine time."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={overview.loading || analytics.loading} onClick={changed}>
              <RefreshCw size={15} aria-hidden="true" />
              {overview.loading || analytics.loading ? 'Refreshing…' : 'Refresh dashboard'}
            </Button>
            <Link
              to="/librarian/circulation"
              className="inline-flex min-h-[38px] items-center rounded-[6px] bg-[#0b5ea2] px-3.5 text-sm font-semibold text-white shadow-[var(--sl-shadow-xs)] hover:bg-[#094e87]"
            >
              Open full counter
            </Link>
          </div>
        }
      />

      <DashboardActionCards
        reminderBusy={reminderBusy}
        data={overview.data}
        onSelect={select}
        onRemind={() => {
          setReminderRequest(value => value + 1)
          document.getElementById('desk-task-list')?.scrollIntoView({ block: 'start' })
        }}
      />
      <RefundRequestsNotice />
      <DashboardTaskTable
        filters={filters}
        setFilters={setFilters}
        overview={overview.data}
        refreshKey={refreshKey}
        onChanged={changed}
        reminderRequest={reminderRequest}
        onReminderBusy={setReminderBusy}
      />
      <UrgentCases />

      <section aria-labelledby="dashboard-analytics-heading" className="mb-6">
        <div className="mb-3">
          <h2 id="dashboard-analytics-heading" className="font-display text-lg font-semibold text-[var(--sl-text-header)]">
            Library analytics
          </h2>
        </div>
        {analytics.error ? (
          <NoticeBanner
            tone="error"
            action={
              <button type="button" onClick={changed} className="min-h-8 text-xs font-semibold underline">
                Retry analytics
              </button>
            }
          >
            {analytics.error} {analytics.data ? 'Showing last confirmed analytics.' : ''}
          </NoticeBanner>
        ) : null}
        {analytics.data ? (
          <DashboardAnalytics data={analytics.data} />
        ) : !analytics.error ? (
          <div role="status" aria-label="Loading analytics" className="grid gap-3 md:grid-cols-2">
            {[1, 2].map(item => (
              <div key={item} aria-hidden="true" className="h-40 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]" />
            ))}
            <span className="sr-only">Loading analytics…</span>
          </div>
        ) : null}
        {overview.error ? (
          <NoticeBanner
            tone="error"
            className="mt-4"
            action={
              <button type="button" onClick={changed} className="min-h-8 text-xs font-semibold underline">
                Retry totals
              </button>
            }
          >
            {overview.error} {overview.data ? 'Showing last confirmed totals.' : ''}
          </NoticeBanner>
        ) : null}
        <div className="mt-4">
          <CollectionSnapshot data={overview.data} loading={overview.loading} days={days} onDays={setDays} />
        </div>
      </section>

      <p className="mt-4 text-right text-xs text-[var(--sl-text-muted)]">
        {analytics.data
          ? `Last confirmed ${new Date(analytics.data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`
          : 'Waiting for analytics'}{' '}
        · {overview.loading || analytics.loading ? 'Updating…' : 'Refreshes every 30 seconds while visible'}
      </p>
    </>
  )
}
