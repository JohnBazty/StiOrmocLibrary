import { Bell, BookMarked, CalendarClock, Megaphone, Printer } from 'lucide-react'
import { getCurrentIdentity } from '../auth/auth-storage'

export const notificationsUpdated = 'smartlib:notifications-updated'

export function formatNotificationDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function notificationIcon(type: string) {
  if (type === 'Due Date' || type === 'Overdue Penalty') return CalendarClock
  if (type === 'Reservation Arrival') return BookMarked
  if (type === 'Printing Update') return Printer
  if (type === 'Announcement') return Megaphone
  return Bell
}

export function notificationRoute(path: string | null) {
  if (!path) return null
  const role = getCurrentIdentity()?.role
  if (role === 'Faculty') return path.replace('/student/', '/faculty/')
  if (role === 'Librarian' || role === 'Staff') {
    const prefix = role === 'Librarian' ? '/librarian' : '/staff'
    if (path === '/student/notifications') return `${prefix}/notifications`
    return path.replace('/admin/', `${prefix}/`)
  }
  return path
}
