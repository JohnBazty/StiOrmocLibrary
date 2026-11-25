import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { after } from 'node:test'
import { readFileSync } from 'node:fs'
import { createConductTestDb, resetConductTestDb } from './conduct-test-db.ts'
import { validateViolationCategory, validateMaxFine } from './violation-categories.validation.ts'
import { createViolationCategoriesService } from './violation-categories.service.ts'
import { createViolationCategoriesRouter } from './violation-categories.routes.ts'

let shared: Awaited<ReturnType<typeof createConductTestDb>> | undefined
const database = async () => (shared ??= await createConductTestDb())
after(async () => { await shared?.pg.close() })

const valid = { name: 'Damaging furniture', description: 'Writing on or breaking library furniture.', warningsBeforeFine: 1, fineAmount: '75.50' }

function fieldError(fn: () => unknown, field: string) {
  try { fn() } catch (error) {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.ok((error.details as { errors: Record<string, string> }).errors[field], `expected an error on ${field}`)
    return
  }
  assert.fail(`expected a validation error on ${field}`)
}

test('validation accepts a complete category and normalises text and money', () => {
  assert.deepEqual(validateViolationCategory({ ...valid, name: '  Damaging   furniture ' }), {
    name: 'Damaging furniture',
    description: 'Writing on or breaking library furniture.',
    warningsBeforeFine: 1,
    fineAmount: 75.5,
    allowedLevels: ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'],
  })
  assert.equal(validateViolationCategory({ ...valid, description: '' }).description, null)
  assert.deepEqual(validateViolationCategory({ name: 'Late id', fineAmount: '25', allowedLevels: ['1st Year', 'Grade 11'] }), {
    name: 'Late id',
    description: null,
    fineAmount: 25,
    allowedLevels: ['Grade 11', '1st Year'],
  })
})

test('validation rejects bad names, warning counts, amounts and flags', () => {
  fieldError(() => validateViolationCategory({ ...valid, name: 'x' }), 'name')
  fieldError(() => validateViolationCategory({ ...valid, name: 'x'.repeat(81) }), 'name')
  fieldError(() => validateViolationCategory({ ...valid, description: 'x'.repeat(301) }), 'description')
  for (const warningsBeforeFine of [-1, 100, 1.5, 'two', null]) fieldError(() => validateViolationCategory({ ...valid, warningsBeforeFine }), 'warningsBeforeFine')
  for (const fineAmount of [0, -5, '1.234', 'abc', 1_000_000, null, '']) fieldError(() => validateViolationCategory({ ...valid, fineAmount }), 'fineAmount')
  fieldError(() => validateViolationCategory({ ...valid, isActive: 'yes' }, true), 'isActive')
  for (const name of ['Noise::Loud', '__earlier', '__EARLIER']) fieldError(() => validateViolationCategory({ ...valid, name }), 'name')
  fieldError(() => validateViolationCategory(null), 'name')
})

test('the fine is limited to four digits: PHP 9,999.99 at most', () => {
  assert.equal(validateViolationCategory({ ...valid, fineAmount: '9999.99' }).fineAmount, 9999.99)
  assert.equal(validateViolationCategory({ ...valid, fineAmount: 1 }).fineAmount, 1)
  for (const fineAmount of [10_000, '10000', '10000.00', 12345.67, 999_999.99]) fieldError(() => validateViolationCategory({ ...valid, fineAmount }), 'fineAmount')
})

test('a partial update validates only the fields sent and needs at least one', () => {
  assert.deepEqual(validateViolationCategory({ isActive: false }, true), { isActive: false })
  fieldError(() => validateViolationCategory({}, true), 'name')
})

test('create, edit, retire and restore keep an audit note and lock the name once used', async () => {
  const { pg, pool } = await database()
  try {
    const service = createViolationCategoriesService(pool)
    const seeded = await service.list()
    assert.deepEqual(seeded.map(c => c.name), ['Noise', 'Eating or food', 'Other conduct'])
    assert.equal(seeded[0].fineAmount, 50)
    assert.equal(seeded[0].warningsBeforeFine, 2)
    const created = await service.create(1, valid)
    assert.equal(created.name, 'Damaging furniture')
    assert.equal(created.isActive, true)
    await assert.rejects(service.create(1, { ...valid, name: 'damaging furniture' }), { code: 'VIOLATION_CATEGORY_DUPLICATE' })
    await assert.rejects(service.update(1, created.categoryId, { name: 'Damaging property' }), { status: 422 })
    const renamed = await service.update(1, created.categoryId, { name: 'Damaging property', fineAmount: 90, updatedAt: created.updatedAt })
    assert.equal(renamed.name, 'Damaging property')
    assert.equal(renamed.fineAmount, 90)
    await assert.rejects(service.update(1, created.categoryId, { isActive: false, updatedAt: created.updatedAt }), { status: 409, code: 'VIOLATION_CATEGORY_STALE' })
    const retired = await service.update(1, created.categoryId, { isActive: false, updatedAt: renamed.updatedAt })
    assert.equal(retired.isActive, false)
    const restored = await service.update(1, created.categoryId, { isActive: true, updatedAt: retired.updatedAt })
    assert.equal(restored.isActive, true)
    assert.equal((await pg.query('SELECT * FROM admin_notifications')).rows.length, 4)
    await pg.exec("INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,recorded_by_account_id,request_key,payload_hash) VALUES(2,'Damaging property',NOW(),'Library','Synthetic details here','First warning',1,gen_random_uuid(),'h')")
    const used = (await service.list()).find(c => c.categoryId === created.categoryId)!
    assert.equal(used.used, true)
    await assert.rejects(service.update(1, created.categoryId, { name: 'Another name', updatedAt: restored.updatedAt }), { code: 'VIOLATION_CATEGORY_NAME_LOCKED' })
    assert.equal((await service.update(1, created.categoryId, { name: 'Damaging property', description: 'New text here', updatedAt: restored.updatedAt })).description, 'New text here')
    await assert.rejects(service.update(1, 9999, { isActive: false, updatedAt: restored.updatedAt }), { code: 'VIOLATION_CATEGORY_NOT_FOUND' })
    await assert.rejects(service.create(0, valid), { code: 'VIOLATION_CATEGORY_LOGIN' })
  } finally { await resetConductTestDb(pg) }
})

test('an unused category can be deleted for good; one with records cannot and is retired instead', async () => {
  const { pg, pool } = await database()
  try {
    const service = createViolationCategoriesService(pool)
    const unused = await service.create(1, valid)
    const kept = await service.create(1, { ...valid, name: 'Phone use' })
    await pg.exec("INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,recorded_by_account_id,request_key,payload_hash) VALUES(2,'Phone use',NOW(),'Library','Synthetic details here','First warning',1,gen_random_uuid(),'h')")
    await assert.rejects(service.remove(1, kept.categoryId), { status: 409, code: 'VIOLATION_CATEGORY_IN_USE' })
    assert.ok((await service.list()).some(c => c.categoryId === kept.categoryId))
    await pg.exec("INSERT INTO conduct_students(user_id,category,prior_warnings,reason,reviewed_by_account_id) VALUES(3,'Damaging furniture',1,'Synthetic earlier review',1)")
    await assert.rejects(service.remove(1, unused.categoryId), { code: 'VIOLATION_CATEGORY_IN_USE' })
    await pg.exec("ALTER TABLE conduct_students DISABLE TRIGGER conduct_students_immutable; DELETE FROM conduct_students; ALTER TABLE conduct_students ENABLE TRIGGER conduct_students_immutable")
    const before = (await pg.query('SELECT * FROM admin_notifications')).rows.length
    assert.deepEqual(await service.remove(1, unused.categoryId), { deleted: true })
    assert.equal((await service.list()).some(c => c.categoryId === unused.categoryId), false)
    const notes = (await pg.query<{ message_title: string; message_body: string }>('SELECT message_title,message_body FROM admin_notifications ORDER BY admin_notification_id DESC LIMIT 1')).rows
    assert.equal((await pg.query('SELECT * FROM admin_notifications')).rows.length, before + 1)
    assert.equal(notes[0].message_title, 'Violation category deleted')
    assert.match(notes[0].message_body, /Damaging furniture/)
    await assert.rejects(service.remove(1, unused.categoryId), { status: 404, code: 'VIOLATION_CATEGORY_NOT_FOUND' })
    await assert.rejects(service.remove(1, 'abc'), { status: 422 })
    await assert.rejects(service.remove(0, kept.categoryId), { code: 'VIOLATION_CATEGORY_LOGIN' })
    assert.equal((await service.list()).length, 4)
  } finally { await resetConductTestDb(pg) }
})

test('a record saved between the check and the delete is stopped by the database and reported as in use', async () => {
  const { pg, pool } = await database()
  try {
    const raced = { ...pool, getConnection: async () => {
      const c = await (pool as unknown as { getConnection: () => Promise<{ execute: (s: string, v?: unknown[]) => Promise<unknown> }> }).getConnection()
      const run = c.execute
      c.execute = async (sql: string, v?: unknown[]) => { if (/^\s*DELETE FROM violation_categories/.test(sql)) throw Object.assign(new Error('foreign key'), { code: '23503' }); return run(sql, v) }
      return c
    } } as never
    const created = await createViolationCategoriesService(pool).create(1, valid)
    await assert.rejects(createViolationCategoriesService(raced).remove(1, created.categoryId), { status: 409, code: 'VIOLATION_CATEGORY_IN_USE' })
  } finally { await resetConductTestDb(pg) }
})

test('names are unique ignoring case in the database, and a unique-violation race maps to the duplicate error', async () => {
  const { pg, pool } = await database()
  try {
    await assert.rejects(pg.exec("INSERT INTO violation_categories(name,fine_amount) VALUES('NOISE',10)"), /unique|duplicate/i)
    const racing = { ...pool, getConnection: async () => {
      const c = await (pool as unknown as { getConnection: () => Promise<{ execute: (s: string, v?: unknown[]) => Promise<unknown> }> }).getConnection()
      const run = c.execute
      c.execute = async (sql: string, v?: unknown[]) => { if (/^\s*INSERT INTO violation_categories/.test(sql)) throw Object.assign(new Error('duplicate key'), { code: '23505' }); return run(sql, v) }
      return c
    } } as never
    await assert.rejects(createViolationCategoriesService(racing).create(1, valid), { status: 409, code: 'VIOLATION_CATEGORY_DUPLICATE' })
  } finally { await resetConductTestDb(pg) }
})

test('migration 074 starts with a lock timeout and drops the old category checks without hiding a name mismatch', () => {
  const sql = readFileSync(new URL('../../../../../database/supabase/074_violation_categories.sql', import.meta.url), 'utf8')
  assert.match(sql.replace(/^(--.*\r?\n)+/, ''), /^SET LOCAL lock_timeout = '5s';/)
  assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS/i)
  assert.match(sql, /CREATE UNIQUE INDEX[^;]*lower\(name\)/i)
})

test('migrations 075 and 076: the database keeps only a hard ceiling, the library limit lives in violation_settings', async () => {
  const sql = readFileSync(new URL('../../../../../database/supabase/075_violation_fine_four_digits.sql', import.meta.url), 'utf8')
  assert.match(sql.replace(/^(--.*\r?\n)+/, ''), /^SET LOCAL lock_timeout = '5s';/)
  assert.doesNotMatch(sql, /DROP CONSTRAINT IF EXISTS/i)
  const { pg } = await database()
  try {
    await pg.exec("INSERT INTO violation_categories(name,fine_amount) VALUES('Four digits',9999.99)")
    await pg.exec("INSERT INTO violation_categories(name,fine_amount) VALUES('Five digits',10000)")
    await assert.rejects(pg.exec("INSERT INTO violation_categories(name,fine_amount) VALUES('Seven digits',1000000)"), /check/i)
    assert.equal(Number((await pg.query<{ max_fine: string }>('SELECT max_fine FROM violation_settings')).rows[0].max_fine), 9999.99)
    await assert.rejects(pg.exec('INSERT INTO violation_settings(settings_id,max_fine) VALUES(2,100)'), /check|duplicate|unique/i)
    await assert.rejects(pg.exec('UPDATE violation_settings SET max_fine=1000000'), /check/i)
  } finally { await resetConductTestDb(pg) }
})

test('the highest allowed fine is a setting: custom limit in validation, stale and too-low changes refused', async () => {
  assert.equal(validateViolationCategory({ ...valid, fineAmount: '10000' }, false, 10_000).fineAmount, 10_000)
  fieldError(() => validateViolationCategory({ ...valid, fineAmount: '10000.01' }, false, 10_000), 'fineAmount')
  assert.equal(validateMaxFine('10000'), 10_000)
  for (const bad of [0, -1, '1.234', 'abc', 1_000_000, null, '']) fieldError(() => validateMaxFine(bad), 'maxFine')
  const { pg, pool } = await database()
  try {
    const service = createViolationCategoriesService(pool)
    const first = await service.getSettings()
    assert.equal(first.maxFine, 9999.99)
    await assert.rejects(service.create(1, { ...valid, fineAmount: '10000' }), { status: 422 })
    const raised = await service.saveSettings(1, { maxFine: '10000', updatedAt: first.updatedAt })
    assert.equal(raised.maxFine, 10_000)
    await assert.rejects(service.saveSettings(1, { maxFine: '20000', updatedAt: first.updatedAt }), { status: 409, code: 'VIOLATION_SETTINGS_STALE' })
    await assert.rejects(service.saveSettings(1, { maxFine: '20000' }), { status: 422 })
    await assert.rejects(service.saveSettings(0, { maxFine: '20000', updatedAt: raised.updatedAt }), { code: 'VIOLATION_CATEGORY_LOGIN' })
    const big = await service.create(1, { ...valid, fineAmount: '10000' })
    assert.equal(big.fineAmount, 10_000)
    await assert.rejects(service.update(1, big.categoryId, { fineAmount: 10_001, updatedAt: big.updatedAt }), { status: 422 })
    await assert.rejects(service.saveSettings(1, { maxFine: '5000', updatedAt: raised.updatedAt }), { status: 422, code: 'VIOLATION_SETTINGS_BELOW_EXISTING' })
    assert.equal((await service.getSettings()).maxFine, 10_000)
    const notes = (await pg.query<{ message_title: string }>("SELECT message_title FROM admin_notifications WHERE message_title='Highest violation fine changed'")).rows
    assert.equal(notes.length, 1)
    const rules = await service.saveSettings(1, { warningsBeforeFine: 5, levelWarnings: { '1st Year': 10, 'Grade 11': 2 }, updatedAt: raised.updatedAt })
    assert.equal(rules.warningsBeforeFine, 5)
    assert.deepEqual(rules.levelWarnings, { '1st Year': 10, 'Grade 11': 2 })
    await assert.rejects(service.saveSettings(1, { warningsBeforeFine: 100, updatedAt: rules.updatedAt }), { status: 422 })
    await assert.rejects(service.saveSettings(1, { levelWarnings: { '5th Year': 1 }, updatedAt: rules.updatedAt }), { status: 422 })
  } finally { await resetConductTestDb(pg) }
})

test('only the Librarian role reaches the routes, including delete', async () => {
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    let calls = 0
    const service = { list: async () => { calls++; return [] }, create: async () => { calls++; return { categoryId: 1 } }, update: async () => { calls++; return { categoryId: 1 } }, remove: async () => { calls++; return { deleted: true } }, getSettings: async () => { calls++; return { maxFine: 9999.99 } }, saveSettings: async () => { calls++; return { maxFine: 10000 } } }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use('/violation-categories', requireLibraryPermission('library.manage'), createViolationCategoriesRouter(service as never))
    const allowed = role === 'Librarian'
    assert.equal((await request(app).get('/violation-categories')).status, allowed ? 200 : 403)
    assert.equal((await request(app).post('/violation-categories').send({})).status, allowed ? 201 : 403)
    assert.equal((await request(app).patch('/violation-categories/1').send({})).status, allowed ? 200 : 403)
    const removed = await request(app).delete('/violation-categories/1')
    assert.equal(removed.status, allowed ? 200 : 403)
    if (allowed) assert.deepEqual(removed.body, { success: true, message: 'Violation category deleted.', data: { deleted: true } })
    assert.equal((await request(app).get('/violation-categories/settings')).status, allowed ? 200 : 403)
    assert.equal((await request(app).put('/violation-categories/settings').send({})).status, allowed ? 200 : 403)
    assert.equal(calls, allowed ? 6 : 0)
  }
})

test('a bad body through the router returns 422 with field errors', async () => {
  const { pg, pool } = await database()
  try {
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role: 'Librarian' }; next() })
    app.use('/violation-categories', createViolationCategoriesRouter(createViolationCategoriesService(pool)))
    app.use((error: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status).json({ success: false, code: error.code, details: error.details }) })
    const response = await request(app).post('/violation-categories').send({ ...valid, fineAmount: 0 })
    assert.equal(response.status, 422)
    assert.ok(response.body.details.errors.fineAmount)
  } finally { await resetConductTestDb(pg) }
})
