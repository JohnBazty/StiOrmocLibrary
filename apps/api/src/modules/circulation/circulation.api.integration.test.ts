import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { createCirculationController } from './circulation.controller.ts'
import { createAdminCirculationRouter, createCirculationRequestRouter } from './circulation.routes.ts'

function withHttpErrorHandler(app: express.Express) {
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
      return
    }
    response.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Unexpected error.' })
  })
}

test('Student role cannot load or mutate administrative circulation routes', async () => {
  const service = { monitor: async () => ({}), submitBorrowRequest: async () => ({}), preflightCheckout: async () => ({}), confirmCheckout: async () => ({}), returnBook: async () => ({}), calculatePenalty: async () => ({}), adminNotifications: async () => [], history: async () => ({}) }
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { id: 7, accountId: 7, schoolId: 'STI-7', role: 'Student' }; next() })
  app.use('/api/v1/admin', requireJwtRoles('Admin'), createAdminCirculationRouter(createCirculationController(service as never)))
  const response = await request(app).get('/api/v1/admin/borrowing/monitor')
  assert.equal(response.status, 403); assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
  const preflight = await request(app).post('/api/v1/admin/borrowing/preflight').send({ barcode: 'BOOK-1', school_id: 'STI-7', flow: 'walk_in' })
  assert.equal(preflight.status, 403); assert.equal(preflight.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('Admin can run preflight and blocked decisions return success with structured data', async () => {
  const service = {
    preflightCheckout: async () => ({
      decision: 'blocked',
      expiresAt: null,
      borrower: { userId: 7, schoolId: 'STI-7', name: 'Student', role: 'Student' },
      copy: { physicalCopyId: 1, barcode: 'BOOK-1', accessionNumber: 'ACC-1', title: 'Networks', condition: 'Good', availability: 'Available' },
      dueAt: new Date('2026-10-10T08:59:00.000Z'),
      blockers: [{ code: 'STUDENT_LIMIT', message: 'Transaction Blocked: Students cannot exceed 2 books' }],
      warnings: [],
      alerts: [],
      preflightToken: null,
    }),
  }
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role: 'Admin' }; next() })
  app.use('/api/v1/admin', requireJwtRoles('Admin'), createAdminCirculationRouter(createCirculationController(service as never)))
  const response = await request(app).post('/api/v1/admin/borrowing/preflight').send({ barcode: 'BOOK-1', school_id: 'STI-7', flow: 'claim' })
  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.data.decision, 'blocked')
  assert.equal(response.body.data.blockers[0].code, 'STUDENT_LIMIT')
})

test('warning checkout without confirmation returns CIRCULATION_CONFIRMATION_REQUIRED', async () => {
  const service = {
    confirmCheckout: async () => {
      throw new HttpError(422, 'CIRCULATION_CONFIRMATION_REQUIRED', 'This checkout requires staff confirmation before it can continue.')
    },
  }
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role: 'Admin' }; next() })
  app.use('/api/v1/admin', requireJwtRoles('Admin'), createAdminCirculationRouter(createCirculationController(service as never)))
  withHttpErrorHandler(app)
  const response = await request(app).post('/api/v1/admin/borrowing/confirm-checkout').send({ barcode: 'BOOK-1', school_id: 'STI-7' })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'CIRCULATION_CONFIRMATION_REQUIRED')
})

test('unified circulation cancellation route forwards the authenticated actor', async () => {
  let received: unknown = null
  const service = { cancelRequest: async (actor: unknown, id: unknown) => { received = { actor, id }; return { transactionId: 12, status: 'Cancelled', copyAvailability: 'Available' } } }
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role: 'Admin' }; next() })
  app.use('/api/v1/circulation', createCirculationRequestRouter(createCirculationController(service as never)))
  const response = await request(app).put('/api/v1/circulation/requests/12/cancel').send({ reason: 'Cancelled at desk' })
  assert.equal(response.status, 200)
  assert.equal(response.body.data.copyAvailability, 'Available')
  assert.deepEqual(received, { actor: { accountId: 3, role: 'Admin' }, id: '12' })
})
