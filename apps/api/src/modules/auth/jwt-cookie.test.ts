import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { signSessionToken } from './login-security.service.ts'
import {
  ACCESS_COOKIE, authenticateJwt, createActiveJwtAccountGuard, csrfTokenFor, requestAccessToken,
} from './jwt-auth.middleware.ts'
import { requireCsrfForStateChanges } from './auth.middleware.js'

const librarian = { accountId: 4, schoolId: 'LIB-0004', role: 'Librarian', authVersion: 3, sessionId: '0f0e0d0c-0b0a-4908-8706-050403020100' }
const token = signSessionToken(librarian)
const cookie = `${ACCESS_COOKIE}=${token}`

function app() {
  const server = express()
  server.use(authenticateJwt, requireCsrfForStateChanges)
  server.all('/thing', (_request, response) => { response.json({ success: true, source: response.locals.authenticationSource, id: response.locals.authenticatedUser.accountId }) })
  return server
}

test('the access token is read from the Bearer header first, then from the cookie', async () => {
  const fake = { get: (name: string) => ({ authorization: 'Bearer header-token', cookie: `other=1; ${ACCESS_COOKIE}=cookie-token` } as Record<string, string>)[name] }
  assert.deepEqual(requestAccessToken(fake as never), { token: 'header-token', source: 'bearer' })
  const cookieOnly = { get: (name: string) => (name === 'cookie' ? `other=1; ${ACCESS_COOKIE}=cookie-token` : undefined) }
  assert.deepEqual(requestAccessToken(cookieOnly as never), { token: 'cookie-token', source: 'cookie' })
  assert.equal(requestAccessToken({ get: () => undefined } as never), null)
  const other = signSessionToken({ ...librarian, accountId: 5, schoolId: 'LIB-0005' })
  const response = await request(app()).get('/thing').set('Authorization', `Bearer ${other}`).set('Cookie', cookie)
  assert.equal(response.body.id, 5)
  assert.equal(response.body.source, 'bearer')
})

test('a cookie sign-in reads safely without CSRF but writes need the session CSRF token', async () => {
  assert.equal((await request(app()).get('/thing').set('Cookie', cookie)).status, 200)
  const missing = await request(app()).post('/thing').set('Cookie', cookie)
  assert.equal(missing.status, 403)
  assert.equal(missing.body.code, 'INVALID_CSRF_TOKEN')
  const wrong = await request(app()).post('/thing').set('Cookie', cookie).set('X-CSRF-Token', csrfTokenFor('another-session'))
  assert.equal(wrong.status, 403)
  const ok = await request(app()).post('/thing').set('Cookie', cookie).set('X-CSRF-Token', csrfTokenFor(librarian.sessionId))
  assert.equal(ok.status, 200)
  assert.equal(ok.body.source, 'cookie')
})

test('a Bearer request needs no CSRF token', async () => {
  assert.equal((await request(app()).delete('/thing').set('Authorization', `Bearer ${token}`)).status, 200)
})

test('a missing or broken cookie is rejected as signed out', async () => {
  assert.equal((await request(app()).get('/thing')).body.code, 'JWT_REQUIRED')
  assert.equal((await request(app()).get('/thing').set('Cookie', `${ACCESS_COOKIE}=broken`)).body.code, 'JWT_INVALID')
})

test('an account with a temporary password can only reach the change-password routes', async () => {
  const database = { execute: async (sql: string) => sql.includes('FROM accounts')
    ? [[{ account_status: 'Active', auth_version: 3, school_id: 'LIB-0004', role: 'Librarian', must_change_password: true }]]
    : [[{ 1: 1 }]] }
  const server = express()
  server.use(authenticateJwt, createActiveJwtAccountGuard(database as never))
  server.all('/{*path}', (_request, response) => { response.json({ success: true }) })
  const call = (method: 'get' | 'post', path: string) => request(server)[method](path).set('Authorization', `Bearer ${token}`)
  const blocked = await call('get', '/api/v1/catalog/books')
  assert.equal(blocked.status, 403)
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED')
  assert.equal((await call('post', '/api/v1/auth/me')).status, 403)
  for (const [method, path] of [['get', '/api/v1/auth/me'], ['post', '/api/v1/auth/activity'], ['post', '/api/v1/auth/change-password'], ['post', '/api/auth/logout?x=1'], ['post', '/auth/logout']] as const) {
    assert.equal((await call(method, path)).status, 200, `${method} ${path}`)
  }
})
