import assert from 'node:assert/strict'
import test from 'node:test'
import { exactLoanDeadline } from './exact-loan-deadline.ts'

const weekdays = new Set([1, 2, 3, 4, 5, 6])
test('24-hour deadline retains Manila clock time, seconds and milliseconds', () => {
  assert.equal(exactLoanDeadline(new Date('2026-10-15T15:17:23.456+08:00'), 1, weekdays, new Set()).toISOString(), '2026-10-16T07:17:23.456Z')
})
test('Sunday and holiday advance to the next open date at the original time', () => {
  assert.equal(exactLoanDeadline(new Date('2026-10-17T15:17:00+08:00'), 1, weekdays, new Set(['2026-10-19'])).toISOString(), '2026-10-20T07:17:00.000Z')
})
test('configured days are calendar days and cross leap day correctly', () => {
  assert.equal(exactLoanDeadline(new Date('2028-02-28T00:05:00+08:00'), 2, weekdays, new Set()).toISOString(), '2028-02-29T16:05:00.000Z')
})
test('missing opening days and invalid borrowing periods fail instead of inventing a deadline', () => {
  assert.throws(() => exactLoanDeadline(new Date(), 1, new Set(), new Set()), /No open due date/)
  for (const value of [0, -1, 366, 1.5, NaN]) assert.throws(() => exactLoanDeadline(new Date(), value, weekdays, new Set()), /approved borrowing period/)
})

const at8 = (borrowed: string, closed: string[] = []) => exactLoanDeadline(new Date(borrowed), 1, weekdays, new Set(closed), '08:00:00').toISOString()
test('a due time sets the clock: Monday 14:30 is due Tuesday 08:00', () => {
  assert.equal(at8('2026-11-23T14:30:45.678+08:00'), '2026-11-24T00:00:00.000Z')
})
test('a due time skips Sunday: Saturday 15:00 is due Monday 08:00', () => {
  assert.equal(at8('2026-11-21T15:00:00+08:00'), '2026-11-23T00:00:00.000Z')
})
test('a due time skips a closed day: Monday borrow with Tuesday closed is due Wednesday 08:00', () => {
  assert.equal(at8('2026-11-23T15:00:00+08:00', ['2026-11-24']), '2026-11-25T00:00:00.000Z')
})
test('a malformed due time fails instead of inventing a deadline', () => {
  assert.throws(() => exactLoanDeadline(new Date('2026-11-23T15:00:00+08:00'), 1, weekdays, new Set(), '8am'), /due time/)
})

test('preview due date equals the stored checkout due date at 08:00 (R2)', async () => {
  process.env.TZ = 'Asia/Manila' // the API forces this at startup; the preview uses local time
  const { calculateOperatingDueDate } = await import('./due-date.ts')
  for (const [borrowed, closed] of [['2026-11-23T14:30:00+08:00', []], ['2026-11-21T15:00:00+08:00', []], ['2026-11-23T15:00:00+08:00', ['2026-11-24']]] as const) {
    const closures = new Set<string>(closed)
    assert.equal(calculateOperatingDueDate(new Date(borrowed), 1, '08:00:00', closures).toISOString(), at8(borrowed, [...closed]))
  }
})
