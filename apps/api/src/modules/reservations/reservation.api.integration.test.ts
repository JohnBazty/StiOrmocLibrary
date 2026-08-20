import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createReservationController } from './reservation.controller.ts'
import { createReservationsRouter } from './reservations.routes.ts'

function application(service: Record<string, unknown>, role = 'Student') {
  const app = express(); app.use(express.json())
  app.use((req, _res, next) => { Object.defineProperty(req, 'session', { configurable: true, value: { user: { id: 7, role } } }); next() })
  app.use('/api/reservations', createReservationsRouter(createReservationController(service as never)))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
    else res.status(500).json({ success: false })
  })
  return app
}
const complete = (overrides: Record<string, unknown> = {}) => ({ create: async () => ({}), queue: async () => ({ items: [] }), adjustStatus: async () => ({}), ...overrides })

test('student cap violation is returned by the HTTP endpoint as explicit 422', async () => {
  const service = complete({ create: async () => { throw new HttpError(422, 'STUDENT_BORROW_LIMIT_REACHED', 'Transaction Blocked: Students cannot exceed 2 books') } })
  const response = await request(application(service)).post('/api/reservations').send({ materialId: 17 })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'STUDENT_BORROW_LIMIT_REACHED')
})

test('non-manager receives 403 from the administrative queue', async () => {
  const response = await request(application(complete(), 'Student')).get('/api/reservations/admin/queue')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'RESERVATION_ADMIN_FORBIDDEN')
})

