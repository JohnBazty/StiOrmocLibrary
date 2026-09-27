import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { adminClearanceV1Router } from '../clearance/clearance.routes.ts'
import { profileAvatarRouter } from './profile-avatar.routes.ts'

function appFor(role: string) {
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { role, accountId: 1 }; next() })
  app.use('/clearance', adminClearanceV1Router)
  app.use('/profile/avatar', profileAvatarRouter)
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

test('profile-picture approval requests are visible only to Admin', async () => {
  const response = await request(appFor('Staff')).get('/profile/avatar/submissions')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})
