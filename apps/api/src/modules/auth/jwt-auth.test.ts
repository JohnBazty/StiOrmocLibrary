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
import type { AuthSessionRepository } from './auth-session.repository.ts'

const redirects: Record<JwtRole, string> = {
  Admin: '/admin/dashboard', Librarian: '/librarian/dashboard', Faculty: '/faculty/dashboard', Student: '/student/dashboard',
}

function stubSessions(authVersion = 2): AuthSessionRepository & { calls: { accountIds: number[]; clearedUsers: number[] } } {
  const calls = { accountIds: [] as number[], clearedUsers: [] as number[] }
  return {
    calls,
    async incrementAuthVersionForAccount(accountId) {
      calls.accountIds.push(accountId)
      return authVersion
    },
    async incrementAuthVersionForUser() { return authVersion },
    async clearOtherSessions() {},
    async clearAllSessionsForUser(userId) { calls.clearedUsers.push(userId) },
  }
}

test('authenticates all four roles, signs the required claims, and returns the correct redirect', async () => {
  let id = 0
  for (const role of Object.keys(redirects) as JwtRole[]) {
    id += 1
    const sessions = stubSessions(5)
    const database = { execute: async () => [[{
      account_id: id, user_id: id + 100, school_id: `STI-2026-${String(id).padStart(4, '0')}`,
      first_name: role, last_name: 'User', password_hash: 'bcrypt-hash', role, account_status: 'Active',
    }]] } as never
    const service = createJwtAuthService(database, { compare: async () => true } as never, jwt, sessions)
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
    assert.equal(claims.authVersion, 5)
    assert.deepEqual(sessions.calls.accountIds, [id])
    assert.deepEqual(sessions.calls.clearedUsers, [id + 100])
  }
})

test('rejects invalid credentials without revealing whether the account exists', async () => {
  const sessions = stubSessions()
  const database = { execute: async () => [[{
    account_id: 1, school_id: 'STI-2026-0001', first_name: 'Student', last_name: 'User',
    password_hash: 'bcrypt-hash', role: 'Student', account_status: 'Active',
  }]] } as never
  const service = createJwtAuthService(database, { compare: async () => false } as never, jwt, sessions)

  await assert.rejects(
    service.login({ login_as: 'Student', school_id: 'STI-2026-0001', password: 'wrong-password' }),
    (error: unknown) => error instanceof HttpError && error.status === 401 && error.code === 'INVALID_CREDENTIALS',
  )
  assert.deepEqual(sessions.calls.accountIds, [])
})

test('registration hashes the password and commits separate account and student profile rows', async () => {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  let committed = false
  let released = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      writes.push({ sql, values })
      if (sql.includes('FOR UPDATE')) return [[]]
      if (sql.includes('INSERT INTO accounts')) return [{ insertId: 91 }]
      return [{ insertId: 12 }]
    },
    commit: async () => { committed = true },
    rollback: async () => undefined,
    release: () => { released = true },
  }
  const database = { execute: async () => [[]], getConnection: async () => connection } as never
  const passwordHasher = { hash: async () => '$2b$12$secure-hash', compare: async () => false } as never
  const service = createJwtAuthService(database, passwordHasher, jwt, stubSessions())

  const result = await service.register({
    school_id: ' sti-2026-0091 ', first_name: ' Ada ', last_name: ' Lovelace ',
    contact_number: '0917 123 4567', program_strand: 'BSIT', year_grade_level: '4th Year',
    password: 'CorrectHorse1', confirm_password: 'CorrectHorse1',
  })

  assert.equal(result.account.id, 91)
  assert.equal(result.account.schoolId, 'STI-2026-0091')
  assert.equal(committed, true)
  assert.equal(released, true)
  assert.equal(writes.some(({ sql }) => sql.includes('INSERT INTO accounts')), true)
  assert.equal(writes.some(({ sql }) => sql.includes('INSERT INTO student_profiles')), true)
  assert.equal(writes.flatMap(({ values }) => values).includes('CorrectHorse1'), false)
  assert.equal(writes.flatMap(({ values }) => values).includes('$2b$12$secure-hash'), true)
})

test('duplicate school ID is rejected with 422 before hashing or opening a transaction', async () => {
  let hashed = false
  let openedConnection = false
  const database = {
    execute: async () => [[{ account_id: 7 }]],
    getConnection: async () => { openedConnection = true; throw new Error('must not open') },
  } as never
  const service = createJwtAuthService(database, {
    hash: async () => { hashed = true; return 'unexpected' }, compare: async () => false,
  } as never, jwt, stubSessions())

  await assert.rejects(
    service.register({
      school_id: 'STI-2026-0007', first_name: 'Existing', last_name: 'Student',
      contact_number: '09171234567', program_strand: 'BSIT', year_grade_level: '1st Year',
      password: 'CorrectHorse1', confirm_password: 'CorrectHorse1',
    }),
    (error: unknown) => error instanceof HttpError && error.status === 422 && error.code === 'SCHOOL_ID_ALREADY_REGISTERED',
  )
  assert.equal(hashed, false)
  assert.equal(openedConnection, false)
})

test('rejects valid credentials when login_as does not match the stored role', async () => {
  let queryValues: unknown[] = []
  const database = { execute: async (_sql: string, values: unknown[]) => { queryValues = values; return [[]] } } as never
  const service = createJwtAuthService(database, { compare: async () => false } as never, jwt, stubSessions())

  await assert.rejects(
    service.login({ login_as: 'Faculty', school_id: 'STI-2026-0042', password: 'CorrectHorse1' }),
    (error: unknown) => error instanceof HttpError && error.status === 401 && error.code === 'INVALID_CREDENTIALS',
  )
  assert.deepEqual(queryValues, ['STI-2026-0042', 'Faculty'])
})

test('user portal detects a Student account without a selected role', async () => {
  let queryValues: unknown[] = []
  const database = { execute: async (_sql: string, values: unknown[]) => {
    queryValues = values
    return [[{
      account_id: 42, user_id: 99, school_id: 'STI-2026-0042', password_hash: 'bcrypt-hash',
      role: 'Student', account_status: 'Active', first_name: 'Ada', last_name: 'Lovelace',
    }]]
  } } as never
  const service = createJwtAuthService(database, { compare: async () => true } as never, jwt, stubSessions())

  const result = await service.login({ portal: 'user', school_id: 'STI-2026-0042', password: 'CorrectHorse1' })

  assert.equal(result.user.role, 'Student')
  assert.deepEqual(queryValues, ['STI-2026-0042'])
})

test('user portal rejects staff credentials without revealing the stored role', async () => {
  const database = { execute: async () => [[{
    account_id: 1, user_id: 1, school_id: 'ADMIN-001', password_hash: 'bcrypt-hash',
    role: 'Admin', account_status: 'Active', linked_status: 'Active',
  }]] } as never
  const service = createJwtAuthService(database, { compare: async () => true } as never, jwt, stubSessions())

  await assert.rejects(
    service.login({ portal: 'user', school_id: 'ADMIN-001', password: 'CorrectHorse1' }),
    (error: unknown) => error instanceof HttpError
      && error.status === 401
      && error.code === 'INVALID_CREDENTIALS'
      && error.message === 'Invalid school ID or password.',
  )
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
  const service = createJwtAuthService(database, { compare: async () => true } as never, jwt, stubSessions())
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

test('login bumps auth_version and signs the new JWT with that version', async () => {
  const sessions = stubSessions(4)
  const database = { execute: async () => [[{
    account_id: 42, user_id: 99, school_id: 'STI-2026-0042', password_hash: 'bcrypt-hash',
    role: 'Student', account_status: 'Active', first_name: 'Ada', last_name: 'Lovelace',
  }]] } as never
  const service = createJwtAuthService(database, { compare: async () => true } as never, jwt, sessions)
  const result = await service.login({ login_as: 'Student', school_id: 'STI-2026-0042', password: 'correct-password' })
  const claims = jwt.verify(result.token, env.jwt.secret, {
    algorithms: ['HS256'], issuer: env.jwt.issuer, audience: env.jwt.audience,
  }) as jwt.JwtPayload
  assert.equal(claims.authVersion, 4)
  assert.deepEqual(sessions.calls.accountIds, [42])
  assert.deepEqual(sessions.calls.clearedUsers, [99])
})
