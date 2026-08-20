import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createCsvStream, createInventoryPdf, type InventoryExportRow } from './catalog-export.service.ts'
import { createReportsRouter } from './reports.routes.ts'

const row: InventoryExportRow = {
  recordType: 'Book', title: 'Database Systems', authors: 'SmartLib QA', isbn: '9780132350884',
  category: 'Programming', publicationYear: '2026', accessionNumber: 'ACC-001', barcode: 'BC-001',
  shelfLocation: 'Shelf A-1', condition: 'Good', availability: 'Available', researchCode: '', adviser: '',
}

function appFor(role: string) {
  const app = express()
  app.use((_request, response, next) => { response.locals.authenticatedUser = { role }; next() })
  app.use('/api/reports', createReportsRouter({
    rows: async function* () { yield row }, csv: createCsvStream, pdf: createInventoryPdf,
  }))
  return app
}

test('authorized Admin streams a CSV attachment with inventory rows', async () => {
  const response = await request(appFor('Admin')).get('/api/reports/catalog/inventory.csv')
  assert.equal(response.status, 200)
  assert.match(response.headers['content-type'], /text\/csv/)
  assert.match(response.headers['content-disposition'], /sti-library-inventory\.csv/)
  assert.match(response.text, /Database Systems/)
})

test('authorized Librarian streams a valid PDF attachment', async () => {
  const response = await request(appFor('Librarian')).get('/api/reports/catalog/inventory.pdf').buffer(true)
  assert.equal(response.status, 200)
  assert.match(response.headers['content-type'], /application\/pdf/)
  assert.match(response.headers['content-disposition'], /sti-library-inventory\.pdf/)
  assert.equal(Buffer.from(response.body).subarray(0, 5).toString('ascii'), '%PDF-')
})

test('Student cannot download administrative inventory reports', async () => {
  const response = await request(appFor('Student')).get('/api/reports/catalog/inventory.csv')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'CATALOG_ADMIN_FORBIDDEN')
})
