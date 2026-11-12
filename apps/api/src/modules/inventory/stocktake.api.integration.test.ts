import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { inventoryAccessGuard } from './inventory.access.ts'
import { inventoryRouter } from './inventory.routes.ts'

function appForRole(role: string) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'session', { configurable: true, value: { user: { role } } })
    next()
  })
  app.use('/api/inventory', inventoryRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
        details: error.details,
      })
    }
    return res.status(500).json({ success: false })
  })
  return app
}

test('Student and Faculty cannot access stocktake routes', async () => {
  for (const role of ['Student', 'Faculty']) {
    const list = await request(appForRole(role)).get('/api/inventory/stocktakes')
    const create = await request(appForRole(role)).post('/api/inventory/stocktakes').send({
      name: 'Unauthorized',
      scopeKind: 'collection',
      assetKind: 'book',
    })
    const scan = await request(appForRole(role)).post('/api/inventory/stocktakes/1/scans').send({
      requestKey: 'k1',
      barcode: 'BC-1',
      observedShelfId: 1,
      source: 'manual',
    })
    assert.equal(list.status, 403)
    assert.equal(create.status, 403)
    assert.equal(scan.status, 403)
    assert.equal(create.body.code, 'CATALOG_ADMIN_FORBIDDEN')
  }
})

test('Librarian create stocktake validates before database access', async () => {
  const response = await request(appForRole('Librarian')).post('/api/inventory/stocktakes').send({
    name: 'Missing scope id',
    scopeKind: 'shelf',
    assetKind: 'book',
  })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STOCKTAKE_VALIDATION_FAILED')
  assert.ok(response.body.details?.errors?.scopeId)
})

test('Librarian scan validates observed shelf before database access', async () => {
  const response = await request(appForRole('Librarian')).post('/api/inventory/stocktakes/1/scans').send({
    requestKey: 'k1',
    barcode: 'BC-1',
    source: 'manual',
  })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STOCKTAKE_VALIDATION_FAILED')
})

test('Librarian cancel requires a reason before database access', async () => {
  const response = await request(appForRole('Librarian')).post('/api/inventory/stocktakes/1/cancel').send({})
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STOCKTAKE_VALIDATION_FAILED')
})

// App-level guard + router, as mounted in app.js (guard first, then the inventory router).
function guardedApp(user?: { role: string }, jwtRole?: string) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    if (user) Object.defineProperty(req, 'session', { configurable: true, value: { user } })
    if (jwtRole) res.locals.authenticatedUser = { role: jwtRole, fullName: 'Jwt Person' }
    next()
  })
  app.use('/api/inventory', inventoryAccessGuard)
  app.use('/api/inventory', inventoryRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ success: false, code: error.code })
    return res.status(500).json({ success: false, message: String(error) })
  })
  return app
}

test('only Librarian and Staff pass the stocktake guard; Student, Faculty, Admin, System Administrator get 403', async () => {
  for (const role of ['Student', 'Faculty', 'Admin', 'System Administrator']) {
    for (const path of ['/api/inventory/stocktakes', '/api/inventory/stocktakes/scope-options']) {
      assert.equal((await request(guardedApp({ role })).get(path)).status, 403, `${role} ${path}`)
    }
  }
})

test('Staff (session and JWT) pass role guards on staff actions but not on resolve or review', async () => {
  const apps = [guardedApp({ role: 'Staff' }), guardedApp({ role: 'Library Staff' }), guardedApp(undefined, 'Staff')]
  for (const app of apps) {
    // Validation (422) proves the request got past both guards.
    const create = await request(app).post('/api/inventory/stocktakes').send({ name: 'x', scopeKind: 'shelf', assetKind: 'book' })
    assert.equal(create.status, 422)
    const cancel = await request(app).post('/api/inventory/stocktakes/1/cancel').send({})
    assert.equal(cancel.status, 422)
    const review = await request(app).post('/api/inventory/stocktakes/1/review')
    assert.equal(review.status, 403)
    const resolve = await request(app).post('/api/inventory/stocktakes/1/discrepancies/2/resolve').send({})
    assert.equal(resolve.status, 403)
  }
})

test('Staff stays blocked from every other inventory route', async () => {
  const response = await request(guardedApp({ role: 'Staff' })).get('/api/inventory/summary')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'FORBIDDEN')
})

test('JWT-only Librarian with no session user passes the guards', async () => {
  const response = await request(guardedApp(undefined, 'Librarian')).post('/api/inventory/stocktakes').send({ name: 'x', scopeKind: 'shelf', assetKind: 'book' })
  assert.equal(response.status, 422)
})
