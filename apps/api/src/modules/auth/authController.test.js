import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoginController, createLogoutController } from './authController.js'

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
  return { body, session, sessionID: 'session-current' }
}

function stubSessions(authVersion = 3) {
  const calls = { userIds: [], cleared: [] }
  return {
    calls,
    async incrementAuthVersionForUser(userId) {
      calls.userIds.push(userId)
      return authVersion
    },
    async incrementAuthVersionForAccount() { return authVersion },
    async clearOtherSessions(userId, sessionId) {
      calls.cleared.push({ userId, sessionId })
    },
    async clearAllSessionsForUser() {},
  }
}

function controllerFor(user, passwordMatches = true, sessions = stubSessions()) {
  return createLoginController({
    database: { execute: async () => [[user].filter(Boolean)] },
    passwordHasher: { compare: async () => passwordMatches },
    sessions,
  })
}

test('creates a fresh student session and returns the user dashboard', async () => {
  const sessions = stubSessions(7)
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
  }, true, sessions)

  await login(request, response, next)

  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.redirect, 'http://localhost:5173/student/dashboard')
  assert.equal(request.session.regenerated, true)
  assert.equal(request.session.saved, true)
  assert.equal(request.session.user.role, 'Student')
  assert.equal(request.session.authVersion, 7)
  assert.ok(request.session.csrfToken)
  assert.deepEqual(sessions.calls.userIds, [17])
  assert.deepEqual(sessions.calls.cleared, [{ userId: 17, sessionId: 'session-current' }])
})

test('blocks a deactivated account with the required warning', async () => {
  const sessions = stubSessions()
  const request = createRequest({ email: 'faculty.name@ormoc.sti.edu.ph', password: 'correct-password' })
  const response = createResponse()
  const login = controllerFor({
    user_id: 9,
    full_name: 'Faculty Member',
    email: 'faculty.name@ormoc.sti.edu.ph',
    password_hash: 'bcrypt-hash',
    account_status: 'Deactivated',
    role_name: 'Faculty',
  }, true, sessions)

  await login(request, response, (error) => { if (error) throw error })

  assert.equal(response.statusCode, 403)
  assert.equal(response.payload.code, 'ACCOUNT_DEACTIVATED')
  assert.equal(response.payload.message, 'Your account is currently deactivated. Please coordinate with the campus librarian.')
  assert.equal(request.session.user, undefined)
  assert.deepEqual(sessions.calls.userIds, [])
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

function logoutFixture(type, revoke = async () => true, destroyError = null) {
  const calls = []
  const request = { session: { user: { id: 12 }, authVersion: 9, destroy(callback) { calls.push('destroy'); callback(destroyError) } } }
  const response = {
    locals: { authenticationType: type, authenticatedUser: { accountId: 5, authVersion: 4 } },
    clearCookie() { calls.push('clearCookie') },
    redirect(status, url) { calls.push({ status, url }) },
  }
  const controller = createLogoutController({ sessions: { async revokeCurrentVersion(identity) { calls.push(identity); return revoke(identity) } } })
  return { request, response, calls, controller }
}

test('logout revokes the authenticated bearer account/version before destroying a coexisting cookie', async () => {
  const f = logoutFixture('jwt')
  await f.controller(f.request, f.response, error => { throw error })
  assert.deepEqual(f.calls, [{ accountId: 5, authVersion: 4 }, 'destroy', 'clearCookie', { status: 303, url: '/login?logout=1' }])
})

test('cookie-only logout uses the operational user version, not the bearer account ID', async () => {
  const f = logoutFixture('session')
  await f.controller(f.request, f.response, error => { throw error })
  assert.deepEqual(f.calls[0], { userId: 12, authVersion: 9 })
  assert.deepEqual(f.calls.at(-1), { status: 303, url: '/login?logout=1' })
})

test('a stale logout still clears its own cookie when a newer version is preserved', async () => {
  const f = logoutFixture('jwt', async () => false)
  await f.controller(f.request, f.response, error => { throw error })
  assert.ok(f.calls.includes('destroy'))
  assert.deepEqual(f.calls.at(-1), { status: 303, url: '/login?logout=1' })
})

test('logout fails without reporting success when revocation cannot be committed', async () => {
  const failure = new Error('Database unavailable')
  const f = logoutFixture('jwt', async () => { throw failure })
  let received
  await f.controller(f.request, f.response, error => { received = error })
  assert.equal(received, failure)
  assert.deepEqual(f.calls, [{ accountId: 5, authVersion: 4 }])
})

test('logout does not redirect successfully when cookie destruction fails after revocation', async () => {
  const failure = new Error('Session store unavailable')
  const f = logoutFixture('session', async () => true, failure)
  let received
  await f.controller(f.request, f.response, error => { received = error })
  assert.equal(received, failure)
  assert.deepEqual(f.calls, [{ userId: 12, authVersion: 9 }, 'destroy'])
})
