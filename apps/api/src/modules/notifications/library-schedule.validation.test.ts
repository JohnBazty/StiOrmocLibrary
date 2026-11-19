import assert from 'node:assert/strict'
import test from 'node:test'
import { validateLibrarySchedule } from './library-schedule.validation.ts'
const input = () => ({ revision: 'a'.repeat(64), weekly: Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1, isOpen: index < 6, opensAt: '07:00', closesAt: '17:00' })), upcomingClosures: [{ date: '2026-12-25', reason: ' Holiday ' }] })
test('normalizes closed days and reasons without changing Manila dates', () => {
  const result = validateLibrarySchedule(input(), '2026-11-18')
  assert.equal(result.weekly[6].opensAt, null)
  assert.deepEqual(result.upcomingClosures, [{ date: '2026-12-25', reason: 'Holiday' }])
})
test('rejects duplicate weekdays, invalid hours, overnight hours and a permanently closed week', () => {
  for (const mutate of [
    (value: ReturnType<typeof input>) => { value.weekly[6].dayOfWeek = 1 },
    (value: ReturnType<typeof input>) => { value.weekly[0].opensAt = '25:00' },
    (value: ReturnType<typeof input>) => { value.weekly[0].closesAt = '06:00' },
    (value: ReturnType<typeof input>) => { value.weekly.forEach(day => { day.isOpen = false }) },
  ]) { const value = input(); mutate(value); assert.throws(() => validateLibrarySchedule(value, '2026-11-18')) }
})
test('rejects duplicate, impossible and past closure dates and empty reasons', () => {
  for (const upcomingClosures of [
    [{ date: '2026-12-25', reason: 'Holiday' }, { date: '2026-12-25', reason: 'Duplicate' }],
    [{ date: '2026-02-30', reason: 'Impossible' }], [{ date: '2026-11-17', reason: 'Past' }],
    [{ date: '2026-12-25', reason: ' ' }],
  ]) assert.throws(() => validateLibrarySchedule({ ...input(), upcomingClosures }, '2026-11-18'))
})
