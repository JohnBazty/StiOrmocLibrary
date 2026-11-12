import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = (name: string) => readFileSync(new URL(`../../../../../database/supabase/${name}`, import.meta.url), 'utf8')

test('034 locks the job tables to the server and indexes the open-loan cursor, and can run twice', async () => {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE borrow_transactions (transaction_id BIGSERIAL PRIMARY KEY, due_at TIMESTAMP, transaction_status TEXT, lost_confirmed_at TIMESTAMP)`)
  await pg.exec(migration('019_durable_job_runner.sql'))
  await pg.exec('GRANT SELECT ON scheduled_job_state, scheduled_job_runs TO anon, authenticated')
  await pg.exec(migration('034_job_runner_hardening.sql'))
  await pg.exec(migration('034_job_runner_hardening.sql'))

  const rls = await pg.query<{ relname: string; relrowsecurity: boolean }>(
    "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('scheduled_job_state', 'scheduled_job_runs') ORDER BY relname")
  assert.deepEqual(rls.rows, [{ relname: 'scheduled_job_runs', relrowsecurity: true }, { relname: 'scheduled_job_state', relrowsecurity: true }])
  const grants = await pg.query<{ readable: boolean }>(
    "SELECT bool_or(has_table_privilege(r, t, 'SELECT')) AS readable FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['scheduled_job_state', 'scheduled_job_runs']) t")
  assert.equal(grants.rows[0].readable, false)
  const index = await pg.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_borrow_open_due_cursor'")
  assert.match(index.rows[0].indexdef, /\(due_at, transaction_id\) WHERE/)
  await pg.close()
})
