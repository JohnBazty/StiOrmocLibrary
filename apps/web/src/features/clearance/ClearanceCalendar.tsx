import { CalendarDays } from 'lucide-react'
import { StatusBadge } from '../../components/ui'
import type { ClearanceSchedule } from './types'

const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

export function ClearanceCalendar({ schedule }: { schedule: ClearanceSchedule | null | undefined }) {
  if (schedule === undefined) return <p role="status" className="mt-4 rounded-xl border p-4 text-sm">Clearance schedule is not available yet.</p>
  if (schedule === null) return <p className="mt-4 rounded-xl border p-4 text-sm">Your current library requirements are listed below.</p>
  const windows = schedule.windows ?? []
  return <section aria-label="Your clearance schedule" className="mt-4 rounded-2xl border p-4 sm:p-5">
    <div className="flex items-center gap-2"><CalendarDays size={18} /><h2 className="font-bold">Your clearance schedule</h2></div>
    <p className="mt-1 text-sm opacity-70">{schedule.group ?? 'All groups'} · Philippine time (Asia/Manila)</p>
    {windows.length ? <ul className="mt-3 divide-y">{windows.map(window => {
      const status = Date.now() < Date.parse(window.startsAt) ? 'Upcoming' : Date.now() >= Date.parse(window.endsAt) ? 'Closed' : 'Open'
      return <li key={window.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="text-sm tabular-nums"><p><strong>Opens:</strong> {date(window.startsAt)}</p><p className="mt-1"><strong>Closes:</strong> {date(window.endsAt)}</p></div><StatusBadge status={status} /></li>
    })}</ul> : <p className="mt-3 text-sm">{schedule.deadlineAt ? `Clearance deadline: ${date(schedule.deadlineAt)} (Philippine time)` : 'No clearance schedule has been set for your group.'}</p>}
  </section>
}
