import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { catalogRouter } from './catalog.routes.ts'

function testApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'session', {
      configurable: true,
      value: { user: { role: req.get('x-test-role') ?? 'Student' } },
    })
    next()
  })
  app.use('/api/catalog', catalogRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
    else res.status(500).json({ success: false })
  })
  return app
}

test('catalog management endpoint returns 403 for a Student role', async () => {
  const response = await request(testApp()).post('/api/catalog/books').set('x-test-role', 'Student').send({})
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'CATALOG_ADMIN_FORBIDDEN')
})

test('book endpoint returns 422 field validation for an Admin request with missing mandatory fields', async () => {
  const response = await request(testApp()).post('/api/catalog/books').set('x-test-role', 'System Administrator').send({ title: '' })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'CATALOG_VALIDATION_FAILED')
  assert.ok(response.body.details.errors.title)
  assert.ok(response.body.details.errors.author)
  assert.ok(response.body.details.errors.barcode)
})

test('thesis endpoint returns 422 field validation for a Librarian request with missing metadata', async () => {
  const response = await request(testApp()).post('/api/catalog/research').set('x-test-role', 'Librarian').send({})
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'CATALOG_VALIDATION_FAILED')
  assert.ok(response.body.details.errors.adviser)
  assert.ok(response.body.details.errors.abstract)
})
