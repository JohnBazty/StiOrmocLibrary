import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createCategoryRouter } from './category.routes.ts'

test('only the Librarian reads shelf suggestions and saves a shelf DDC range', async () => {
  for (const role of ['Librarian', 'Staff', 'Student']) {
    const calls: unknown[] = []
    const suggestions = {
      suggestions: async (id: unknown) => { calls.push(['suggestions', id]); return { shelf: {}, suggestions: [], onShelf: [] } },
      saveDdcRange: async (id: unknown, body: unknown) => { calls.push(['range', id, body]); return {} },
    }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use('/categories', createCategoryRouter(undefined, suggestions as never))
    const allowed = role === 'Librarian'
    assert.equal((await request(app).get('/categories/shelves/4/suggestions')).status, allowed ? 200 : 403)
    assert.equal((await request(app).put('/categories/shelves/4/ddc-range').send({ ddcFrom: '004', ddcTo: '005.999' })).status, allowed ? 200 : 403)
    assert.deepEqual(calls, allowed ? [['suggestions', '4'], ['range', '4', { ddcFrom: '004', ddcTo: '005.999' }]] : [])
  }
})
