import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requestQuery } from './request-query.ts'
import { createPaymentsController } from '../modules/payments/payments.controller.ts'
import { parseTarget } from '../modules/payments/payments.validation.ts'

test('payment options ignore an immutable hosting query helper and validate actual client fields', async () => {
  const service = { options: async (_actor: unknown, query: unknown) => parseTarget(query) }
  const controller = createPaymentsController(service as never)
  const app = express()
  app.use((req, res, next) => {
    Object.defineProperty(req, 'query', { configurable: false, get: () => ({kind:'Fine',targetId:'99',__api_route:'internal',path:'hosting-only'}) })
    res.locals.authenticatedUser = {accountId:7,role:'Student'}
    next()
  })
  app.get('/options', controller.options)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status ?? 500).json({code:error.code}) })
  const valid = await request(app).get('/options?kind=Printing&targetId=30&__api_route=ignored')
  assert.equal(valid.status, 200)
  assert.deepEqual(valid.body.data, {kind:'Printing',targetId:30})
  for (const query of ['kind=Fine&targetId=12&userId=99', 'kind=Fine&kind=Printing&targetId=12', 'kind=Fine&targetId=12&targetId=99']) {
    assert.equal((await request(app).get('/options?'+query)).status, 422)
  }
})

test('query reader retains user fields, null-prototype keys and duplicate values', () => {
  const query=requestQuery({originalUrl:'/options?kind=Fine&targetId=12&__proto__=value&q=a%26b&q=c&__api_route=ignored'})
  assert.equal(Object.getPrototypeOf(query), null)
  assert.equal(query.__proto__, 'value')
  assert.deepEqual(query.q, ['a&b','c'])
  assert.equal(query.__api_route, undefined)
})
