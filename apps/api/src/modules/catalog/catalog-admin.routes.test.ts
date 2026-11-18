import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createCatalogAdminRouter } from './catalog-admin.routes.ts'

function appFor(role: 'Admin' | 'Librarian') {
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 5, role }; next() })
  app.use('/catalog', createCatalogAdminRouter({
    changeTitleCategory: async (req, res) => { res.json({ success: true, data: { titleId: Number(req.params.titleId) } }) },
  }))
  return app
}

test('only Librarian can change a catalog title category', async () => {
  const librarian = await request(appFor('Librarian')).patch('/catalog/titles/14/category').send({ targetCategoryId: 8, expectedRowVersion: 3 })
  assert.equal(librarian.status, 200)
  assert.equal(librarian.body.data.titleId, 14)

  const admin = await request(appFor('Admin')).patch('/catalog/titles/14/category').send({ targetCategoryId: 8, expectedRowVersion: 3 })
  assert.equal(admin.status, 403)
  assert.equal(admin.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('only Librarian reads the book register, and bad filters are refused before SQL', async () => {
  const calls: string[] = []
  const database = { execute: async (sql: string) => { calls.push(sql); return [[{ physical_copy_id: 1, title_id: 2, accession_number: 'A-1', received_on: null, classification: null, authors: 'X', title: 'T', edition: null, volumes: null, page_count: null, fund_source: null, fund_detail: null, cost_php: null, publisher: null, publication_year: null, remarks: null, availability_status: 'Available', total_rows: 1 }]] } }
  const appWith = (role: 'Admin' | 'Librarian') => {
    const app = express()
    app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 5, role }; next() })
    app.use('/catalog', createCatalogAdminRouter({ changeTitleCategory: async () => undefined }, database as never))
    app.use((error: { status?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => { response.status(error.status ?? 500).json({ success: false }) })
    return app
  }
  const page = await request(appWith('Librarian')).get('/catalog/register?sort=cost&dir=desc')
  assert.equal(page.status, 200)
  assert.equal(page.body.data.total, 1)
  const csv = await request(appWith('Librarian')).get('/catalog/register.csv')
  assert.equal(csv.status, 200)
  assert.match(String(csv.headers['content-type']), /text\/csv/)
  assert.equal((await request(appWith('Admin')).get('/catalog/register')).status, 403)
  const before = calls.length
  assert.equal((await request(appWith('Librarian')).get('/catalog/register?sort=x')).status, 400)
  assert.equal(calls.length, before)
})
