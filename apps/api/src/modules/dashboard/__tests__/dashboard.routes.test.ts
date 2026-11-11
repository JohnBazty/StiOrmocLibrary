import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import express from 'express'
import { dashboardController } from '../dashboard.controller.ts'
import { userDashboardV1Router, adminDashboardV1Router } from '../dashboard.routes.ts'

// Snapshot the real handlers so tests can restore them.
const originalUser = dashboardController.user
const originalAdmin = dashboardController.admin
const originalAdminPdf = dashboardController.adminPdf

function mockController() {
  dashboardController.user = async (_req: any, res: any) => {
    res.json({ success: true, data: { activeLoans: 1, reservations: 1, unreadUpdates: 2 } })
  }
  dashboardController.admin = async (_req: any, res: any) => {
    res.json({ success: true, data: { activeBorrows: 184, dueToday: 38, overdue: 24 } })
  }
  dashboardController.adminPdf = async (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/pdf')
    res.send(Buffer.from('PDF mock content'))
  }
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1/dashboard', userDashboardV1Router)
  app.use('/api/v1/admin/dashboard', adminDashboardV1Router)
  return app
}

test.afterEach(() => {
  dashboardController.user = originalUser
  dashboardController.admin = originalAdmin
  dashboardController.adminPdf = originalAdminPdf
})

test('GET /api/v1/dashboard responds with user dashboard data', async () => {
  mockController()
  const response = await request(buildApp()).get('/api/v1/dashboard/')
  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.ok(response.body.data)
})

test('GET /api/v1/admin/dashboard responds with admin dashboard data', async () => {
  mockController()
  const response = await request(buildApp()).get('/api/v1/admin/dashboard/')
  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.ok(response.body.data)
})

test('GET /api/v1/admin/dashboard/summary.pdf responds with PDF content', async () => {
  mockController()
  const response = await request(buildApp()).get('/api/v1/admin/dashboard/summary.pdf')
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'application/pdf')
})