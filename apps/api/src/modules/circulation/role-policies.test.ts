import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { roleMaxRenewals, roleRenewalExtensionDays, type BorrowingPolicyVersion } from './borrowing-policy.types.ts'
import { roleWaitingExpiryDays } from '../reservations/reservation-settings.service.ts'

const policy = { maxRenewals: 1, renewalExtensionDays: 3, facultyMaxRenewals: null, facultyRenewalExtensionDays: null } as unknown as BorrowingPolicyVersion

test('students and faculty each have their own renewal rules; faculty default to no renewal limit', () => {
  assert.equal(roleMaxRenewals(policy, 'Student'), 1)
  assert.equal(roleMaxRenewals(policy, 'Faculty'), null)
  assert.equal(roleRenewalExtensionDays(policy, 'Faculty'), 3)
  const set = { ...policy, facultyMaxRenewals: 4, facultyRenewalExtensionDays: 7 } as BorrowingPolicyVersion
  assert.equal(roleMaxRenewals(set, 'Faculty'), 4)
  assert.equal(roleRenewalExtensionDays(set, 'Faculty'), 7)
  assert.equal(roleRenewalExtensionDays(set, 'Student'), 3)
})

test('waiting-list expiry is set per role; an empty faculty limit means faculty requests do not expire', () => {
  const settings = { pickupWindowDays: 1, waitingExpiryDays: 14, waitingExpirySavedAt: null, facultyWaitingExpiryDays: null }
  assert.equal(roleWaitingExpiryDays(settings, 'Student'), 14)
  assert.equal(roleWaitingExpiryDays(settings, 'Faculty'), null)
  assert.equal(roleWaitingExpiryDays({ ...settings, facultyWaitingExpiryDays: 30 }, 'Faculty'), 30)
})

test('084 adds faculty renewal and waiting-list settings with sensible ranges', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE accounts(account_id BIGINT PRIMARY KEY); CREATE TABLE borrowing_policy_versions(borrowing_policy_version_id BIGINT PRIMARY KEY); INSERT INTO borrowing_policy_versions VALUES(1);
      CREATE TABLE reservation_settings(settings_id INT PRIMARY KEY); INSERT INTO reservation_settings VALUES(1);`)
    await pg.exec(await readFile(new URL('../../../../../database/supabase/084_faculty_policies.sql', import.meta.url), 'utf8'))
    await pg.query('UPDATE borrowing_policy_versions SET faculty_max_renewals=5,faculty_renewal_extension_days=14')
    await pg.query('UPDATE reservation_settings SET faculty_waiting_expiry_days=30')
    await assert.rejects(pg.query('UPDATE borrowing_policy_versions SET faculty_max_renewals=-1'))
    await assert.rejects(pg.query('UPDATE borrowing_policy_versions SET faculty_renewal_extension_days=0'))
    await assert.rejects(pg.query('UPDATE reservation_settings SET faculty_waiting_expiry_days=3'))
  } finally { await pg.close() }
})
