import assert from 'node:assert/strict'
import test from 'node:test'
import { runMigrationInPglite } from '../../test-utils/pglite-migration.ts'

// Only the tables 032 alters or references; the real schema comes from earlier migrations.
const stubs = `
  CREATE TABLE accounts (account_id bigint PRIMARY KEY);
  CREATE TABLE library_login_sessions (session_id uuid PRIMARY KEY);
  CREATE TABLE login_otp_challenges (challenge_id bigint PRIMARY KEY);
`

test('032 blocks anon and authenticated from login_device_switches but the owner can read it', async (t) => {
  const db = await runMigrationInPglite('032_login_devices.sql', stubs)
  t.after(() => db.close())

  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(db.queryAs(role, 'SELECT * FROM login_device_switches'), /permission denied/, role)
  }
  const owner = await db.queryAs('library_owner', 'SELECT count(*)::int AS n FROM login_device_switches')
  assert.equal(owner.rows[0].n, 0)
})

test('032 turns on row-level security for login_device_switches', async (t) => {
  const db = await runMigrationInPglite('032_login_devices.sql', stubs)
  t.after(() => db.close())

  const result = await db.queryAs('library_owner', "SELECT relrowsecurity FROM pg_class WHERE relname = 'login_device_switches'")
  assert.equal(result.rows[0].relrowsecurity, true)
})
