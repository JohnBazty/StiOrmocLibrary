import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createResearchImportRouter } from './research-import.routes.ts'

const calls: Array<{ name: string; args: unknown[] }> = []
const service = {
  preview: async (...args: unknown[]) => { calls.push({ name: 'preview', args }); return { rows: [], unknownPrograms: [], total: 0, errorCount: 0 } },
  save: async (...args: unknown[]) => { calls.push({ name: 'save', args }); return { titles: 1, copies: 2 } },
}

function appFor(role: 'Admin' | 'Librarian' | 'Student') {
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 5, role }; next() })
  app.use('/research', createResearchImportRouter(service as never))
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(error instanceof HttpError ? error.status : 500).json({ success: false, code: (error as { code?: string }).code })
  })
  return app
}

test('only the Librarian can preview or import research', async () => {
  for (const role of ['Admin', 'Student'] as const) {
    assert.equal((await request(appFor(role)).post('/research/imports/preview').field('shelf', 'A').attach('file', Buffer.from('x'), 'a.csv')).status, 403)
    assert.equal((await request(appFor(role)).post('/research/imports').send({ rows: [] })).status, 403)
  }
  assert.equal(calls.length, 0)
})

test('an oversized or misnamed upload gets a clear 413 or 422, not a 500', async () => {
  const big = await request(appFor('Librarian')).post('/research/imports/preview').attach('file', Buffer.alloc(4194305), 'big.csv')
  assert.equal(big.status, 413)
  assert.equal(big.body.code, 'RESEARCH_IMPORT_FILE_TOO_LARGE')
  const wrong = await request(appFor('Librarian')).post('/research/imports/preview').attach('other', Buffer.from('x'), 'a.csv')
  assert.equal(wrong.status, 422)
})

test('preview takes the uploaded file and shelf; import takes JSON rows', async () => {
  const preview = await request(appFor('Librarian')).post('/research/imports/preview').field('shelf', 'Thesis A-1').attach('file', Buffer.from('a,b'), 'hm.csv')
  assert.equal(preview.status, 200)
  assert.equal(preview.body.data.total, 0)
  assert.equal((calls[0].args[0] as { originalname: string }).originalname, 'hm.csv')
  assert.equal(calls[0].args[1], 'Thesis A-1')
  const saved = await request(appFor('Librarian')).post('/research/imports').send({ shelf: 'Thesis A-1', rows: [{ title: 'T' }] })
  assert.equal(saved.status, 200)
  assert.equal(saved.body.data.copies, 2)
  assert.deepEqual(calls[1].args[0], { shelf: 'Thesis A-1', rows: [{ title: 'T' }] })
})
