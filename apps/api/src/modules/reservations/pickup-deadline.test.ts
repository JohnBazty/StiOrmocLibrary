import assert from 'node:assert/strict'
import test from 'node:test'
import { isOpenAt, nextClose, nextCloseAfter, pickupDeadline, type OpeningSchedule } from './pickup-deadline.ts'
import { loadOpeningHours } from './pickup-deadline.ts'

// 2026-11-16 is a Monday. Manila is UTC+8.
const at = (iso: string) => new Date(`${iso}+08:00`)
const hrs = { opensAt: '08:00:00', closesAt: '17:00:00' }
const week = (over: Record<number, { opensAt: string; closesAt: string } | null> = {}): OpeningSchedule => {
  const s: OpeningSchedule = new Map()
  for (let d = 1; d <= 6; d++) s.set(d, hrs)
  for (const [d, v] of Object.entries(over)) v ? s.set(Number(d), v) : s.delete(Number(d))
  return s
}
const none = new Set<string>()

test('ready Mon 10:00 gives Tue 10:00', () => {
  assert.equal(pickupDeadline(at('2026-11-16T10:00'), week(), none).getTime(), at('2026-11-17T10:00').getTime())
})
test('ready Mon 07:30 gives Tue closing', () => {
  assert.equal(pickupDeadline(at('2026-11-16T07:30'), week(), none).getTime(), at('2026-11-17T17:00').getTime())
})
test('Fri 16:00 with Saturday open until 17:00 keeps Sat 16:00', () => {
  assert.equal(pickupDeadline(at('2026-11-20T16:00'), week(), none).getTime(), at('2026-11-21T16:00').getTime())
})
test('Fri 16:00 with Saturday closing 12:00 goes to the next open day closing', () => {
  const s = week({ 6: { opensAt: '08:00:00', closesAt: '12:00:00' } })
  assert.equal(pickupDeadline(at('2026-11-20T16:00'), s, none).getTime(), at('2026-11-23T17:00').getTime())
})
test('Sat 15:00 with Sunday closed gives Monday closing', () => {
  assert.equal(pickupDeadline(at('2026-11-21T15:00'), week(), none).getTime(), at('2026-11-23T17:00').getTime())
})
test('a closed date skips to the next open day closing', () => {
  assert.equal(pickupDeadline(at('2026-11-16T10:00'), week(), new Set(['2026-11-17'])).getTime(), at('2026-11-18T17:00').getTime())
})
test('exactly at closing is kept', () => {
  assert.equal(pickupDeadline(at('2026-11-16T17:00'), week(), none).getTime(), at('2026-11-17T17:00').getTime())
  assert.ok(isOpenAt(at('2026-11-17T17:00'), week(), none))
})
test('a week with every day closed throws instead of looping', () => {
  assert.throws(() => pickupDeadline(at('2026-11-16T10:00'), new Map(), none), (e: any) => e.code === 'LIBRARY_CLOSED_NO_SCHEDULE')
})
test('nextCloseAfter is strict, nextClose is not', () => {
  const t = at('2026-11-16T17:00')
  assert.equal(nextClose(t, week(), none).getTime(), t.getTime())
  assert.equal(nextCloseAfter(t, week(), none).getTime(), at('2026-11-17T17:00').getTime())
  assert.equal(nextCloseAfter(at('2026-11-16T10:00'), week(), none).getTime(), t.getTime())
  assert.equal(nextCloseAfter(at('2026-11-21T17:00'), week(), none).getTime(), at('2026-11-23T17:00').getTime())
})
test('deadline is never earlier than ready plus 24 hours', () => {
  const s = week({ 6: { opensAt: '08:00:00', closesAt: '12:00:00' } })
  for (let i = 0; i < 500; i++) {
    const ready = new Date(at('2026-11-16T00:00').getTime() + Math.floor(Math.random() * 14 * 86_400_000))
    assert.ok(pickupDeadline(ready, s, new Set(['2026-11-25'])).getTime() >= ready.getTime() + 86_400_000)
  }
})

// ---- Pickup window in days (SPEC R1)
test('window 3: ready Mon 10:00 gives Thu 10:00 (AC 1)', () => {
  assert.equal(pickupDeadline(at('2026-11-16T10:00'), week(), none, 3).getTime(), at('2026-11-19T10:00').getTime())
})
test('window 2: an end after closing on a day before a closed date moves to the next closing (AC 3)', () => {
  assert.equal(pickupDeadline(at('2026-11-16T18:00'), week(), new Set(['2026-11-19']), 2).getTime(), at('2026-11-20T17:00').getTime())
})
test('window 3: an end exactly at closing is kept', () => {
  assert.equal(pickupDeadline(at('2026-11-16T17:00'), week(), none, 3).getTime(), at('2026-11-19T17:00').getTime())
})
test('deadline is never earlier than ready plus N days', () => {
  const s = week({ 6: { opensAt: '08:00:00', closesAt: '12:00:00' } })
  for (let n = 1; n <= 7; n++) for (let i = 0; i < 200; i++) {
    const ready = new Date(at('2026-11-16T00:00').getTime() + Math.floor(Math.random() * 14 * 86_400_000))
    assert.ok(pickupDeadline(ready, s, new Set(['2026-11-25']), n).getTime() >= ready.getTime() + n * 86_400_000)
  }
})
test('loadOpeningHours loads closed days far enough for the window', async () => {
  const ends: unknown[] = []
  const q = { async execute(sql: string, params: unknown[] = []) { if (sql.includes('library_closed_days')) ends.push(params[1]); return [[]] } } as never
  await loadOpeningHours(q, at('2026-11-16T10:00'))
  await loadOpeningHours(q, at('2026-11-16T10:00'), 7)
  assert.deepEqual(ends, ['2026-12-19', '2026-12-25'])
})
