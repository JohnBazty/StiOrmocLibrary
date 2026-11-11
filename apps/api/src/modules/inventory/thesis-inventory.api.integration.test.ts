import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { thesisInventoryRouter } from './thesis-inventory.routes.ts'

function appForRole(role: string) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    Object.defineProperty(req, 'session', { configurable: true, value: { user: { role } } })
    res.locals.authenticatedUser = { role }
    next()
  })
  app.use('/api/inventory/thesis', thesisInventoryRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
    return res.status(500).json({ success: false })
  })
  return app
}

test('Student and Faculty roles cannot access thesis inventory administration', async () => {
  for (const role of ['Student', 'Faculty']) {
    const response = await request(appForRole(role)).get('/api/inventory/thesis/summary')
    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'CATALOG_ADMIN_FORBIDDEN')
  }
})

test('manager receives field-level 422 before database access for invalid audit condition', async () => {
  const response = await request(appForRole('Librarian')).post('/api/inventory/thesis/audit').send({ barcode: 'TH-1', condition_state: 'missing' })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'THESIS_INVENTORY_VALIDATION_FAILED')
  assert.ok(response.body.details.errors.condition_state)
})
