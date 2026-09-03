import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createResearchCatalogController } from './research-catalog.controller.ts'
import { createResearchCatalogRouter } from './research-catalog.routes.ts'

function testApp(service: Record<string, unknown>) {
  const app = express()
  app.use('/api/v1/catalog', createResearchCatalogRouter(createResearchCatalogController(service as never)))
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) response.status(error.status).json({ success: false, code: error.code, message: error.message })
    else response.status(500).json({ success: false })
  })
  return app
}

test('GET research catalog returns a view-only paginated repository contract', async () => {
  const response = await request(testApp({
    list: async () => ({
      items: [{ titleId: 4, title: 'SmartLib', viewOnly: true, accessStatus: 'Available' }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    }),
    overview: async () => ({}),
  })).get('/api/v1/catalog/research?q=smart')

  assert.equal(response.status, 200)
  assert.equal(response.body.meta.viewOnly, true)
  assert.equal(response.body.data[0].viewOnly, true)
  assert.equal(response.body.data[0].accessStatus, 'Available')
})

test('GET research overview returns complete abstract metadata without circulation actions', async () => {
  const response = await request(testApp({
    list: async () => ({}),
    overview: async () => ({
      titleId: 4, title: 'SmartLib', authors: 'A. Student', adviser: 'Dr. Adviser',
      department: 'BS Information Technology', publicationYear: 2026,
      shelfLocation: 'Thesis A-1', abstract: 'Complete abstract text.', viewOnly: true,
    }),
  })).get('/api/v1/catalog/research/4')

  assert.equal(response.status, 200)
  assert.equal(response.body.meta.viewOnly, true)
  assert.equal(response.body.data.abstract, 'Complete abstract text.')
  assert.equal(response.body.data.borrowAction, undefined)
})
