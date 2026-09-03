import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createBookCatalogController } from './book-catalog.controller.ts'
import { createBookCatalogRouter } from './book-catalog.routes.ts'

function appWith(service: Record<string, unknown>) {
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => {
    response.locals.authenticatedUser = { accountId: 9, role: 'Student' }
    next()
  })
  app.use('/api/v1/catalog', createBookCatalogRouter(createBookCatalogController(service as never)))
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) response.status(error.status).json({ success: false, code: error.code, message: error.message })
    else response.status(500).json({ success: false })
  })
  return app
}

test('GET /api/v1/catalog/books returns stock counts and viewer borrowing context', async () => {
  const response = await request(appWith({
    categories: async () => [],
    list: async () => ({
      items: [{ titleId: 2, title: 'Clean Code', totalCopiesCount: 5, availableCopiesCount: 3 }],
      pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      viewer: { role: 'Student', activeBookCount: 1, bookLimit: 2 },
    }),
    overview: async () => ({}), reserve: async () => ({}),
  })).get('/api/v1/catalog/books')

  assert.equal(response.status, 200)
  assert.equal(response.body.data[0].availableCopiesCount, 3)
  assert.equal(response.body.meta.viewer.activeBookCount, 1)
})

test('GET /api/v1/catalog/books/:titleId returns a complete overview contract', async () => {
  const response = await request(appWith({
    categories: async () => [], list: async () => ({}), reserve: async () => ({}),
    overview: async () => ({
      titleId: 2, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884',
      categoryName: 'Programming', publicationYear: 2008, publisher: 'Prentice Hall',
      shelfLocation: 'Shelf A-1', currentAvailabilityStatus: 'Available',
    }),
  })).get('/api/v1/catalog/books/2')

  assert.equal(response.status, 200)
  assert.equal(response.body.data.isbn, '9780132350884')
  assert.equal(response.body.data.shelfLocation, 'Shelf A-1')
})

test('GET /api/v1/catalog/categories returns exact Admin-managed category IDs and names', async () => {
  const response = await request(appWith({
    categories: async () => [
      { categoryId: 7, categoryName: 'Artificial Intelligence' },
      { categoryId: 11, categoryName: 'Cybersecurity' },
    ],
    list: async () => ({}), overview: async () => ({}), reserve: async () => ({}),
  })).get('/api/v1/catalog/categories')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body.data, [
    { categoryId: 7, categoryName: 'Artificial Intelligence' },
    { categoryId: 11, categoryName: 'Cybersecurity' },
  ])
})
