import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createCatalogAdminRouter } from './catalog-admin.routes.ts'

function appFor(role: 'Admin' | 'Student') {
  const app = express()
  app.use(express.json())
  app.use((_request, response, next) => { response.locals.authenticatedUser = { accountId: 5, role }; next() })
  app.use('/catalog', createCatalogAdminRouter({
    changeTitleCategory: async (req, res) => { res.json({ success: true, data: { titleId: Number(req.params.titleId) } }) },
  }))
  return app
}

test('only Admin can change a catalog title category', async () => {
  const student = await request(appFor('Student')).patch('/catalog/titles/14/category').send({ targetCategoryId: 8, expectedRowVersion: 3 })
  assert.equal(student.status, 403)
  assert.equal(student.body.code, 'JWT_ROLE_FORBIDDEN')

  const admin = await request(appFor('Admin')).patch('/catalog/titles/14/category').send({ targetCategoryId: 8, expectedRowVersion: 3 })
  assert.equal(admin.status, 200)
  assert.equal(admin.body.data.titleId, 14)
})
