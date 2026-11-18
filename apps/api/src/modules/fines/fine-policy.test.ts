import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { validateFinePolicy } from './fine-policy.validation.ts'
import { createFinePolicyService } from './fine-policy.service.ts'
import { createFinePolicyRouter } from './fine-policy.routes.ts'

const valid = { hourlyRate: 2, dailyRate: 10, maximumPenalty: 500, effectiveOn: '2026-11-20', changeReason: 'Raise the cap after the library committee meeting.' }

function fieldError(fn: () => unknown, field: string) {
  try { fn() } catch (error) {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.ok((error.details as { errors: Record<string, string> }).errors[field], `expected an error on ${field}`)
    return
  }
  assert.fail(`expected a validation error on ${field}`)
}

test('fine policy validation accepts numbers and numeric strings', () => {
  assert.deepEqual(validateFinePolicy({ ...valid, hourlyRate: '2.50', changeReason: '  Raise   the cap after review.  ' }), {
    hourlyRate: 2.5, dailyRate: 10, maximumPenalty: 500, effectiveOn: '2026-11-20', changeReason: 'Raise the cap after review.',
  })
})

test('fine policy validation rejects bad amounts, order, cap above 500, dates and reasons', () => {
  fieldError(() => validateFinePolicy({ ...valid, hourlyRate: -1 }), 'hourlyRate')
  fieldError(() => validateFinePolicy({ ...valid, hourlyRate: 1.234 }), 'hourlyRate')
  fieldError(() => validateFinePolicy({ ...valid, dailyRate: 'ten' }), 'dailyRate')
  fieldError(() => validateFinePolicy({ ...valid, dailyRate: null }), 'dailyRate')
  fieldError(() => validateFinePolicy({ ...valid, maximumPenalty: 0, dailyRate: 0, hourlyRate: 0 }), 'maximumPenalty')
  fieldError(() => validateFinePolicy({ ...valid, maximumPenalty: 501 }), 'maximumPenalty')
  fieldError(() => validateFinePolicy({ ...valid, hourlyRate: 11 }), 'hourlyRate')
  fieldError(() => validateFinePolicy({ ...valid, dailyRate: 20, maximumPenalty: 15 }), 'dailyRate')
  fieldError(() => validateFinePolicy({ ...valid, effectiveOn: '2026-02-30' }), 'effectiveOn')
  fieldError(() => validateFinePolicy({ ...valid, effectiveOn: 'tomorrow' }), 'effectiveOn')
  fieldError(() => validateFinePolicy({ ...valid, changeReason: 'short' }), 'changeReason')
  fieldError(() => validateFinePolicy({ ...valid, changeReason: `Bad\u0007reason text here` }), 'changeReason')
  fieldError(() => validateFinePolicy(null), 'hourlyRate')
})

type Call = { sql: string; values: unknown[] }
function fakeDatabase(versions: Record<string, unknown>[]) {
  const calls: Call[] = []
  const state = { committed: false, rolledBack: false, released: false }
  const run = async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    if (/FROM accounts/.test(sql)) return [[{ user_id: 7 }]]
    if (/FROM fine_policy_versions/.test(sql)) return [versions]
    if (/^\s*INSERT INTO fine_policy_versions/.test(sql)) return [{ insertId: 9, affectedRows: 1 }]
    return [{ affectedRows: 1, insertId: 0 }]
  }
  const connection = {
    execute: run,
    beginTransaction: async () => {},
    commit: async () => { state.committed = true },
    rollback: async () => { state.rolledBack = true },
    release: () => { state.released = true },
  }
  return { calls, state, database: { execute: run, getConnection: async () => connection } as never }
}

const seed = { fine_policy_id: 1, hourly_rate: '2.00', daily_rate: '10.00', maximum_penalty: '500.00', effective_from: new Date('2026-01-01T00:00:00+08:00'), effective_until: null, change_reason: null, created_by_user_id: null, created_at: new Date('2026-01-01T00:00:00+08:00') }
const now = () => new Date('2026-11-18T10:00:00+08:00')

test('list labels the active, scheduled and superseded versions', async () => {
  const scheduled = { ...seed, fine_policy_id: 3, effective_from: new Date('2026-12-01T00:00:00+08:00'), change_reason: 'Start of the second semester.' }
  const active = { ...seed, fine_policy_id: 2, hourly_rate: '3.00', effective_from: new Date('2026-06-01T00:00:00+08:00'), effective_until: scheduled.effective_from }
  const { database } = fakeDatabase([scheduled, active, { ...seed, effective_until: active.effective_from }])
  const result = await createFinePolicyService(database, now).list()
  assert.equal(result.active?.versionId, 2)
  assert.equal(result.active?.hourlyRate, 3)
  assert.deepEqual(result.scheduled.map((item) => item.versionId), [3])
  assert.deepEqual(result.history.map((item) => item.status), ['scheduled', 'active', 'superseded'])
})

test('publish today closes the current version and inserts the new one in one locked transaction', async () => {
  const { database, calls, state } = fakeDatabase([seed])
  const created = await createFinePolicyService(database, now).publish(5, { ...valid, effectiveOn: '2026-11-18' })
  assert.equal(created.versionId, 9)
  assert.ok(state.committed && state.released && !state.rolledBack)
  const sql = calls.map((call) => call.sql)
  assert.ok(sql.findIndex((text) => /pg_advisory_xact_lock/.test(text)) < sql.findIndex((text) => /FOR UPDATE/.test(text)))
  const close = calls.find((call) => /UPDATE fine_policy_versions SET effective_until/.test(call.sql))
  const insert = calls.find((call) => /^\s*INSERT INTO fine_policy_versions/.test(call.sql))
  assert.ok(close && insert)
  assert.equal((close.values[0] as Date).getTime(), now().getTime(), 'a same-day change starts now')
  assert.equal(close.values[1], 1)
  assert.deepEqual(insert.values.slice(0, 3), [2, 10, 500])
  assert.equal(insert.values[4], 7, 'created_by_user_id comes from the account')
  assert.equal(insert.values[5], valid.changeReason)
  assert.ok(calls.some((call) => /INSERT INTO admin_notifications/.test(call.sql)))
})

test('publish on a later date starts at Manila midnight', async () => {
  const { database, calls } = fakeDatabase([seed])
  await createFinePolicyService(database, now).publish(5, valid)
  const insert = calls.find((call) => /^\s*INSERT INTO fine_policy_versions/.test(call.sql))!
  assert.equal((insert.values[3] as Date).toISOString(), new Date('2026-11-20T00:00:00+08:00').toISOString())
})

test('publish rejects backdated, more than a year ahead, and not after the latest version', async () => {
  const past = fakeDatabase([seed])
  await assert.rejects(createFinePolicyService(past.database, now).publish(5, { ...valid, effectiveOn: '2026-11-17' }), { code: 'FINE_POLICY_BACKDATED' })
  const later = fakeDatabase([{ ...seed, fine_policy_id: 4, effective_from: new Date('2026-12-01T00:00:00+08:00') }])
  await assert.rejects(createFinePolicyService(later.database, now).publish(5, valid), { code: 'FINE_POLICY_SCHEDULE_CONFLICT' })
  assert.ok(later.state.rolledBack && later.state.released)
  await assert.rejects(createFinePolicyService(past.database, now).publish(0, valid), { code: 'FINE_POLICY_VALIDATION_FAILED' })
  await assert.rejects(createFinePolicyService(past.database, now).publish(5, { ...valid, effectiveOn: '2027-11-19' }), { code: 'FINE_POLICY_TOO_FAR_AHEAD' })
})

test('only the Librarian role can read or publish fine rules', async () => {
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    let calls = 0
    const service = { list: async () => { calls++; return { active: null, scheduled: [], history: [] } }, publish: async () => { calls++; return { versionId: 2 } } }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use('/fine-policies', requireLibraryPermission('library.manage'), createFinePolicyRouter(service as never))
    assert.equal((await request(app).get('/fine-policies')).status, role === 'Librarian' ? 200 : 403)
    assert.equal((await request(app).post('/fine-policies').send({})).status, role === 'Librarian' ? 201 : 403)
    assert.equal(calls, role === 'Librarian' ? 2 : 0)
  }
})

test('a bad body through the router returns 422 with field errors', async () => {
  const { database } = fakeDatabase([seed])
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role: 'Librarian' }; next() })
  app.use('/fine-policies', createFinePolicyRouter(createFinePolicyService(database, now)))
  app.use((error: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status).json({ success: false, code: error.code, details: error.details }) })
  const response = await request(app).post('/fine-policies').send({ ...valid, maximumPenalty: 900 })
  assert.equal(response.status, 422)
  assert.ok(response.body.details.errors.maximumPenalty)
})
