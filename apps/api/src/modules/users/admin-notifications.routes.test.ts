import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { adminNotificationsRouter, listAdminNotifications } from './admin-notifications.routes.ts'

test('Admin notifications combine pending reviews with account history without exposing email or storage paths', async () => {
  const rows = [
    [{ request_id: 4, school_id: 'ST-4', first_name: 'A', last_name: 'B', requested_role: 'Staff', created_at: '2026-09-28T08:00:00Z' }],
    [{ submission_id: 5, school_id: 'ST-5', full_name: 'C D', submitted_at: '2026-09-28T09:00:00Z' }],
    [{ event_id: 6, action_code: 'ProfileEdited', changed_fields: 'first_name,year_grade_level', school_id: 'ST-6', full_name: 'E F', account_status: 'Active', created_at: '2026-09-28T10:00:00Z' }],
    [{ total: 1 }], [{ total: 1 }],
  ]
  let index = 0
  const database = { execute: async () => [rows[index++]] } as never
  const result = await listAdminNotifications(database)
  assert.equal(result.pendingCount, 2)
  assert.deepEqual(result.pending.map(item => item.kind), ['avatar', 'registration'])
  assert.equal(result.activity[0].actionPath, '/admin/users')
  assert.match(result.activity[0].body, /first name, year grade level/)
  assert.doesNotMatch(JSON.stringify(result), /storage_path|password_hash|code_hash|email/)
})

test('Admin notification route rejects Staff access', async () => {
  const app = express()
  app.use((_request, response, next) => { response.locals.authenticatedUser = { role: 'Staff', accountId: 1 }; next() })
  app.use('/admin/notifications', requireJwtRoles('Admin'), adminNotificationsRouter)
  const response = await request(app).get('/admin/notifications')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})
