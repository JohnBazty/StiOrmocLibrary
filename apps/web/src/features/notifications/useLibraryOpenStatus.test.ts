import { expect, it } from 'vitest'
import { computeLibraryClosedNow } from './useLibraryOpenStatus'
import type { LibrarySchedule } from './types'

const baseSchedule: LibrarySchedule = {
  timezone: 'Asia/Manila',
  weekly: [
    { dayOfWeek: 1, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
    { dayOfWeek: 2, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
    { dayOfWeek: 3, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
    { dayOfWeek: 4, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
    { dayOfWeek: 5, isOpen: true, opensAt: '08:00', closesAt: '17:00' },
    { dayOfWeek: 6, isOpen: false, opensAt: null, closesAt: null },
    { dayOfWeek: 7, isOpen: false, opensAt: null, closesAt: null },
  ],
  upcomingClosures: [
    { date: '2026-11-23', reason: 'Campus holiday' },
    { date: '2026-11-24', reason: 'Staff meeting', startsAt: '13:00', endsAt: '15:00' },
  ],
}

it('reports open during operating hours and closed outside them in Manila time', () => {
  // Wednesday 2026-11-25 10:00 Manila (02:00 UTC)
  expect(computeLibraryClosedNow(baseSchedule, new Date('2026-11-25T02:00:00Z')).closed).toBe(false)
  // Wednesday 2026-11-25 18:00 Manila (10:00 UTC)
  const afterHours = computeLibraryClosedNow(baseSchedule, new Date('2026-11-25T10:00:00Z'))
  expect(afterHours.closed).toBe(true)
  expect(afterHours.reason).toMatch(/Outside library operating hours/)
})

it('reports closed on weekly closed days and all-day or timed scheduled closures', () => {
  // Sunday 2026-11-22 10:00 Manila
  expect(computeLibraryClosedNow(baseSchedule, new Date('2026-11-22T02:00:00Z')).closed).toBe(true)
  // Monday 2026-11-23 all-day holiday
  const holiday = computeLibraryClosedNow(baseSchedule, new Date('2026-11-23T02:00:00Z'))
  expect(holiday.closed).toBe(true)
  expect(holiday.reason).toContain('Campus holiday')
  // Tuesday 2026-11-24 during 13:00-15:00 meeting
  const meeting = computeLibraryClosedNow(baseSchedule, new Date('2026-11-24T05:30:00Z'))
  expect(meeting.closed).toBe(true)
  expect(meeting.reason).toContain('Staff meeting')
  // Tuesday 2026-11-24 after 15:00 meeting (15:30 Manila)
  expect(computeLibraryClosedNow(baseSchedule, new Date('2026-11-24T07:30:00Z')).closed).toBe(false)
})
