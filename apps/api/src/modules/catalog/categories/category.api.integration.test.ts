import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../../core/http-error.ts'
import { createCategoryController } from './category.controller.ts'
import { createCategoryRouter } from './category.routes.ts'

function appWithService(service: Record<string, unknown>) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'session', { configurable: true, value: { user: { role: req.get('x-test-role') ?? 'Student' } } })
    next()
  })
  app.use('/api/categories', createCategoryRouter(createCategoryController(service as never)))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details })
    else res.status(500).json({ success: false })
  })
  return app
}

function completeService(overrides: Record<string, unknown> = {}) {
  return {
    list: async () => [], create: async () => ({}), update: async () => ({}),
    remove: async () => ({}), reassign: async () => ({}), ...overrides,
  }
}

test('authorized Admin can create a category and Librarian can update its shelf allocation', async () => {
  const calls: unknown[] = []
  const app = appWithService(completeService({
    create: async (body: unknown) => { calls.push(body); return { categoryId: 11, ...(body as object) } },
    update: async (id: unknown, body: unknown) => { calls.push({ id, body }); return { categoryId: Number(id), ...(body as object) } },
  }))
  const created = await request(app).post('/api/categories').set('x-test-role', 'System Administrator').send({ categoryName: 'Networking', shelfLocation: 'Shelf C-1' })
  const updated = await request(app).put('/api/categories/11').set('x-test-role', 'Librarian').send({ categoryName: 'Networking', shelfLocation: 'Aisle 3' })
  assert.equal(created.status, 201)
  assert.equal(updated.status, 200)
  assert.equal(updated.body.data.shelfLocation, 'Aisle 3')
  assert.equal(calls.length, 2)
})

test('duplicate error reaches HTTP clients as a clean 422 payload', async () => {
  const duplicate = new HttpError(422, 'CATEGORY_NAME_ALREADY_EXISTS', 'A category with this name already exists.', { errors: { categoryName: 'Already registered.' } })
  const app = appWithService(completeService({ create: async () => { throw duplicate } }))
  const response = await request(app).post('/api/categories').set('x-test-role', 'Admin').send({ categoryName: 'Programming', shelfLocation: 'Shelf A-1' })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, 'CATEGORY_NAME_ALREADY_EXISTS')
})

test('Student receives an explicit 403 from mutable category endpoints', async () => {
  const response = await request(appWithService(completeService())).delete('/api/categories/4').set('x-test-role', 'Student')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'CATEGORY_ADMIN_FORBIDDEN')
})

