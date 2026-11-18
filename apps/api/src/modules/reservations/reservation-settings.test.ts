import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createReservationSettingsService } from './reservation-settings.service.ts'
import { createReservationSettingsRouter } from './reservation-settings.routes.ts'

const migration043 = readFileSync(new URL('../../../../../database/supabase/043_reservation_settings.sql', import.meta.url), 'utf8')
const LIBRARIAN = 11
const STAFF = 12
const T0 = new Date('2026-11-19T02:00:00.000Z')

async function createDatabase({ apply = true } = {}) {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE accounts (account_id BIGINT PRIMARY KEY, user_id BIGINT, school_id TEXT, role TEXT, account_status TEXT);
    CREATE TABLE users (user_id BIGINT PRIMARY KEY, full_name TEXT, account_status TEXT);
    CREATE TABLE reservations (reservation_id BIGSERIAL PRIMARY KEY, request_kind TEXT, reservation_status TEXT,
      assigned_physical_copy_id BIGINT, reserved_at TIMESTAMP, pickup_deadline TIMESTAMP);
    INSERT INTO users VALUES (101, 'Lia Librarian', 'Active'), (102, 'Sam Staff', 'Active'), (103, 'Bea Librarian', 'Active');
    INSERT INTO accounts VALUES (11, 101, 'LIB-001', 'Librarian', 'Active'), (12, 102, 'STF-001', 'Staff', 'Active'),
      (13, 103, 'LIB-002', 'Librarian', 'Active');`)
  if (apply) await pg.exec(migration043)
  const execute = async (sql: string, values: unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), values)
    const write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
    return write ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }, result] : [result.rows, result]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
  const pool = { execute, query: execute, getConnection: async () => connection } as unknown as Pool
  return { pg, pool }
}

type Service = ReturnType<typeof createReservationSettingsService>
function routeApp(service: Pick<Service, 'read' | 'save'>, accountId: number, role: string) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.authenticatedUser = { id: accountId, accountId, role }; next() })
  app.use('/settings', requireLibraryPermission('library.manage'), createReservationSettingsRouter(service as Service))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
    else res.status(500).json({ success: false, message: String(error) })
  })
  return app
}

async function storedWindow(pg: PGlite) {
  const r = await pg.query<{ pickup_window_days: number }>('SELECT pickup_window_days FROM reservation_settings WHERE settings_id = 1')
  return r.rows[0]?.pickup_window_days
}

test('043 creates one default settings row, locks it from Supabase client roles and can run twice', async () => {
  const { pg } = await createDatabase()
  await pg.exec(migration043)
  const rows = await pg.query('SELECT settings_id, pickup_window_days, waiting_expiry_days FROM reservation_settings')
  assert.deepEqual(rows.rows, [{ settings_id: 1, pickup_window_days: 1, waiting_expiry_days: null }])
  const rls = await pg.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'reservation_settings'")
  assert.equal(rls.rows[0].relrowsecurity, true)
  const grants = await pg.query<{ readable: boolean }>(
    "SELECT bool_or(has_table_privilege(r, 'reservation_settings', 'SELECT')) AS readable FROM unnest(ARRAY['anon', 'authenticated']) r")
  assert.equal(grants.rows[0].readable, false)
  const index = await pg.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_reservation_waiting_reserved'")
  assert.match(index.rows[0].indexdef, /\(reserved_at\) WHERE/)
  await pg.close()
})

test('a Librarian saves pickup window 3 and reads it back with their name and the save time', async () => {
  const { pg, pool } = await createDatabase()
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  const saved = await request(app).put('/settings').send({ pickupWindowDays: 3 })
  assert.equal(saved.status, 200)
  assert.equal(saved.headers['cache-control'], 'private, no-store')
  assert.equal(saved.body.data.pickupWindowDays, 3)
  assert.equal(saved.body.data.pickupWindowChangedBy, 'Lia Librarian')
  assert.equal(saved.body.data.pickupWindowChangedAt, T0.toISOString())
  const read = await request(app).get('/settings')
  assert.equal(read.status, 200)
  assert.deepEqual(read.body.data, saved.body.data)
  await pg.close()
})

test('pickup window 8 is rejected with a field message and nothing is saved', async () => {
  const { pg, pool } = await createDatabase()
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  const response = await request(app).put('/settings').send({ pickupWindowDays: 8 })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'RESERVATION_SETTINGS_INVALID')
  assert.ok(response.body.details.errors.pickupWindowDays)
  assert.equal(await storedWindow(pg), 1)
  await pg.close()
})

test('Staff cannot save the pickup window and nothing is saved', async () => {
  const { pg, pool } = await createDatabase()
  const app = routeApp(createReservationSettingsService(pool, () => T0), STAFF, 'Staff')
  const response = await request(app).put('/settings').send({ pickupWindowDays: 3 })
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
  assert.equal(await storedWindow(pg), 1)
  await pg.close()
})
