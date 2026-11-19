import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createBorrowingPolicyRouter } from './borrowing-policy.routes.ts'
import jwt from 'jsonwebtoken'
import { createApp } from '../../app.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'

async function callAppAs(role: string, method: 'get' | 'post') {
  const execute = db.execute
  const queries: string[] = []
  db.execute = (async (sql: string) => {
    queries.push(sql)
    if (sql.includes('FROM accounts a')) return [[{ account_status: 'Active', auth_version: 1, school_id: 'TEST-USER', role, user_status: 'Active' }], []]
    if (sql.includes('library_login_sessions') || sql.includes('semester')) return [sql.includes('library_login_sessions') ? [{ 1: 1 }] : [], []]
    throw Object.assign(new Error('policy read reached the database'), { code: 'ENOTFOUND' })
  }) as typeof db.execute
  try {
    const token = jwt.sign({ accountId: 1, userId: 1, schoolId: 'TEST-USER', role, authVersion: 1, sessionId: 'test-session' }, env.jwt.secret, {
      algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience, subject: '1', expiresIn: '5m',
    })
    const response = await request(createApp())[method]('/api/v1/admin/borrowing-policies').set('Authorization', `Bearer ${token}`).send({})
    return { response, policyQueries: queries.filter((sql) => !sql.includes('FROM accounts a') && !sql.includes('library_login_sessions') && !sql.includes('semester')) }
  } finally { db.execute = execute }
}

test('the app serves borrowing policy management to a signed-in Librarian', async () => {
  const { response, policyQueries } = await callAppAs('Librarian', 'get')
  assert.notEqual(response.status, 410)
  assert.notEqual(response.body.code, 'BORROWING_POLICY_MANAGEMENT_ARCHIVED')
  assert.ok(policyQueries.length > 0, 'the policy service queried the database')
})

test('the app refuses borrowing policy management to every other role', async () => {
  for (const role of ['Admin', 'Staff', 'Student', 'Faculty']) {
    for (const method of ['get', 'post'] as const) {
      const { response, policyQueries } = await callAppAs(role, method)
      assert.equal(response.status, 403, `${role} ${method}`)
      assert.equal(policyQueries.length, 0, `${role} ${method} reached the policy service`)
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
