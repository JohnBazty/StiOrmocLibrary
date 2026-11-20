import { ArrowLeftRight, BookMarked, CalendarClock, CircleDollarSign, Clock, QrCode, Settings, ShieldCheck, Users, type LucideIcon } from 'lucide-react'

export type ShortcutRole = 'admin' | 'librarian' | 'staff'
export type CoreShortcut = { title: string; subtitle: string; icon: LucideIcon; path: string; badge: string }

/**
 * Right-sidebar core shortcuts per workspace. Library setup and fines exist only in the
 * Librarian workspace, so Admin and Staff never get links their role cannot open.
 */
export function coreShortcutsFor(role: ShortcutRole, counts: { auditLogs: number; queued: number }): CoreShortcut[] {
  if (role === 'admin') {
    return [
      { title: 'Attendance monitoring', subtitle: 'Live occupancy & gate logs', icon: QrCode, path: '/admin/attendance', badge: 'Core' },
      { title: 'User accounts', subtitle: 'Students, faculty & staff', icon: Users, path: '/admin/users', badge: 'Core' },
      { title: 'System audit logs', subtitle: 'All library transactions', icon: ShieldCheck, path: '/admin/audit-logs', badge: String(counts.auditLogs || '') },
    ]
  }
  const prefix = role === 'staff' ? '/staff' : '/librarian'
  const desk: CoreShortcut[] = [
    { title: 'Attendance monitoring', subtitle: 'QR entry gate & live headcount', icon: QrCode, path: `${prefix}/attendance`, badge: 'Core' },
    { title: 'Borrow & return counter', subtitle: 'Check out, return & renew books', icon: ArrowLeftRight, path: `${prefix}/circulation`, badge: 'Desk' },
    { title: 'Book queue & pickups', subtitle: 'Reservations & scheduled pickups', icon: BookMarked, path: `${prefix}/reservations`, badge: counts.queued > 0 ? String(counts.queued) : '' },
  ]
  if (role === 'staff') return desk
  return [
    ...desk,
    { title: 'Library setup', subtitle: 'Hours, rules & maintenance', icon: Settings, path: '/librarian/maintenance', badge: '' },
    { title: 'Issue fines', subtitle: 'Record a violation or fine', icon: CircleDollarSign, path: '/librarian/fines?tab=violations&record=1', badge: '' },
    { title: 'Reservation maintenance', subtitle: 'Waitlist, expiry & renewals', icon: CalendarClock, path: '/librarian/maintenance?tab=reservations', badge: '' },
    { title: 'Pickup window', subtitle: 'Days a ready book is held', icon: Clock, path: '/librarian/maintenance?tab=reservations#pickup-window', badge: '' },
  ]
}
