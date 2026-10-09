import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { dashboardController } from './dashboard.controller.ts'

function appFor(role: string) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    res.locals.authenticatedUser = { accountId: 9, id: 9, role }
    next()
  })
  app.get('/admin', dashboardController.admin)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message })
    }
    return res.status(500).json({ success: false, message: 'unexpected' })
  })
  return app
}

test('Student cannot load the admin dashboard controller', async () => {
  const response = await request(appFor('Student')).get('/admin')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'DASHBOARD_STAFF_ONLY')
})

test('Faculty cannot load the admin dashboard controller', async () => {
  const response = await request(appFor('Faculty')).get('/admin')
  assert.equal(response.status, 403)
})
