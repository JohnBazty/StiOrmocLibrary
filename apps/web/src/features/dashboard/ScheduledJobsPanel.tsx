import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SectionCard } from '../../components/ui'
import { dashboardApi } from './dashboard-api'
import type { ScheduledJobHealth, ScheduledJobsData } from './types'

const JOB_LABELS: Record<string, string> = {
  'enrollment-close': 'Enrollment closing',
  'attendance-auto-checkout': 'Attendance auto check-out',
  'in-library-unreturned': 'In-library books not returned',
  'reservation-expiration': 'Reservation expiry',
  'book-request-advance': 'Book request queue',
  'circulation-overdue': 'Overdue loans and fines',
  notifications: 'Notifications',
  'book-request-emails': 'Book request emails',
  'collection-review-refresh': 'Collection review',
}

// Status is always written out; the icon and the yellow highlight only repeat it.
const HEALTH = {
  healthy: { label: 'Healthy', Icon: CheckCircle2, className: 'bg-[#0b5ea2]/5 text-[#0b5ea2] dark:bg-white/10 dark:text-white' },
  stale: { label: 'Stale', Icon: Clock, className: 'bg-[#FFF200] text-[#0b5ea2]' },
  failed: { label: 'Failed', Icon: AlertTriangle, className: 'bg-[#0b5ea2] text-white dark:bg-white dark:text-[#0b5ea2]' },
} satisfies Record<ScheduledJobHealth, { label: string; Icon: typeof Clock; className: string }>

const manila = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

/** D4: read-only job status. It loads on its own, so a failure here never hides the rest of the dashboard. */
export function ScheduledJobsPanel() {
  const [data, setData] = useState<ScheduledJobsData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    dashboardApi.jobs()
      .then((value) => { if (active) setData(value) })
      .catch(() => { if (active) setError('Scheduled job status could not be loaded.') })
    return () => { active = false }
  }, [])

  const attention = data?.jobs.filter((job) => job.health !== 'healthy').length ?? 0
  return <SectionCard className="mt-5 p-5">
    <p className="text-xs font-bold uppercase tracking-wider text-[#0b5ea2]/75">System health</p>
    <h2 className="mt-1 font-display text-lg font-bold text-[#0b5ea2]">Scheduled jobs</h2>
    {error ? <p role="alert" className="mt-3 text-sm font-semibold text-[#0b5ea2]">{error}</p> : null}
    {!data && !error ? <p role="status" className="mt-3 text-sm text-[#0b5ea2]/75">Loading job status…</p> : null}
    {data ? <>
      <p className="mt-1 text-xs text-[#0b5ea2]/75">{attention ? `${attention} of ${data.jobs.length} jobs need attention.` : 'All jobs are running.'}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.jobs.map((job) => {
          const name = JOB_LABELS[job.jobName] ?? job.jobName
          const { label, Icon, className } = HEALTH[job.health]
          return <li key={job.jobName} className="rounded-xl border border-[#0b5ea2]/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[#0b5ea2]">{name}</p>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${className}`}><Icon size={12} aria-hidden="true" />{label}</span>
            </div>
            <p className="mt-2 text-xs text-[#0b5ea2]/75">{job.lastSuccessAt ? `Last success ${manila(job.lastSuccessAt)}` : 'Never succeeded'}</p>
            {job.health === 'failed' && job.lastErrorMessage ? <p className="mt-1 line-clamp-2 text-xs text-[#0b5ea2]">{job.lastErrorMessage}</p> : null}
          </li>
        })}
      </ul>
    </> : null}
  </SectionCard>
}
