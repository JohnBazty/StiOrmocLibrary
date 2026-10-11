import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
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

test('Admin create stocktake validates before database access', async () => {
  const response = await request(appForRole('Admin')).post('/api/inventory/stocktakes').send({
    name: 'Missing scope id',
    scopeKind: 'shelf',
    assetKind: 'book',
  })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STOCKTAKE_VALIDATION_FAILED')
  assert.ok(response.body.details?.errors?.scopeId)
})

test('Admin scan validates observed shelf before database access', async () => {
  const response = await request(appForRole('Admin')).post('/api/inventory/stocktakes/1/scans').send({
    requestKey: 'k1',
    barcode: 'BC-1',
    source: 'manual',
  })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STOCKTAKE_VALIDATION_FAILED')
})

test('Admin cancel requires a reason before database access', async () => {
  const response = await request(appForRole('Admin')).post('/api/inventory/stocktakes/1/cancel').send({})
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STOCKTAKE_VALIDATION_FAILED')
})
