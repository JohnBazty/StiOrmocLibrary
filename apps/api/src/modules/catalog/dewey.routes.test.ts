import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createDeweyRouter } from './dewey.routes.ts'

test('Dewey lookup, reads and writes reject non-Librarian roles', async () => {
  for (const role of ['Student','Faculty','Staff',undefined]) {
    const app=express(); app.use(express.json())
    app.use((_req,res,next)=>{res.locals.authenticatedUser={role,accountId:1};next()})
    app.use(createDeweyRouter())
    for (const path of ['/lookup/9780132350884','/classifications','/copies','/automatic/books','/local/rules','/local/reference','/call-numbers/books']) assert.equal((await request(app).get(path)).status,403)
    for(const path of ['/automatic/start','/automatic/step','/local/preview','/call-numbers/1/preview','/call-numbers/1/save'])assert.equal((await request(app).post(path).send({})).status,403)
    assert.equal((await request(app).post('/assign').send({})).status,403)
    assert.equal((await request(app).post('/classifications').send({})).status,403)
    assert.equal((await request(app).patch('/classifications/1').send({})).status,403)
  }
})

test('Librarian can inspect reference coverage separately from matching vocabulary', async () => {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.authenticatedUser = { role: 'Librarian', accountId: 1 }; next() })
  app.use(createDeweyRouter())
  const reference = await request(app).get('/local/reference').expect(200)
  assert.equal(reference.body.data.sections.length, 1000)
  assert.equal(reference.body.data.sections[163].status === 'active', false)
  assert.equal(reference.body.data.reference.license, 'CC-BY-SA-4.0')
  const rules = await request(app).get('/local/rules').expect(200)
  assert.equal(rules.body.data.referencePositions, 1000)
  assert.equal(rules.body.data.supportedSubjects, rules.body.data.rules.length)
  assert.ok(rules.body.data.supportedSubjects < rules.body.data.activeSections)
  const preview = await request(app).post('/local/preview').send({ title: 'Panimula sa Algebra' }).expect(200)
  assert.equal(preview.body.data.code, '512')
  assert.equal(preview.body.data.referenceVersion, reference.body.data.reference.version)
})
