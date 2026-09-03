import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { createCirculationController } from './circulation.controller.ts'
import { createAdminCirculationRouter, createCirculationRequestRouter } from './circulation.routes.ts'

test('Student role cannot load or mutate administrative circulation routes', async () => {
  const service = { monitor: async () => ({}), submitBorrowRequest: async () => ({}), confirmCheckout: async () => ({}), returnBook: async () => ({}), calculatePenalty: async () => ({}), adminNotifications: async () => [], history: async () => ({}) }
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { id: 7, accountId: 7, schoolId: 'STI-7', role: 'Student' }; next() })
  app.use('/api/v1/admin', requireJwtRoles('Admin', 'Librarian'), createAdminCirculationRouter(createCirculationController(service as never)))
  const response = await request(app).get('/api/v1/admin/borrowing/monitor')
  assert.equal(response.status, 403); assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('unified circulation cancellation route forwards the authenticated actor', async () => {
  let received: unknown = null
  const service = { cancelRequest: async (actor: unknown, id: unknown) => { received = { actor, id }; return { transactionId: 12, status: 'Cancelled', copyAvailability: 'Available' } } }
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role: 'Librarian' }; next() })
  app.use('/api/v1/circulation', createCirculationRequestRouter(createCirculationController(service as never)))
  const response = await request(app).put('/api/v1/circulation/requests/12/cancel').send({ reason: 'Cancelled at desk' })
  assert.equal(response.status, 200)
  assert.equal(response.body.data.copyAvailability, 'Available')
  assert.deepEqual(received, { actor: { accountId: 3, role: 'Librarian' }, id: '12' })
})
