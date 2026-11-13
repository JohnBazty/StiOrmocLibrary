import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createBulkBookRouter, LOOKUPS_PER_MINUTE } from './bulk-book.routes.ts'

function appFor(accountId: number, router: express.Router) {
  const app = express()
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId, role: 'Librarian' }; next() })
  app.use('/books', router)
  return app
}

test('ISBN and title lookups share one per-account limit per minute', async () => {
  const queries: unknown[] = []
  const ok = async (req: express.Request, res: express.Response) => { queries.push(req.query.title ?? req.params.isbn); res.json({ success: true }) }
  const router = createBulkBookRouter({ addBulk: ok } as never, { adminAsset: ok, barcodePng: ok, qrPng: ok } as never, { lookup: ok, cover: ok, searchTitles: ok, searchSubjects: ok })
  const first = appFor(1, router), second = appFor(2, router)

  assert.equal((await request(first).get('/books/title-lookup?title=Clean%20Code&author=Martin')).status, 200)
  assert.equal(queries.at(-1), 'Clean Code')
  for (let index = 1; index < LOOKUPS_PER_MINUTE; index += 1) await request(first).get('/books/isbn/9780132350884')
  const limited = await request(first).get('/books/title-lookup?title=Clean')
  assert.equal(limited.status, 429)
  assert.equal(limited.body.code, 'LOOKUP_RATE_LIMITED')
  assert.equal((await request(second).get('/books/title-lookup?title=Clean')).status, 200, 'another account keeps its own budget')
})

test('cover requests have their own per-account budget', async () => {
  const ok = async (_req: express.Request, res: express.Response) => { res.json({ success: true }) }
  const router = createBulkBookRouter({ addBulk: ok } as never, { adminAsset: ok, barcodePng: ok, qrPng: ok } as never, { lookup: ok, cover: ok, searchTitles: ok, searchSubjects: ok })
  const app = appFor(3, router)
  for (let index = 0; index < LOOKUPS_PER_MINUTE; index += 1) await request(app).get('/books/isbn/9780132350884/cover')
  assert.equal((await request(app).get('/books/isbn/9780132350884/cover')).status, 429)
  assert.equal((await request(app).get('/books/isbn/9780132350884')).status, 200, 'lookups are not used up by covers')
})
