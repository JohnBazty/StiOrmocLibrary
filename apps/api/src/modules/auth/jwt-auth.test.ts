import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { jwtProtectedRouter } from './jwt-auth.routes.ts'
import { createJwtAuthService, type JwtRole } from './jwt-auth.service.ts'
import { createActiveJwtAccountGuard, verifyAccessToken } from './jwt-auth.middleware.ts'

const redirects: Record<JwtRole, string> = {
  Admin: '/admin/dashboard', Librarian: '/librarian/dashboard', Faculty: '/faculty/dashboard', Student: '/student/dashboard', Staff: '/staff/dashboard',
}

test('authenticates all four roles, signs the required claims, and returns the correct redirect', async () => {
  let id = 0
  for (const role of Object.keys(redirects) as JwtRole[]) {
    id += 1
    const database = { execute: async () => [[{
      account_id: id, school_id: `STI-2026-${String(id).padStart(4, '0')}`,
      first_name: role, last_name: 'User', password_hash: 'bcrypt-hash', role, account_status: 'Active',
    }]] } as never
    const service = createJwtAuthService(database, { compare: async () => true } as never, jwt)
    const result = await service.login({ login_as: role, school_id: `STI-2026-${String(id).padStart(4, '0')}`, password: 'correct-password' })
    const claims = jwt.verify(result.token, env.jwt.secret, {
      algorithms: ['HS256'], issuer: env.jwt.issuer, audience: env.jwt.audience,
    }) as jwt.JwtPayload

    assert.equal(result.redirect, redirects[role])
    assert.equal(result.user.role, role)
    assert.equal(claims.accountId, id)
    assert.equal(claims.userId, id)
    assert.equal(claims.schoolId, `STI-2026-${String(id).padStart(4, '0')}`)
    assert.equal(claims.role, role)
  }
})

test('rejects invalid credentials without revealing whether the account exists', async () => {
  const database = { execute: async () => [[{
    account_id: 1, school_id: 'STI-2026-0001', first_name: 'Student', last_name: 'User',
    password_hash: 'bcrypt-hash', role: 'Student', account_status: 'Active',
  }]] } as never
  const service = createJwtAuthService(database, { compare: async () => false } as never, jwt)

  await assert.rejects(
    service.login({ login_as: 'Student', school_id: 'STI-2026-0001', password: 'wrong-password' }),
    (error: unknown) => error instanceof HttpError && error.status === 401 && error.code === 'INVALID_CREDENTIALS',
  )
})

test('correct pending role credentials explain the approval wait without issuing a token', async () => {
  let queries = 0
  const database = { execute: async () => { queries++; return queries === 1 ? [[]] : [[{ status: 'PendingApproval', password_hash: 'hashed' }]] } } as never
  const service = createJwtAuthService(database, { compare: async () => true } as never, jwt)
  await assert.rejects(service.login({ school_id: 'STAFF-123', login_as: 'Staff', password: 'CorrectHorse1' }),
    (error: unknown) => error instanceof HttpError && error.code === 'ACCOUNT_APPROVAL_PENDING')
})

test('rejects valid credentials when login_as does not match the stored role', async () => {
  let queryValues: unknown[] = []
  const database = { execute: async (_sql: string, values: unknown[]) => { queryValues = values; return [[]] } } as never
  const service = createJwtAuthService(database, { compare: async () => false } as never, jwt)

  await assert.rejects(
    service.login({ login_as: 'Faculty', school_id: 'STI-2026-0042', password: 'CorrectHorse1' }),
    (error: unknown) => error instanceof HttpError && error.status === 401 && error.code === 'INVALID_CREDENTIALS',
  )
  assert.deepEqual(queryValues, ['STI-2026-0042', 'Faculty'])
})

test('blocks a Student bearer token from the Admin dashboard data endpoint', async () => {
  const token = jwt.sign(
    { userId: 77, schoolId: 'STI-2026-0077', role: 'Student' }, env.jwt.secret,
    { algorithm: 'HS256', expiresIn: 900, issuer: env.jwt.issuer, audience: env.jwt.audience, subject: '77' },
  )
  const app = express()
  app.use('/api/v1', jwtProtectedRouter)

  const response = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${token}`)
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('rejects login when the linked operational user is deactivated', async () => {
  const database = { execute: async () => [[{
    account_id: 1, school_id: 'STI-2026-0001', password_hash: 'bcrypt-hash',
    role: 'Student', account_status: 'Active', linked_status: 'Deactivated',
  }]] } as never
  const service = createJwtAuthService(database, { compare: async () => true } as never, jwt)
  await assert.rejects(
    service.login({ login_as: 'Student', school_id: 'STI-2026-0001', password: 'correct-password' }),
    (error: unknown) => error instanceof HttpError && error.status === 403 && error.code === 'ACCOUNT_DEACTIVATED',
  )
})

test('old bearer tokens are rejected after a status change or activation version increment', async () => {
  const token = jwt.sign({ accountId: 9, schoolId: 'TEST-9', role: 'Student' }, env.jwt.secret,
    { algorithm: 'HS256', issuer: env.jwt.issuer, audience: env.jwt.audience, expiresIn: 900 })
  const identity = verifyAccessToken(token)
  assert.equal(identity.authVersion, 1)
  for (const account of [
    { account_status: 'Deactivated', auth_version: 2 },
    { account_status: 'Active', auth_version: 3 },
  ]) {
    const guard = createActiveJwtAccountGuard({ execute: async () => [[{ ...account, school_id: 'TEST-9', role: 'Student', user_status: account.account_status }]] } as never)
    const outcome = await new Promise<{ code?: string; next?: boolean }>(resolve => {
      const response = { locals: { authenticatedUser: identity }, status: () => response, json: (body: { code: string }) => resolve(body) }
      guard({} as never, response as never, () => resolve({ next: true }))
    })
    assert.equal(outcome.code, 'ACCOUNT_ACCESS_REVOKED')
  }
})
