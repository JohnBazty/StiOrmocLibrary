import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test'
const { requireLibraryPermission } = await import('../auth/jwt-auth.middleware.ts')
const { catalogMaintenanceRouter } = await import('./catalog-enhancements.routes.ts')

test('only the Librarian can check a research list file', async () => {
  const csv = 'Title,Authors,Adviser,Year,Abstract,Research Code,Program\nSmart Shelves,Ana Cruz,Dr. Lim,2025,A study of library services in a small college.,R-001,BSIT\n'
  for (const role of ['Librarian', 'Staff', 'Student']) {
    const app = express()
    app.use(express.json())
    app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 1, role }; next() })
    app.use('/maintenance', requireLibraryPermission('library.manage'), catalogMaintenanceRouter)
    const response = await request(app).post('/maintenance/research-imports/preview').field('shelfLocation', 'Thesis Rack 1').attach('research', Buffer.from(csv), 'research.csv')
    assert.equal(response.status, role === 'Librarian' ? 200 : 403)
    if (role === 'Librarian') assert.equal(response.body.data.rows[0].data.copy.shelfLocation, 'Thesis Rack 1')
  }
})
