import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createCopyConditionsRouter } from './copy-conditions.routes.ts'

test('only the Librarian maintains book conditions; the actor account reaches the service', async () => {
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    const actors: unknown[] = []
    const service = {
      list: async () => [],
      create: async (actor: unknown) => { actors.push(actor); return { conditionId: 7 } },
      update: async (actor: unknown) => { actors.push(actor); return { conditionId: 7 } },
      remove: async (actor: unknown) => { actors.push(actor); return { conditionId: 7 } },
    }
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 5, role }; next() })
    app.use('/copy-conditions', requireLibraryPermission('library.manage'), createCopyConditionsRouter(service as never))
    const allowed = role === 'Librarian'
    assert.equal((await request(app).get('/copy-conditions')).status, allowed ? 200 : 403)
    assert.equal((await request(app).post('/copy-conditions').send({ name: 'Water damage', behavesAs: 'Damaged' })).status, allowed ? 201 : 403)
    assert.equal((await request(app).patch('/copy-conditions/7').send({})).status, allowed ? 200 : 403)
    assert.equal((await request(app).delete('/copy-conditions/7')).status, allowed ? 200 : 403)
    assert.deepEqual(actors, allowed ? [5, 5, 5] : [])
  }
})
