import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { adminNotificationsRouter, listAdminNotifications } from './admin-notifications.routes.ts'

test('Admin notifications show Staff creation and profile changes without exposing email or storage paths', async () => {
  const database = { execute: async () => [[
    { event_id: 6, action_code: 'ProfileEdited', changed_fields: 'first_name,year_grade_level', school_id: 'ST-6', full_name: 'E F', account_status: 'Active', created_at: '2026-09-28T10:00:00Z' },
    { event_id: 7, action_code: 'StaffAccountCreated', school_id: 'QA-STAFF', full_name: 'Library Worker', account_status: 'Active', created_at: '2026-09-28T10:00:00Z' },
  ]] } as never
  const result = await listAdminNotifications(database)
  assert.equal(result.activity[1].title, 'Staff account created')
  assert.equal(result.activity[0].actionPath, '/admin/users')
  assert.match(result.activity[0].body, /first name, year grade level/)
  assert.doesNotMatch(JSON.stringify(result), /storage_path|password_hash|code_hash|email/)
})

test('Admin notification route rejects Staff access', async () => {
  const app = express()
  app.use((_request, response, next) => { response.locals.authenticatedUser = { role: 'Staff', accountId: 1 }; next() })
  app.use('/admin/notifications', requireLibraryPermission('accounts.manage'), adminNotificationsRouter)
  const response = await request(app).get('/admin/notifications')
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'JWT_ROLE_FORBIDDEN')
})
