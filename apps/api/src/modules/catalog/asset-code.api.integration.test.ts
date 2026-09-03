import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import type { Pool } from 'mysql2/promise'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { createAssetCodeController } from './asset-code.controller.ts'
import { createAssetCodeService } from './asset-code.service.ts'
import { createBookCatalogRouter } from './book-catalog.routes.ts'
import { createBulkBookRouter } from './bulk-book.routes.ts'
import { createResearchAssetRouter } from './research-asset.routes.ts'

const row = {
  physical_copy_id: 21, title_id: 8, title: 'Clean Code', author: 'Robert C. Martin',
  accession_number: 'STI-ACC-2026-000142', barcode: 'STIORMOC2026000142',
  shelf_location: 'Shelf A-1', condition_status: 'Damaged', qr_code_data: null,
}

const researchRow = {
  research_inventory_id: 31, title_id: 18, title: 'Smart Library Study', author: 'STI Researchers',
  accession_number: 'STI-RES-2026-000031', barcode: 'STIORMOCR2026000031',
  shelf_location: 'Research A', condition_status: 'good', qr_code_data: null,
}

function fakeDatabase() {
  return { execute: async (sql: string) => {
    if (sql.includes('ri.research_inventory_id = ?')) return [[researchRow]]
    if (sql.includes('pc.physical_copy_id = ?')) return [[row]]
    if (sql.includes('pc.barcode = ?')) return [[row]]
    throw new Error(`Unexpected SQL: ${sql}`)
  } } as unknown as Pool
}

test('Admin can inspect and download research inventory codes', async () => {
  const app = express()
  const assets = createAssetCodeController(createAssetCodeService(fakeDatabase()))
  app.use('/api/v1/admin/research', authenticated('Admin'), requireJwtRoles('Admin', 'Librarian'), createResearchAssetRouter(assets))
  const response = await request(app).get('/api/v1/admin/research/assets/31')
  assert.equal(response.status, 200)
  assert.equal(response.body.data.researchInventoryId, 31)
  assert.equal(response.body.data.barcode, 'STIORMOCR2026000031')
  assert.match(response.body.data.qrCodeData, /^data:image\/png;base64,/)

  const png = await request(app).get('/api/v1/admin/research/assets/31/qr.png')
  assert.equal(png.status, 200)
  assert.match(png.headers['content-type'], /^image\/png/)
  assert.match(png.headers['content-disposition'], /STI-RES-2026-000031-qr\.png/)
})

function authenticated(role: string) {
  return (_request: express.Request, response: express.Response, next: express.NextFunction) => {
    response.locals.authenticatedUser = { accountId: 1, role }
    next()
  }
}

test('Admin barcode download returns a generated PNG attachment', async () => {
  const app = express()
  const assets = createAssetCodeController(createAssetCodeService(fakeDatabase()))
  const bulk = { addBulk: (_request: express.Request, response: express.Response) => response.status(501).end() }
  app.use('/api/v1/admin/books', authenticated('Admin'), requireJwtRoles('Admin', 'Librarian'), createBulkBookRouter(bulk as never, assets))
  const response = await request(app).get('/api/v1/admin/books/assets/21/barcode.png')
  assert.equal(response.status, 200)
  assert.match(response.headers['content-type'], /^image\/png/)
  assert.match(response.headers['content-disposition'], /STI-ACC-2026-000142-barcode\.png/)
  assert.deepEqual([...response.body.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const qrResponse = await request(app).get('/api/v1/admin/books/assets/21/qr.png')
  assert.equal(qrResponse.status, 200)
  assert.match(qrResponse.headers['content-type'], /^image\/png/)
  assert.deepEqual([...qrResponse.body.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
})

test('Student cannot inspect or download administrative QR assets', async () => {
  const app = express()
  const assets = createAssetCodeController(createAssetCodeService(fakeDatabase()))
  const bulk = { addBulk: (_request: express.Request, response: express.Response) => response.status(501).end() }
  app.use('/api/v1/admin/books', authenticated('Student'), requireJwtRoles('Admin', 'Librarian'), createBulkBookRouter(bulk as never, assets))
  const response = await request(app).get('/api/v1/admin/books/assets/21/qr.png')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('catalog copy payload exposes the barcode image and omits every QR field', async () => {
  const app = express()
  const assets = createAssetCodeController(createAssetCodeService(fakeDatabase()))
  const books = {
    categories: (_request: express.Request, response: express.Response) => response.json({}),
    list: (_request: express.Request, response: express.Response) => response.json({}),
    reserve: (_request: express.Request, response: express.Response) => response.json({}),
    overview: (_request: express.Request, response: express.Response) => response.json({}),
  }
  app.use('/api/v1/catalog', authenticated('Student'), createBookCatalogRouter(books as never, assets))
  const response = await request(app).get('/api/v1/catalog/copies/STIORMOC2026000142')
  assert.equal(response.status, 200)
  assert.match(response.body.data.barcodeImageData, /^data:image\/svg\+xml;base64,/)
  assert.equal(response.body.data.conditionStatus, 'Damaged')
  assert.equal(Object.hasOwn(response.body.data, 'qrCodeData'), false)
  assert.equal(Object.hasOwn(response.body.data, 'qr_code_data'), false)
})
