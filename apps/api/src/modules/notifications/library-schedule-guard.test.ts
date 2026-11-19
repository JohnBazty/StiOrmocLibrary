import assert from 'node:assert/strict'
import test from 'node:test'
import { requireLibraryOpenForUserTransactions } from './library-schedule-guard.ts'
import {
  decodeClosureReason,
  encodeClosureReason,
  isLibraryClosedNow,
  validateLibrarySchedule,
} from './library-schedule.validation.ts'

const openSchedule = {
  timezone: 'Asia/Manila',
  revision: 'a'.repeat(64),
  weekly: Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    isOpen: i < 6,
    opensAt: i < 6 ? '08:00' : null,
    closesAt: i < 6 ? '17:00' : null,
  })),
  upcomingClosures: [
    { date: '2026-11-20', reason: 'Faculty meeting', startsAt: '13:00', endsAt: '15:00' },
  ],
}

test('encodes, decodes, and validates closure time windows', () => {
  const validated = validateLibrarySchedule(openSchedule, '2026-11-20')
  assert.deepEqual(validated.upcomingClosures, [
    { date: '2026-11-20', reason: 'Faculty meeting', startsAt: '13:00', endsAt: '15:00' },
  ])
  const encoded = encodeClosureReason('Faculty meeting', '13:00', '15:00')
  assert.equal(encoded, '[13:00-15:00] Faculty meeting')
  assert.deepEqual(decodeClosureReason(encoded), {
    reason: 'Faculty meeting',
    startsAt: '13:00',
    endsAt: '15:00',
  })
  assert.throws(() =>
    validateLibrarySchedule(
      { ...openSchedule, upcomingClosures: [{ date: '2026-11-20', reason: 'Bad window', startsAt: '15:00', endsAt: '13:00' }] },
      '2026-11-20',
    ),
  )
})

test('evaluates Manila operating hours and timed closures accurately', () => {
  // 2026-11-20 10:00 Manila (02:00 UTC) -> Open (before 13:00-15:00 closure)
  assert.equal(isLibraryClosedNow(openSchedule, new Date('2026-11-20T02:00:00Z')).closed, false)
  // 2026-11-20 14:00 Manila (06:00 UTC) -> Closed (inside 13:00-15:00 closure)
  const duringClosure = isLibraryClosedNow(openSchedule, new Date('2026-11-20T06:00:00Z'))
  assert.equal(duringClosure.closed, true)
  assert.match(duringClosure.reason, /1:00 PM – 3:00 PM/)
  // 2026-11-20 18:00 Manila (10:00 UTC) -> Closed (after 5:00 PM closing)
  assert.equal(isLibraryClosedNow(openSchedule, new Date('2026-11-20T10:00:00Z')).closed, true)
})

test('blocks Student and Faculty write transactions when closed while keeping GET view-only and Staff allowed', async () => {
  const closedClock = () => new Date('2026-11-20T06:00:00Z') // 2:00 PM Manila during closure
  const guard = requireLibraryOpenForUserTransactions(async () => openSchedule, closedClock)

  const runGuard = (method: string, role: string) =>
    new Promise<unknown>((resolve) => {
      void guard({ method, auth: { role } } as never, {} as never, (err?: unknown) => resolve(err ?? null))
    })

  // Student POST blocked -> 403 LIBRARY_CLOSED_VIEW_ONLY
  const studentPost = (await runGuard('POST', 'Student')) as { status?: number; code?: string }
  assert.equal(studentPost?.status, 403)
  assert.equal(studentPost?.code, 'LIBRARY_CLOSED_VIEW_ONLY')

  // Faculty POST blocked -> 403 LIBRARY_CLOSED_VIEW_ONLY
  const facultyPost = (await runGuard('POST', 'Faculty')) as { status?: number; code?: string }
  assert.equal(facultyPost?.status, 403)
  assert.equal(facultyPost?.code, 'LIBRARY_CLOSED_VIEW_ONLY')

  // Student GET allowed (view-only)
  assert.equal(await runGuard('GET', 'Student'), null)

  // Librarian POST allowed
  assert.equal(await runGuard('POST', 'Librarian'), null)
})
