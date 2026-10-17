import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { archivedInvoiceRouter } from './invoice-archive.routes.ts'

test('archived invoice endpoints reject reading and issuing without invoking the invoice service', async () => {
  const app = express()
  app.use('/api/v1/admin/invoices', archivedInvoiceRouter)
  app.use('/api/v1/invoices', archivedInvoiceRouter)
  for (const [method, path] of [
    ['get', '/api/v1/admin/invoices'],
    ['post', '/api/v1/admin/invoices/issue'],
    ['get', '/api/v1/invoices/1/pdf'],
  ] as const) {
    const response = await request(app)[method](path)
    assert.equal(response.status, 410)
    assert.equal(response.body.code, 'INVOICES_ARCHIVED')
    assert.equal(response.headers['cache-control'], 'no-store')
  }
})
