import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'

process.env.INVENTORY_PREVIEW_ENABLED = 'true'
const { inventoryPreviewRouter } = await import('./inventory-preview.routes.ts')
const { requireRoles } = await import('../auth/auth.middleware.js')
const { ROLES } = await import('../auth/auth.constants.js')
const { requireCatalogManager } = await import('../catalog/catalog.rbac.ts')

test('dev preview session is a Librarian that passes inventory and catalog guards', async () => {
  const session: Record<string, unknown> = {
    regenerate: (cb: (e?: Error) => void) => cb(),
    save: (cb: (e?: Error) => void) => cb(),
  }
  const app = express()
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'session', { configurable: true, value: session })
    next()
  })
  app.use('/preview', inventoryPreviewRouter)
  app.get('/guarded', requireRoles(ROLES.LIBRARIAN), requireCatalogManager, (_req, res) => res.json({ ok: true }))

  const created = await request(app).post('/preview/session')
  assert.equal(created.status, 200)
  assert.equal(created.body.data.session.role, 'Librarian')
  assert.equal((session.user as { role: string }).role, 'Librarian')
  assert.equal((await request(app).get('/guarded')).status, 200)
})

test('dev preview refuses forwarded requests and non-local Host headers', async () => {
  const app = express()
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'session', { configurable: true, value: { regenerate: (cb: () => void) => cb(), save: (cb: () => void) => cb() } })
    next()
  })
  app.use('/preview', inventoryPreviewRouter)
  assert.equal((await request(app).post('/preview/session').set('X-Forwarded-For', '203.0.113.9')).status, 403)
  assert.equal((await request(app).post('/preview/session').set('Host', 'library.example.edu')).status, 403)
  assert.equal((await request(app).post('/preview/session')).status, 200)
})
