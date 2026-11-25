import { useEffect, useState } from 'react'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { getCurrentIdentity } from '../auth/auth-storage'
import { formatManilaTime12 } from './LibrarySchedulePage'
import { notificationApi } from './notification-api'
import type { LibrarySchedule } from './types'

const PATRON_ROLES = new Set(['Student', 'Faculty'])

export type LibraryOpenStatus = {
  closed: boolean
  reason: string
  loaded: boolean
}

function manilaParts(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 3_600_000)
  const date = shifted.toISOString().slice(0, 10)
  const time = shifted.toISOString().slice(11, 16)
  const jsDay = shifted.getUTCDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay
  return { date, time, dayOfWeek }
}

/** Evaluates whether the library is closed at `now` in Asia/Manila time. */
export function computeLibraryClosedNow(
  schedule: Pick<LibrarySchedule, 'weekly' | 'upcomingClosures'> | null | undefined,
  now = new Date(),
): { closed: boolean; reason: string } {
  if (!schedule || !Array.isArray(schedule.weekly)) return { closed: false, reason: '' }
  const { date, time, dayOfWeek } = manilaParts(now)
  const upcomingClosures = Array.isArray(schedule.upcomingClosures) ? schedule.upcomingClosures : []
  const closure = upcomingClosures.find(item => item.date === date)
  if (closure) {
    if (closure.startsAt && closure.endsAt) {
      if (time >= closure.startsAt && time < closure.endsAt) {
        return {
          closed: true,
          reason: `${closure.reason} (${formatManilaTime12(closure.startsAt)} – ${formatManilaTime12(closure.endsAt)} Manila time)`,
        }
      }
    } else {
      return {
        closed: true,
        reason: `${closure.reason} (Closed all day)`,
      }
    }
  }

  const todayRule = schedule.weekly.find(day => day.dayOfWeek === dayOfWeek)
  if (!todayRule || !todayRule.isOpen || !todayRule.opensAt || !todayRule.closesAt) {
    return { closed: true, reason: 'Scheduled weekly closed day' }
  }
  if (time < todayRule.opensAt || time >= todayRule.closesAt) {
    return {
      closed: true,
      reason: `Outside library operating hours (${formatManilaTime12(todayRule.opensAt)} – ${formatManilaTime12(todayRule.closesAt)} Manila time)`,
    }
  }
  return { closed: false, reason: '' }
}

/**
 * Reports whether the library is currently closed for Student/Faculty accounts.
 * Staff/Librarian/Admin accounts are never placed in view-only mode.
 */
export function useLibraryOpenStatus(): LibraryOpenStatus {
  const role = getCurrentIdentity()?.role ?? ''
  const isPatron = PATRON_ROLES.has(role)
  const query = useLiveQuery(
    'library-schedule',
    signal => (isPatron ? notificationApi.librarySchedule(signal) : Promise.resolve(null)),
    { enabled: isPatron },
  )
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isPatron) return
    const timer = window.setInterval(() => setTick(value => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [isPatron])

  if (!isPatron) return { closed: false, reason: '', loaded: true }
  if (!query.data) return { closed: false, reason: '', loaded: false }
  void tick
  const status = computeLibraryClosedNow(query.data, new Date())
  return { ...status, loaded: true }
}
