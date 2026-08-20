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
    if (error instanceof HttpError) return res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
    return res.status(500).json({ success: false })
  })
  return app
}

test('Student and Faculty roles cannot read or mutate administrative inventory', async () => {
  for (const role of ['Student', 'Faculty']) {
    const read = await request(appForRole(role)).get('/api/inventory/summary')
    const mutation = await request(appForRole(role)).patch('/api/inventory/copies/condition').send({ barcode: 'BC-1', condition_state: 'lost' })
    assert.equal(read.status, 403)
    assert.equal(mutation.status, 403)
    assert.equal(mutation.body.code, 'CATALOG_ADMIN_FORBIDDEN')
  }
})

test('manager request with an invalid condition receives field-level 422 before database access', async () => {
  const response = await request(appForRole('Librarian')).patch('/api/inventory/copies/condition').send({ barcode: 'BC-1', condition_state: 'new' })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'INVENTORY_VALIDATION_FAILED')
  assert.ok(response.body.details.errors.condition_state)
})

test('manual availability route validates before database access', async () => {
  const response = await request(appForRole('Librarian')).patch('/api/inventory/copies/availability').send({ barcode: 'BC-1', availability_status: 'reserved' })
  assert.equal(response.status, 422)
  assert.ok(response.body.details.errors.availability_status)
})
