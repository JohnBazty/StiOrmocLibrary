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
  app.use('/api/v1/admin', requireJwtRoles('Librarian', 'Staff'), createAdminCirculationRouter(createCirculationController(service as never)))
  const response = await request(app).get('/api/v1/admin/borrowing/monitor')
  assert.equal(response.status, 403); assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
  const preflight = await request(app).post('/api/v1/admin/borrowing/preflight').send({ barcode: 'BOOK-1', school_id: 'STI-7', flow: 'walk_in' })
  assert.equal(preflight.status, 403); assert.equal(preflight.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('Librarian can run preflight and blocked decisions return success with structured data', async () => {
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
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role: 'Librarian' }; next() })
  app.use('/api/v1/admin', requireJwtRoles('Librarian', 'Staff'), createAdminCirculationRouter(createCirculationController(service as never)))
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
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role: 'Librarian' }; next() })
  app.use('/api/v1/admin', requireJwtRoles('Librarian', 'Staff'), createAdminCirculationRouter(createCirculationController(service as never)))
  withHttpErrorHandler(app)
  const response = await request(app).post('/api/v1/admin/borrowing/confirm-checkout').send({ barcode: 'BOOK-1', school_id: 'STI-7' })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'CIRCULATION_CONFIRMATION_REQUIRED')
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

test('damage case routes reach the case service for desk staff and are refused for students', async () => {
  const calls: string[] = []
  const caseService = {
    listCases: async () => { calls.push('list'); return { items: [] } },
    getCaseDetail: async (id: string) => { calls.push(`detail:${id}`); return {} },
    addNote: async (_a: unknown, id: string) => { calls.push(`note:${id}`); return {} },
    recordDisposition: async (accountId: unknown, id: string, body: { disposition: string }) => { calls.push(`disposition:${accountId}:${id}:${body.disposition}`); return {} },
    closeCase: async (_a: unknown, id: string, _b: unknown, status: string) => { calls.push(`${status}:${id}`); return {} },
    reopenCase: async (_a: unknown, id: string) => { calls.push(`reopen:${id}`); return {} },
  }
  const service = {}
  function appFor(role: string) {
    const app = express(); app.use(express.json())
    app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 3, role }; next() })
    app.use('/api/v1/admin', requireJwtRoles('Librarian', 'Staff'), createAdminCirculationRouter(createCirculationController(service as never, caseService as never)))
    withHttpErrorHandler(app)
    return app
  }
  const staff = appFor('Staff')
  assert.equal((await request(staff).get('/api/v1/admin/circulation/cases')).status, 200)
  assert.equal((await request(staff).get('/api/v1/admin/circulation/cases/4')).status, 200)
  assert.equal((await request(staff).post('/api/v1/admin/circulation/cases/4/notes').send({ notes: 'n' })).status, 200)
  assert.equal((await request(staff).post('/api/v1/admin/circulation/cases/4/dispositions').send({ disposition: 'lost' })).status, 200)
  assert.equal((await request(staff).post('/api/v1/admin/circulation/cases/4/resolve').send({ reason: 'r' })).status, 200)
  assert.equal((await request(staff).post('/api/v1/admin/circulation/cases/4/dismiss').send({ reason: 'r' })).status, 200)
  assert.equal((await request(staff).post('/api/v1/admin/circulation/cases/4/reopen').send({ reason: 'r' })).status, 200)
  assert.deepEqual(calls, ['list', 'detail:4', 'note:4', 'disposition:3:4:lost', 'Resolved:4', 'Dismissed:4', 'reopen:4'])
  const student = await request(appFor('Student')).post('/api/v1/admin/circulation/cases/4/dispositions').send({ disposition: 'lost' })
  assert.equal(student.status, 403)
  assert.equal(calls.length, 7)
})
