import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createCsvStream, createInventoryPdf, type InventoryExportRow } from './catalog-export.service.ts'
import { createReportsRouter, resolveReportAccount } from './reports.routes.ts'

test('report sessions resolve their linked account instead of treating a user ID as an account ID', async () => {
  const database = { execute: async (_sql: string, values: unknown[]) => { assert.deepEqual(values,[42]); return [[{account_id:77}]] } } as never
  assert.equal(await resolveReportAccount({id:42},true,database),77)
  assert.equal(await resolveReportAccount({accountId:77,id:42},false,database),77)
  await assert.rejects(resolveReportAccount({id:42},false,database))
  await assert.rejects(resolveReportAccount({id:42},true,{execute:async()=>[[]]} as never))
})

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

test('authorized Librarian streams a CSV attachment with inventory rows', async () => {
  const response = await request(appFor('Librarian')).get('/api/reports/catalog/inventory.csv')
  assert.equal(response.status, 200)
  assert.match(response.headers['content-type'], /text\/csv/)
  assert.match(response.headers['content-disposition'], /sti-library-inventory\.csv/)
  assert.equal(response.headers['x-smartlib-csv-integrity'], 'HMAC-SHA256; version=v1')
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
