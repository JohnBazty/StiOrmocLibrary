import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { calculateOperatingFine } from './fine-calculator.ts'
import { validateFinePolicy } from './fine-policy.validation.ts'

const calendar = { openDays: new Set([1, 2, 3, 4, 5, 6]), closedDates: new Set<string>() }
const at = (time: string) => new Date(`2026-11-18T${time}:00+08:00`)
const base = { hourlyRate: 2, dailyRate: 10, maximumPenalty: 500 }

test('hourly fines count only inside the fine hours the librarian set', () => {
  const policy = { ...base, hourlyStartsAt: '08:00', hourlyEndsAt: '12:00' }
  assert.equal(calculateOperatingFine(at('10:00'), at('15:00'), policy, calendar).units, 2)
  // Due before the fine hours begin: counting starts at 08:00.
  assert.equal(calculateOperatingFine(at('07:00'), at('09:30'), policy, calendar).units, 2)
  // Due after the fine hours end: no hourly fine that day.
  assert.equal(calculateOperatingFine(at('13:00'), at('16:00'), policy, calendar).amount, 0)
  // Without fine hours the count runs to the closing time (5:00 PM by default), as before.
  assert.equal(calculateOperatingFine(at('16:00'), at('19:00'), base, calendar).units, 1)
  assert.equal(calculateOperatingFine(at('10:00'), at('13:00'), base, calendar).units, 3)
})

test('fine hours are optional, but both times are needed and must be in order', () => {
  const ok = { hourlyRate: '2', dailyRate: '10', maximumPenalty: '500', effectiveOn: '2026-12-01', changeReason: 'Library hours changed this term.' }
  assert.equal(validateFinePolicy(ok).hourlyStartsAt, null)
  // People enter 12-hour times (8:00 AM); the stored value is a plain time.
  const timed = validateFinePolicy({ ...ok, hourlyStartsAt: '8:00 AM', hourlyEndsAt: '5:30 PM' })
  assert.deepEqual([timed.hourlyStartsAt, timed.hourlyEndsAt], ['08:00', '17:30'])
  assert.deepEqual([validateFinePolicy({ ...ok, hourlyStartsAt: '12:00 AM', hourlyEndsAt: '12:00 PM' }).hourlyStartsAt], ['00:00'])
  assert.throws(() => validateFinePolicy({ ...ok, hourlyStartsAt: '8:00 AM' }), /both/)
  assert.throws(() => validateFinePolicy({ ...ok, hourlyStartsAt: '5:00 PM', hourlyEndsAt: '8:00 AM' }), (error: Error) => /before/.test(error.message) && !/17:00/.test(error.message))
  assert.throws(() => validateFinePolicy({ ...ok, hourlyStartsAt: '13:00 PM', hourlyEndsAt: '5:00 PM' }), /AM or PM/)
})

test('083 adds optional fine hours and borrowing/returning windows, both ends or neither', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE fine_policy_versions(fine_policy_id BIGINT PRIMARY KEY);
      CREATE TABLE borrowing_policy_versions(borrowing_policy_version_id BIGINT PRIMARY KEY);
      INSERT INTO fine_policy_versions VALUES(1); INSERT INTO borrowing_policy_versions VALUES(1);`)
    await pg.exec(await readFile(new URL('../../../../../database/supabase/083_policy_time_windows.sql', import.meta.url), 'utf8'))
    await pg.query("UPDATE fine_policy_versions SET hourly_starts_at='08:00',hourly_ends_at='17:00'")
    await pg.query("UPDATE borrowing_policy_versions SET borrow_opens_at='08:00',borrow_closes_at='16:30',return_opens_at='07:30',return_closes_at='17:00'")
    await assert.rejects(pg.query("UPDATE fine_policy_versions SET hourly_starts_at='17:00',hourly_ends_at='08:00'"))
    await assert.rejects(pg.query("UPDATE borrowing_policy_versions SET borrow_opens_at='09:00',borrow_closes_at=NULL"))
    await assert.rejects(pg.query("UPDATE borrowing_policy_versions SET return_opens_at='18:00',return_closes_at='17:00'"))
  } finally { await pg.close() }
})
