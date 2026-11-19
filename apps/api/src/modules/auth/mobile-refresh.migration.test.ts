import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createAuthTestDatabase } from './auth-pglite.test.helper.ts'

const migration = readFileSync(new URL('../../../../../database/supabase/039_mobile_refresh_tokens.sql', import.meta.url), 'utf8')

test('039 locks mobile_refresh_tokens to the server after a rerun and constrains library_login_sessions.client', async () => {
  const { pg } = await createAuthTestDatabase() // applies 039 once
  await pg.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_refresh_tokens TO anon, authenticated')
  await pg.exec(migration)

  const rls = await pg.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'mobile_refresh_tokens'")
  assert.equal(rls.rows[0].relrowsecurity, true)
  const grants = await pg.query<{ privileged: boolean }>(
    `SELECT bool_or(has_table_privilege(r, 'mobile_refresh_tokens', p)) AS privileged
       FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p`)
  assert.equal(grants.rows[0].privileged, false)

  const { rows: [account] } = await pg.query<{ account_id: number }>("INSERT INTO accounts(school_id,role) VALUES ('TEST0002','Student') RETURNING account_id")
  const insert = (sessionId: string, client?: string) => pg.query(
    client ? 'INSERT INTO library_login_sessions(session_id,account_id,auth_version,client) VALUES ($1,$2,1,$3)' : 'INSERT INTO library_login_sessions(session_id,account_id,auth_version) VALUES ($1,$2,1)',
    client ? [sessionId, account.account_id, client] : [sessionId, account.account_id])
  await insert('00000000-0000-4000-8000-000000000001')
  const stored = await pg.query<{ client: string }>("SELECT client FROM library_login_sessions WHERE session_id = '00000000-0000-4000-8000-000000000001'")
  assert.equal(stored.rows[0].client, 'web')
  await assert.rejects(insert('00000000-0000-4000-8000-000000000002', 'tablet'))
  await pg.close()
})
