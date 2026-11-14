import assert from 'node:assert/strict'
import test from 'node:test'
import { runMigrationInPglite } from '../../test-utils/pglite-migration.ts'

// Only the tables 032 alters or references; the real schema comes from earlier migrations.
const stubs = `
  CREATE TABLE accounts (account_id bigint PRIMARY KEY);
  CREATE TABLE library_login_sessions (session_id uuid PRIMARY KEY);
  CREATE TABLE login_otp_challenges (challenge_id bigint PRIMARY KEY);
`

test('032 blocks anon and authenticated from login_device_switches; service_role and the owner still read it', async (t) => {
  const db = await runMigrationInPglite('032_login_devices.sql', stubs)
  t.after(() => db.close())

  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(db.queryAs(role, 'SELECT * FROM login_device_switches'), /permission denied/, role)
  }
  for (const role of ['service_role', 'library_owner']) {
    const result = await db.queryAs(role, 'SELECT count(*)::int AS n FROM login_device_switches')
    assert.equal(result.rows[0].n, 0, role)
  }
})

test('032 row-level security hides rows even if a grant comes back', async (t) => {
  const db = await runMigrationInPglite('032_login_devices.sql', stubs)
  t.after(() => db.close())

  const rls = await db.queryAs('library_owner',
    "SELECT relrowsecurity FROM pg_class WHERE relname = 'login_device_switches' AND relnamespace = 'public'::regnamespace")
  assert.equal(rls.rows[0].relrowsecurity, true)

  const sessionId = '00000000-0000-0000-0000-000000000001'
  for (const sql of [
    'INSERT INTO accounts VALUES (1)',
    `INSERT INTO library_login_sessions VALUES ('${sessionId}')`,
    `INSERT INTO login_device_switches VALUES ('hash', 1, 1, '${sessionId}', false, now())`,
    'GRANT SELECT ON login_device_switches TO anon',
  ]) await db.queryAs('library_owner', sql)
  const owner = await db.queryAs('library_owner', 'SELECT count(*)::int AS n FROM login_device_switches')
  assert.equal(owner.rows[0].n, 1)
  const anon = await db.queryAs('anon', 'SELECT count(*)::int AS n FROM login_device_switches')
  assert.equal(anon.rows[0].n, 0)
})
