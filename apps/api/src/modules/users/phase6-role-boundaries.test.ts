import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { adminClearanceV1Router } from '../clearance/clearance.routes.ts'
import { profileAvatarRouter } from './profile-avatar.routes.ts'
import { adminUsersV1Router } from './users.routes.ts'
import { jwtAuthRouter } from '../auth/jwt-auth.routes.ts'

function appFor(role: string) {
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { role, accountId: 1 }; next() })
  app.use('/clearance', adminClearanceV1Router)
  app.use('/profile/avatar', profileAvatarRouter)
  app.use('/admin/users', adminUsersV1Router)
  return app
}

test('Admin cannot use Librarian lost-book finance actions', async () => {
  for (const [method, path] of [
    ['patch', '/clearance/lost-books/1'],
    ['patch', '/clearance/lost-books/1/resolution'],
    ['patch', '/clearance/lost-books/1/payment'],
    ['post', '/clearance/lost-books/loans/1/report'],
  ] as const) {
    const response = await request(appFor('Admin'))[method](path).send({})
    assert.equal(response.status, 403, `${method} ${path}`)
    assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
  }
})

test('Staff cannot provision accounts', async () => {
  const response = await request(appFor('Staff')).post('/admin/users/staff').send({})
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})

test('profile-picture review routes have been retired', async () => {
  const app = appFor('Librarian')
  assert.equal((await request(app).get('/profile/avatar/submissions')).status, 404)
  assert.equal((await request(app).post('/profile/avatar/submissions/1/review').send({ decision: 'approve' })).status, 404)
})

test('legacy registration endpoints cannot create another approval request', async () => {
  const app = express()
  app.use('/auth', jwtAuthRouter)
  for (const path of ['/register', '/register/resend', '/register/verify']) {
    const response = await request(app).post('/auth' + path).send({})
    assert.equal(response.status, 410)
    assert.equal(response.body.code, 'REGISTRATION_FLOW_REPLACED')
  }
})

test('Admin has no route to edit another account profile', async () => {
  const response = await request(appFor('Admin')).patch('/admin/users/9/profile').send({ first_name: 'Changed' })
  assert.equal(response.status, 404)
})
