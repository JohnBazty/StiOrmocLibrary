import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import request from 'supertest'
import type { Pool } from '../config/db.js'
import { toPgPlaceholders } from '../config/sql.js'
import { PgRateLimitStore } from './pg-rate-limit-store.ts'

const migration = readFileSync(new URL('../../../../database/supabase/037_shared_rate_limits.sql', import.meta.url), 'utf8')

async function createDatabase() {
  const pg = new PGlite()
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  await pg.exec(migration)
  const execute = async (sql: string, values: unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), values)
    const write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
    return write ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }, result] : [result.rows, result]
  }
  return { pg, pool: { execute, query: execute } as unknown as Pool }
}

function limitedApp(pool: Pool, limit: number) {
  const app = express()
  app.post('/login', rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, store: new PgRateLimitStore('login', pool) }), (_req, res) => { res.json({ ok: true }) })
  return app
}

test('two API instances share one hit budget per client', async () => {
  const { pg, pool } = await createDatabase()
  const first = limitedApp(pool, 2)
  const second = limitedApp(pool, 2)

  assert.equal((await request(first).post('/login')).status, 200)
  assert.equal((await request(second).post('/login')).status, 200)
  assert.equal((await request(first).post('/login')).status, 429)
  assert.equal((await request(second).post('/login')).status, 429)
  await pg.close()
})

test('a finished window starts a new count, and prefixes keep limiters apart', async () => {
  const { pg, pool } = await createDatabase()
  const login = new PgRateLimitStore('login', pool)
  const otp = new PgRateLimitStore('otp', pool)
  login.init({ windowMs: 60_000 } as never)
  otp.init({ windowMs: 60_000 } as never)

  assert.equal((await login.increment('1.2.3.4')).totalHits, 1)
  assert.equal((await login.increment('1.2.3.4')).totalHits, 2)
  assert.equal((await otp.increment('1.2.3.4')).totalHits, 1)

  await pg.exec("UPDATE rate_limit_hits SET reset_at = NOW() - INTERVAL '1 second' WHERE bucket_key = 'login:1.2.3.4'")
  const restarted = await login.increment('1.2.3.4')
  assert.equal(restarted.totalHits, 1)
  assert.ok(restarted.resetTime instanceof Date && restarted.resetTime.getTime() > Date.now() + 50_000)
  await pg.close()
})

test('decrement and resetKey adjust only that client', async () => {
  const { pg, pool } = await createDatabase()
  const store = new PgRateLimitStore('recovery', pool)
  store.init({ windowMs: 60_000 } as never)
  await store.increment('a')
  await store.increment('a')
  await store.increment('b')

  await store.decrement('a')
  assert.equal((await store.get('a'))?.totalHits, 1)
  await store.resetKey('a')
  assert.equal(await store.get('a'), undefined)
  assert.equal((await store.get('b'))?.totalHits, 1)
  await pg.close()
})

test('037 keeps the table private to the server and can run twice', async () => {
  const { pg } = await createDatabase()
  await pg.exec('GRANT SELECT ON rate_limit_hits TO anon, authenticated')
  await pg.exec(migration)
  const rls = await pg.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'rate_limit_hits'")
  assert.equal(rls.rows[0].relrowsecurity, true)
  const grants = await pg.query<{ readable: boolean }>(
    "SELECT bool_or(has_table_privilege(r, 'rate_limit_hits', 'SELECT')) AS readable FROM unnest(ARRAY['anon', 'authenticated']) r")
  assert.equal(grants.rows[0].readable, false)
  await pg.close()
})
