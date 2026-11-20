import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { hasLibraryPermission } from './library-permissions.ts'
import { createPaymentsRouters } from '../modules/payments/payments.routes.ts'

test('Staff cannot manage announcements', () => {
  assert.equal(hasLibraryPermission('Staff', 'announcements.manage'), false)
  assert.equal(hasLibraryPermission('Librarian', 'announcements.manage'), true)
  assert.equal(hasLibraryPermission('Staff', 'desk.operate'), true)
})

test('Staff payments admin listing is restricted to Printing kind only', async () => {
  const seenQueries: Array<Record<string, unknown>> = []
  const fakeService = {
    list: async (_identity: unknown, query: Record<string, unknown>) => { seenQueries.push(query); return { items: [], total: 0 } },
  }
  const { admin } = createPaymentsRouters(fakeService as never, {} as never, {} as never)
  const app = express()
  app.use((req, res, next) => {
    res.locals.authenticatedUser = { accountId: 9, role: 'Staff' }
    next()
  })
  app.use('/admin/payments', admin)

  const forbidden = await request(app).get('/admin/payments?kind=Fine')
  assert.equal(forbidden.status, 403)

  const ok = await request(app).get('/admin/payments')
  assert.equal(ok.status, 200)
  assert.equal(seenQueries[0]?.kind, 'Printing')
})
