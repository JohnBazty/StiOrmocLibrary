import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { HttpError } from '../../core/http-error.ts'
import { authenticateJwt, requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createReservationSettingsService, DEFAULT_RESERVATION_SETTINGS, dayCount, parseReservationSettingsUpdate, readReservationSettings } from './reservation-settings.service.ts'
import { createReservationSettingsRouter } from './reservation-settings.routes.ts'

const migration043 = readFileSync(new URL('../../../../../database/supabase/070_reservation_settings.sql', import.meta.url), 'utf8')
const LIBRARIAN = 11
const STAFF = 12
const T0 = new Date('2026-11-19T02:00:00.000Z')

async function createDatabase({ apply = true } = {}) {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE accounts (account_id BIGINT PRIMARY KEY, user_id BIGINT, school_id TEXT, role TEXT, account_status TEXT);
    CREATE TABLE users (user_id BIGINT PRIMARY KEY, full_name TEXT, account_status TEXT);
    CREATE TABLE library_profile_settings (settings_id INT PRIMARY KEY); INSERT INTO library_profile_settings VALUES (1);
    CREATE TABLE reservations (reservation_id BIGSERIAL PRIMARY KEY, request_kind TEXT, reservation_status TEXT,
      assigned_physical_copy_id BIGINT, reserved_at TIMESTAMP, pickup_deadline TIMESTAMP);
    INSERT INTO users VALUES (101, 'Lia Librarian', 'Active'), (102, 'Sam Staff', 'Active'), (103, 'Bea Librarian', 'Active');
    INSERT INTO accounts VALUES (11, 101, 'LIB-001', 'Librarian', 'Active'), (12, 102, 'STF-001', 'Staff', 'Active'),
      (13, 103, 'LIB-002', 'Librarian', 'Active');`)
  if (apply) await pg.exec(migration043)
  const sqls: string[] = []
  const execute = async (sql: string, values: unknown[] = []) => {
    sqls.push(sql)
    const result = await pg.query(toPgPlaceholders(sql), values)
    const write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
    return write ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }, result] : [result.rows, result]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
  const pool = { execute, query: execute, getConnection: async () => connection } as unknown as Pool
  return { pg, pool, sqls }
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

const PICKUP_MESSAGE = 'Enter a whole number of days from 1 to 7.'
const WAITING_MESSAGE = 'Leave blank to turn off, or enter a whole number of days from 7 to 90.'
function rejects(body: unknown, field: string | null, message: string) {
  assert.throws(() => parseReservationSettingsUpdate(body), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'RESERVATION_SETTINGS_INVALID')
    assert.equal(error.message, message)
    if (field) assert.equal((error.details as { errors: Record<string, string> }).errors[field], message)
    return true
  }, `expected ${JSON.stringify(body)} to be rejected`)
}

test('the pickup window accepts whole days 1 to 7 only', () => {
  for (const [value, expected] of [[1, 1], [7, 7], ['3', 3], [' 7 ', 7]] as const) {
    assert.deepEqual(parseReservationSettingsUpdate({ pickupWindowDays: value }), { pickupWindowDays: expected })
  }
  for (const value of [0, 8, 2.5, '2.5', 'abc', '', null, true, [3]]) rejects({ pickupWindowDays: value }, 'pickupWindowDays', PICKUP_MESSAGE)
})

test('the waiting-list limit accepts blank (off) or whole days 7 to 90 only', () => {
  for (const [value, expected] of [[7, 7], [90, 90], ['14', 14], ['', null], [null, null]] as const) {
    assert.deepEqual(parseReservationSettingsUpdate({ waitingExpiryDays: value }), { waitingExpiryDays: expected })
  }
  for (const value of [6, 91, 2.5, 'abc', true]) rejects({ waitingExpiryDays: value }, 'waitingExpiryDays', WAITING_MESSAGE)
})

test('a body with neither setting is rejected', () => {
  for (const body of [{}, null, 'x', [3], { other: 1 }]) rejects(body, null, 'Choose a setting to save.')
})

test('one invalid value saves nothing, not even the valid one', async () => {
  const { pg, pool } = await createDatabase()
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  const response = await request(app).put('/settings').send({ pickupWindowDays: 3, waitingExpiryDays: 91 })
  assert.equal(response.status, 422)
  assert.ok(response.body.details.errors.waitingExpiryDays)
  const row = await pg.query('SELECT pickup_window_days, waiting_expiry_days, pickup_window_changed_by FROM reservation_settings')
  assert.deepEqual(row.rows, [{ pickup_window_days: 1, waiting_expiry_days: null, pickup_window_changed_by: null }])
  await pg.close()
})

test('every save of the waiting-list limit records the save time and librarian; blank turns it off', async () => {
  const { pg, pool } = await createDatabase()
  let now = T0
  const app = routeApp(createReservationSettingsService(pool, () => now), LIBRARIAN, 'Librarian')
  const first = await request(app).put('/settings').send({ waitingExpiryDays: 14 })
  assert.equal(first.status, 200)
  assert.deepEqual(first.body.data, { pickupWindowDays: 1, pickupWindowChangedBy: null, pickupWindowChangedAt: null,
    waitingExpiryDays: 14, waitingExpiryChangedBy: 'Lia Librarian', waitingExpiryChangedAt: T0.toISOString(), facultyWaitingExpiryDays: null })
  const later = new Date(T0.getTime() + 3600_000)
  now = later
  await request(app).put('/settings').send({ waitingExpiryDays: 14 })
  assert.deepEqual((await readReservationSettings(pool)).waitingExpirySavedAt, later)
  const off = await request(app).put('/settings').send({ waitingExpiryDays: '' })
  assert.equal(off.body.data.waitingExpiryDays, null)
  assert.equal(off.body.data.waitingExpiryChangedBy, 'Lia Librarian')
  assert.equal(off.body.data.waitingExpiryChangedAt, later.toISOString())
  const row = await pg.query<{ waiting_expiry_days: number | null; waiting_expiry_saved_at: Date }>('SELECT waiting_expiry_days, waiting_expiry_saved_at FROM reservation_settings')
  assert.equal(row.rows[0].waiting_expiry_days, null)
  assert.equal(row.rows[0].waiting_expiry_saved_at.toISOString(), later.toISOString())
  await pg.close()
})

test('a fresh 043 database reports window 1, limit off and Default for both settings', async () => {
  const { pg, pool } = await createDatabase()
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  const response = await request(app).get('/settings')
  assert.deepEqual(response.body.data, { pickupWindowDays: 1, pickupWindowChangedBy: null, pickupWindowChangedAt: null,
    waitingExpiryDays: null, waitingExpiryChangedBy: null, waitingExpiryChangedAt: null, facultyWaitingExpiryDays: null })
  assert.deepEqual(await readReservationSettings(pool), DEFAULT_RESERVATION_SETTINGS)
  await pg.close()
})

test('without 043 the read falls back to defaults inside an open transaction and saving returns 503', async () => {
  const { pg, pool } = await createDatabase({ apply: false })
  await pg.exec('BEGIN')
  assert.deepEqual(await readReservationSettings(pool), DEFAULT_RESERVATION_SETTINGS)
  assert.deepEqual((await pg.query('SELECT 1 AS ok')).rows, [{ ok: 1 }])
  await pg.exec('COMMIT')
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  const read = await request(app).get('/settings')
  assert.equal(read.status, 200)
  assert.equal(read.body.data.pickupWindowDays, 1)
  assert.equal(read.body.data.waitingExpiryDays, null)
  const saved = await request(app).put('/settings').send({ pickupWindowDays: 3 })
  assert.equal(saved.status, 503)
  assert.equal(saved.body.code, 'RESERVATION_SETTINGS_UNAVAILABLE')
  await pg.close()
})

test('a deleted settings row reads as defaults and the next save recreates it', async () => {
  const { pg, pool } = await createDatabase()
  await pg.exec('DELETE FROM reservation_settings')
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  assert.equal((await request(app).get('/settings')).body.data.pickupWindowChangedBy, null)
  assert.deepEqual(await readReservationSettings(pool), DEFAULT_RESERVATION_SETTINGS)
  const saved = await request(app).put('/settings').send({ waitingExpiryDays: 30 })
  assert.equal(saved.status, 200)
  assert.equal(saved.body.data.waitingExpiryDays, 30)
  assert.equal(saved.body.data.pickupWindowDays, 1)
  await pg.close()
})

test('two librarians saving in turn: the last committed save and its name win', async () => {
  const { pg, pool } = await createDatabase()
  const service = createReservationSettingsService(pool, () => T0)
  await request(routeApp(service, LIBRARIAN, 'Librarian')).put('/settings').send({ pickupWindowDays: 2 })
  await request(routeApp(service, 13, 'Librarian')).put('/settings').send({ pickupWindowDays: 4 })
  const view = (await request(routeApp(service, LIBRARIAN, 'Librarian')).get('/settings')).body.data
  assert.equal(view.pickupWindowDays, 4)
  assert.equal(view.pickupWindowChangedBy, 'Bea Librarian')
  assert.equal((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM reservation_settings')).rows[0].n, 1)
  await pg.close()
})

test('saving a new pickup window leaves stored pickup deadlines unchanged', async () => {
  const { pg, pool } = await createDatabase()
  await pg.exec(`INSERT INTO reservations (request_kind, reservation_status, assigned_physical_copy_id, reserved_at, pickup_deadline)
    VALUES ('Reservation', 'ready_for_pickup', 5, '2026-11-17 01:00', '2026-11-18 01:00')`)
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  assert.equal((await request(app).put('/settings').send({ pickupWindowDays: 5 })).status, 200)
  const r = await pg.query<{ d: string }>("SELECT to_char(pickup_deadline, 'YYYY-MM-DD HH24:MI') AS d FROM reservations")
  assert.equal(r.rows[0].d, '2026-11-18 01:00')
  await pg.close()
})

test('only Librarians reach the settings API; other roles get 403 and signed-out gets 401', async () => {
  let calls = 0
  const stub = { read: async () => { calls += 1; return {} as never }, save: async () => { calls += 1; return {} as never } }
  for (const role of ['Staff', 'Student', 'Faculty', 'Admin']) {
    const app = routeApp(stub, 1, role)
    for (const response of [await request(app).get('/settings'), await request(app).put('/settings').send({ pickupWindowDays: 3 })]) {
      assert.equal(response.status, 403, role)
      assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
    }
  }
  assert.equal(calls, 0)
  const signedOut = express()
  signedOut.use(express.json())
  signedOut.use('/settings', authenticateJwt, requireLibraryPermission('library.manage'), createReservationSettingsRouter(stub as unknown as Service))
  for (const response of [await request(signedOut).get('/settings'), await request(signedOut).put('/settings').send({ pickupWindowDays: 3 })]) {
    assert.equal(response.status, 401)
    assert.equal(response.body.code, 'JWT_REQUIRED')
  }
  assert.equal(calls, 0)
  assert.equal((await request(routeApp(stub, LIBRARIAN, 'Librarian')).get('/settings')).status, 200)
  assert.equal(calls, 1)
})

test('dayCount reads 1 day and N days', () => {
  assert.equal(dayCount(1), '1 day')
  assert.equal(dayCount(3), '3 days')
})

test('a save takes the circulation lock before writing, so it cannot race the expiry job', async () => {
  const { pg, pool, sqls } = await createDatabase()
  const app = routeApp(createReservationSettingsService(pool, () => T0), LIBRARIAN, 'Librarian')
  assert.equal((await request(app).put('/settings').send({ waitingExpiryDays: 14 })).status, 200)
  const lockAt = sqls.findIndex((sql) => /FROM library_profile_settings WHERE settings_id=1 FOR UPDATE/.test(sql))
  const writeAt = sqls.findIndex((sql) => /INSERT INTO reservation_settings/.test(sql))
  assert.ok(lockAt >= 0 && lockAt < writeAt, `lock at ${lockAt}, write at ${writeAt}`)
  await pg.close()
})

test('the faculty waiting-list limit is its own setting: 7 to 180 days, or empty so faculty requests never expire', async () => {
  const { parseReservationSettingsUpdate } = await import('./reservation-settings.service.ts')
  assert.deepEqual(parseReservationSettingsUpdate({ facultyWaitingExpiryDays: 30 }), { facultyWaitingExpiryDays: 30 })
  assert.deepEqual(parseReservationSettingsUpdate({ facultyWaitingExpiryDays: '' }), { facultyWaitingExpiryDays: null })
  assert.throws(() => parseReservationSettingsUpdate({ facultyWaitingExpiryDays: 3 }))
})
