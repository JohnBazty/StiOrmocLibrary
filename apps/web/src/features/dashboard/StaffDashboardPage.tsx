import { Link } from 'react-router-dom'
import { PageHeader, SectionCard } from '../../components/ui'

const links = [
  ['/staff/circulation', 'Borrow & return'],
  ['/staff/reservations', 'Reservations'],
  ['/staff/printing', 'Printing queue'],
  ['/staff/attendance', 'Attendance'],
  ['/staff/announcements', 'Announcements'],
] as const

export function StaffDashboardPage() {
  return <>
    <PageHeader eyebrow="Library operations" title="Staff dashboard" />
    <p className="mb-5 text-sm text-[#003399]/70">Open a task from your assigned workspace.</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{links.map(([path, label]) =>
      <Link key={path} to={path}><SectionCard className="p-6 transition hover:border-[#003399]"><h2 className="font-display text-lg font-bold text-[#003399]">{label}</h2><p className="mt-2 text-sm text-[#003399]/60">Open {label.toLowerCase()}</p></SectionCard></Link>
    )}</div>
  </>
}
