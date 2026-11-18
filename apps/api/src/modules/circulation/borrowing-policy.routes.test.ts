import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createBorrowingPolicyRouter } from './borrowing-policy.routes.ts'
import { archivedBorrowingPolicyRouter } from './borrowing-policy-archive.routes.ts'

test('archived policy management blocks all operations and retains Librarian authorization', async () => {
  for (const role of ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']) {
    const app=express()
    app.use(express.json())
    app.use((_req,res,next)=>{res.locals.authenticatedUser={accountId:1,role};next()})
    app.use('/policies',requireLibraryPermission('library.manage'),archivedBorrowingPolicyRouter)
    for (const [method,path] of [['get','/policies'],['get','/policies/1'],['post','/policies'],['put','/policies/1'],['delete','/policies/1']] as const) {
      const response=await request(app)[method](path).send({studentMaxActiveBooks:99})
      assert.equal(response.status,role==='Librarian'?410:403)
      if(role==='Librarian') {
        assert.equal(response.body.code,'BORROWING_POLICY_MANAGEMENT_ARCHIVED')
        assert.equal(response.headers['cache-control'],'no-store')
        assert.match(response.body.message,/Saved borrowing rules still apply/)
      }
    }
  }
})

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
