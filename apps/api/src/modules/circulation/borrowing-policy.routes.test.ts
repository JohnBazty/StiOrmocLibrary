import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createBorrowingPolicyRouter } from './borrowing-policy.routes.ts'

test('only the current Librarian role can read or publish borrowing policies', async () => {
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    let calls = 0
    const service = {
      list: async () => { calls++; return { versions: [] } },
      publish: async () => { calls++; return { versionId: 2 } },
    }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use('/policies', requireLibraryPermission('library.manage'), createBorrowingPolicyRouter(service as never))
    assert.equal((await request(app).get('/policies')).status, role === 'Librarian' ? 200 : 403)
    assert.equal((await request(app).post('/policies').send({})).status, role === 'Librarian' ? 201 : 403)
    assert.equal(calls, role === 'Librarian' ? 2 : 0)
  }
})
