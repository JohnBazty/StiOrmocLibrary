import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { createCirculationController } from './circulation.controller.ts'
import { createBorrowCartRouter } from './circulation.routes.ts'

function testApp(role: string, service: { submitBorrowRequest: (accountId: unknown, body: unknown) => Promise<unknown> }) {
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { id: 7, accountId: 7, schoolId: 'STI-7', role }; next() })
  const fullService = {
    history: async () => ({}), monitor: async () => ({}), confirmCheckout: async () => ({}), returnBook: async () => ({}),
    calculatePenalty: async () => ({}), adminNotifications: async () => [], ...service,
  }
  app.use('/api/v1/borrow', requireJwtRoles('Student', 'Faculty'), createBorrowCartRouter(createCirculationController(fullService as never)))
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) return response.status(error.status).json({ success: false, code: error.code, message: error.message })
    return response.status(500).json({ success: false })
  })
  return app
}

test('Faculty cart endpoint returns 201 and forwards validated title IDs', async () => {
  let received: unknown
  const app = testApp('Faculty', { submitBorrowRequest: async (_accountId, body) => { received = body; return { status: 'pending_claim' } } })
  const response = await request(app).post('/api/v1/borrow/submit-request').send({ title_ids: [10, 11] })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.status, 'pending_claim')
  assert.deepEqual(received, { titleIds: [10, 11] })
})

test('malformed and unauthorized cart requests are rejected before service execution', async () => {
  let calls = 0
  const service = { submitBorrowRequest: async () => { calls += 1; return {} } }
  const invalid = await request(testApp('Student', service)).post('/api/v1/borrow/submit-request').send({ title_ids: [] })
  assert.equal(invalid.status, 422); assert.equal(invalid.body.code, 'BORROW_CART_VALIDATION_FAILED')
  const forbidden = await request(testApp('Admin', service)).post('/api/v1/borrow/submit-request').send({ title_ids: [10] })
  assert.equal(forbidden.status, 403); assert.equal(forbidden.body.code, 'JWT_ROLE_FORBIDDEN')
  assert.equal(calls, 0)
})
