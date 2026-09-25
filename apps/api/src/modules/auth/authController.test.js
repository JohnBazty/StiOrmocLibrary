import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoginController } from './authController.js'

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
