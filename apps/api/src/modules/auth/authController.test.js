import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoginController, createRegisterController } from './authController.js'

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}

function createRequest(body) {
  const session = {
    regenerated: false,
    saved: false,
    regenerate(callback) { this.regenerated = true; callback(null) },
    save(callback) { this.saved = true; callback(null) },
  }
  return { body, session }
}

function controllerFor(user, passwordMatches = true) {
  return createLoginController({
    database: { execute: async () => [[user].filter(Boolean)] },
    passwordHasher: { compare: async () => passwordMatches },
  })
}

test('creates a fresh student session and returns the user dashboard', async () => {
  const request = createRequest({ email: 'student.123456@ormoc.sti.edu.ph', password: 'correct-password' })
  const response = createResponse()
  const next = (error) => { if (error) throw error }
  const login = controllerFor({
    user_id: 17,
    full_name: 'Juan Dela Cruz',
    email: 'student.123456@ormoc.sti.edu.ph',
    password_hash: 'bcrypt-hash',
    account_status: 'Active',
    role_name: 'Student',
  })

  await login(request, response, next)

  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.redirect, 'http://localhost:5173/student/dashboard')
  assert.equal(request.session.regenerated, true)
  assert.equal(request.session.saved, true)
  assert.equal(request.session.user.role, 'Student')
  assert.ok(request.session.csrfToken)
})

test('blocks a deactivated account with the required warning', async () => {
  const request = createRequest({ email: 'faculty.name@ormoc.sti.edu.ph', password: 'correct-password' })
  const response = createResponse()
  const login = controllerFor({
    user_id: 9,
    full_name: 'Faculty Member',
    email: 'faculty.name@ormoc.sti.edu.ph',
    password_hash: 'bcrypt-hash',
    account_status: 'Deactivated',
    role_name: 'Faculty',
  })

  await login(request, response, (error) => { if (error) throw error })

  assert.equal(response.statusCode, 403)
  assert.equal(response.payload.code, 'ACCOUNT_DEACTIVATED')
  assert.equal(response.payload.message, 'Your account is currently deactivated. Please coordinate with the campus librarian.')
  assert.equal(request.session.user, undefined)
})

test('uses a generic error for unknown users and bad passwords', async () => {
  for (const login of [controllerFor(null, false), controllerFor({
    user_id: 1,
    password_hash: 'bcrypt-hash',
    account_status: 'Active',
    role_name: 'Librarian',
  }, false)]) {
    const request = createRequest({ email: 'person@ormoc.sti.edu.ph', password: 'wrong-password' })
    const response = createResponse()
    await login(request, response, (error) => { if (error) throw error })
    assert.equal(response.statusCode, 401)
    assert.equal(response.payload.code, 'INVALID_CREDENTIALS')
  }
})

test('registers an active student with a bcrypt hash and prepared values', async () => {
  const calls = []
  const database = {
    execute: async (sql, values) => {
      calls.push({ sql, values })
      if (sql.includes('SELECT user_id')) return [[]]
      if (sql.includes('SELECT role_id')) return [[{ role_id: 3 }]]
      return [{ insertId: 42 }]
    },
  }
  const register = createRegisterController({ database, passwordHasher: { hash: async () => 'bcrypt-hash' } })
  const request = createRequest({
    fullName: 'Maria Santos',
    email: 'student.654321@ormoc.sti.edu.ph',
    role: 'Student',
    password: 'secure-password',
  })
  const response = createResponse()

  await register(request, response, (error) => { if (error) throw error })

  assert.equal(response.statusCode, 201)
  assert.equal(response.payload.message, 'Account created successfully!')
  assert.equal(calls.length, 3)
  assert.match(calls[2].sql, /account_status/)
  assert.match(calls[2].sql, /'Active'/)
  assert.equal(calls[2].values[0], 3)
  assert.equal(calls[2].values[5], 'student.654321@ormoc.sti.edu.ph')
  assert.equal(calls[2].values[6], 'bcrypt-hash')
})

test('rejects duplicate registration emails before hashing', async () => {
  let hashCalled = false
  const register = createRegisterController({
    database: { execute: async () => [[{ user_id: 9 }]] },
    passwordHasher: { hash: async () => { hashCalled = true; return 'unused' } },
  })
  const request = createRequest({ fullName: 'Existing User', email: 'existing@sti.edu', role: 'Faculty', password: 'password' })
  const response = createResponse()

  await register(request, response, (error) => { if (error) throw error })

  assert.equal(response.statusCode, 409)
  assert.equal(response.payload.code, 'EMAIL_ALREADY_REGISTERED')
  assert.equal(hashCalled, false)
})

test('requires a System Administrator session to create Librarians', async () => {
  let databaseCalled = false
  const register = createRegisterController({
    database: { execute: async () => { databaseCalled = true; return [[]] } },
    passwordHasher: { hash: async () => 'unused' },
  })
  const request = createRequest({ fullName: 'Library Staff', email: 'librarian@sti.edu', role: 'Librarian', password: 'password' })
  const response = createResponse()

  await register(request, response, (error) => { if (error) throw error })

  assert.equal(response.statusCode, 403)
  assert.equal(response.payload.code, 'ADMIN_APPROVAL_REQUIRED')
  assert.equal(databaseCalled, false)
})
