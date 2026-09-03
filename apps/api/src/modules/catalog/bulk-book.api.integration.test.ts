import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { createBulkBookController } from './bulk-book.controller.ts'
import { createBulkBookRouter, createBulkCatalogEntryRouter } from './bulk-book.routes.ts'
import { createIsbnLookupController } from './isbn-lookup.controller.ts'

function appFor(role: string) {
  const app = express(); app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 1, role }; next() })
  const service = { addBulk: async () => ({ titleId: 8, createdTitle: true, numberOfCopies: 2, copies: [{ barcode: 'STIORMOC2026000142' }, { barcode: 'STIORMOC2026000143' }] }) }
  const controller = createBulkBookController(service as never)
  const isbn = createIsbnLookupController({ lookup: async (value: unknown) => ({ isbn: String(value), title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, source: 'local_catalog' }) } as never)
  app.use('/api/v1/admin/books', requireJwtRoles('Admin', 'Librarian'), createBulkBookRouter(controller, undefined, isbn))
  app.use('/api/v1/admin/catalog', requireJwtRoles('Admin', 'Librarian'), createBulkCatalogEntryRouter(controller))
  return app
}

test('Admin bulk endpoint returns the generated copy array with 201 Created', async () => {
  const response = await request(appFor('Admin')).post('/api/v1/admin/books/add-bulk').send({ number_of_copies: 2 })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.copies.length, 2)
})

test('documented Admin catalog bulk-entry alias returns 201', async () => {
  const response = await request(appFor('Admin')).post('/api/v1/admin/catalog/bulk-entry').send({ number_of_copies: 2 })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.numberOfCopies, 2)
})

test('Student is forbidden from generating inventory labels', async () => {
  const response = await request(appFor('Student')).post('/api/v1/admin/books/add-bulk').send({ number_of_copies: 2 })
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('Admin can resolve ISBN metadata while Student is forbidden', async () => {
  const admin = await request(appFor('Admin')).get('/api/v1/admin/books/isbn/9780132350884')
  assert.equal(admin.status, 200)
  assert.equal(admin.body.data.title, 'Clean Code')
  const student = await request(appFor('Student')).get('/api/v1/admin/books/isbn/9780132350884')
  assert.equal(student.status, 403)
  assert.equal(student.body.code, 'JWT_ROLE_FORBIDDEN')
})
