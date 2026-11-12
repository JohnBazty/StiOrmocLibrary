import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app.js'
import { db } from '../config/db.js'
import { env } from '../config/env.js'

test('a database outage produces a safe JSON 503 response on a protected route', async () => {
  const execute = db.execute
  db.execute = (async () => { throw Object.assign(new Error('private connection details'), { code: 'ENOTFOUND' }) }) as typeof db.execute
  try {
    const token = jwt.sign({ accountId: 1, userId: 1, schoolId: 'TEST-STUDENT', role: 'Student', authVersion: 1 }, env.jwt.secret, {
      algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience, subject: '1', expiresIn: '5m',
    })
    const response = await request(createApp()).get('/api/v1/dashboard').set('Authorization', `Bearer ${token}`)
    assert.equal(response.status, 503)
    assert.equal(response.body.code, 'DATABASE_UNAVAILABLE')
    assert.equal(response.body.message, 'The library database is temporarily unavailable. Please try again.')
    assert.ok(response.headers['content-type'].includes('application/json'))
    assert.ok(!JSON.stringify(response.body).includes('private connection details'))
  } finally { db.execute = execute }
})
