import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { jwtProtectedRouter } from './jwt-auth.routes.ts'
import { createJwtAuthService, type JwtRole } from './jwt-auth.service.ts'

const redirects: Record<JwtRole, string> = {
  Admin: '/admin/dashboard', Librarian: '/librarian/dashboard', Faculty: '/faculty/dashboard', Student: '/student/dashboard',
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
  const service = createJwtAuthService(database, passwordHasher, jwt)

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
  } as never, jwt)

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
