import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { after } from 'node:test'
import { createConductTestDb, resetConductTestDb } from './conduct-test-db.ts'
import { validateViolationCategory } from './violation-categories.validation.ts'
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
    name: 'Damaging furniture', description: 'Writing on or breaking library furniture.', warningsBeforeFine: 1, fineAmount: 75.5,
  })
  assert.equal(validateViolationCategory({ ...valid, description: '' }).description, null)
})

test('validation rejects bad names, warning counts, amounts and flags', () => {
  fieldError(() => validateViolationCategory({ ...valid, name: 'x' }), 'name')
  fieldError(() => validateViolationCategory({ ...valid, name: 'x'.repeat(81) }), 'name')
  fieldError(() => validateViolationCategory({ ...valid, description: 'x'.repeat(301) }), 'description')
  for (const warningsBeforeFine of [-1, 4, 1.5, 'two', null]) fieldError(() => validateViolationCategory({ ...valid, warningsBeforeFine }), 'warningsBeforeFine')
  for (const fineAmount of [0, -5, '1.234', 'abc', 1_000_000, null, '']) fieldError(() => validateViolationCategory({ ...valid, fineAmount }), 'fineAmount')
  fieldError(() => validateViolationCategory({ ...valid, isActive: 'yes' }, true), 'isActive')
  fieldError(() => validateViolationCategory(null), 'name')
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
    const renamed = await service.update(1, created.categoryId, { name: 'Damaging property', fineAmount: 90 })
    assert.equal(renamed.name, 'Damaging property')
    assert.equal(renamed.fineAmount, 90)
    const retired = await service.update(1, created.categoryId, { isActive: false })
    assert.equal(retired.isActive, false)
    assert.equal((await service.update(1, created.categoryId, { isActive: true })).isActive, true)
    assert.equal((await pg.query('SELECT * FROM admin_notifications')).rows.length, 4)
    await pg.exec("INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,recorded_by_account_id,request_key,payload_hash) VALUES(2,'Damaging property',NOW(),'Library','Synthetic details here','First warning',1,gen_random_uuid(),'h')")
    const used = (await service.list()).find(c => c.categoryId === created.categoryId)!
    assert.equal(used.used, true)
    await assert.rejects(service.update(1, created.categoryId, { name: 'Another name' }), { code: 'VIOLATION_CATEGORY_NAME_LOCKED' })
    assert.equal((await service.update(1, created.categoryId, { name: 'Damaging property', description: 'New text here' })).description, 'New text here')
    await assert.rejects(service.update(1, 9999, { isActive: false }), { code: 'VIOLATION_CATEGORY_NOT_FOUND' })
    await assert.rejects(service.create(0, valid), { code: 'VIOLATION_CATEGORY_LOGIN' })
  } finally { await resetConductTestDb(pg) }
})

test('only the Librarian role reaches the routes and there is no delete route', async () => {
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    let calls = 0
    const service = { list: async () => { calls++; return [] }, create: async () => { calls++; return { categoryId: 1 } }, update: async () => { calls++; return { categoryId: 1 } } }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use('/violation-categories', requireLibraryPermission('library.manage'), createViolationCategoriesRouter(service as never))
    const allowed = role === 'Librarian'
    assert.equal((await request(app).get('/violation-categories')).status, allowed ? 200 : 403)
    assert.equal((await request(app).post('/violation-categories').send({})).status, allowed ? 201 : 403)
    assert.equal((await request(app).patch('/violation-categories/1').send({})).status, allowed ? 200 : 403)
    assert.equal((await request(app).delete('/violation-categories/1')).status, allowed ? 404 : 403)
    assert.equal(calls, allowed ? 3 : 0)
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
