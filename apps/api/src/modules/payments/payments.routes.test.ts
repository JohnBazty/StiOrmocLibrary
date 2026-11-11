import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { env } from '../../config/env.js'
import { authenticateJwt } from '../auth/jwt-auth.middleware.ts'
import { createPaymentsRouters } from './payments.routes.ts'
import type { createPaymentsService } from './payments.service.ts'

function token(role: string, accountId = 1) {
  return jwt.sign({accountId,schoolId:'QA-PAYMENT-001',role,authVersion:1},env.jwt.secret,
    {issuer:env.jwt.issuer,audience:env.jwt.audience,expiresIn:60})
}

test('payment routes require authentication and separate borrower, staff and Librarian permissions', async () => {
  let feeWrites = 0
  const service = {
    quote:async()=>({state:'Quoted'}),prepare:async()=>({state:'Prepared'}),read:async()=>({state:'Prepared'}),
    list:async()=>({items:[]}),setFee:async()=>{feeWrites++;return {feeRuleId:1}},
  } as unknown as ReturnType<typeof createPaymentsService>
  const routers = createPaymentsRouters(service)
  const app = express().use(express.json()).use(authenticateJwt)
    .use('/user',routers.user).use('/admin',routers.admin)
  assert.equal((await request(app).post('/user/quote').send({})).status,401)
  assert.equal((await request(app).post('/user/quote').auth(token('Staff'),{type:'bearer'}).send({})).status,403)
  assert.equal((await request(app).post('/user/quote').auth(token('Student'),{type:'bearer'}).send({})).status,200)
  assert.equal((await request(app).get('/admin').auth(token('Staff'),{type:'bearer'})).status,200)
  assert.equal((await request(app).put('/admin/fee-rules').auth(token('Staff'),{type:'bearer'}).send({})).status,403)
  assert.equal((await request(app).put('/admin/fee-rules').auth(token('Student'),{type:'bearer'}).send({})).status,403)
  assert.equal((await request(app).put('/admin/fee-rules').auth(token('Librarian'),{type:'bearer'}).send({})).status,200)
  assert.equal(feeWrites,1)
})

test('a prepared checkout is returned without claiming a provider payment exists', async () => {
  const service = {prepare:async()=>({state:'Prepared',gatewayConnected:false})} as unknown as ReturnType<typeof createPaymentsService>
  const {user} = createPaymentsRouters(service)
  const response = await request(express().use(express.json()).use(authenticateJwt).use(user))
    .post('/checkout').auth(token('Student'),{type:'bearer'}).send({})
  assert.equal(response.status,202)
  assert.equal(response.body.data.gatewayConnected,false)
  assert.equal(response.headers['cache-control'],'private, no-store')
})

test('payment writes have a per-account limit that cannot be reset with a new request body', async () => {
  let quotes = 0
  const service = {quote:async()=>{quotes++;return {state:'Quoted'}}} as unknown as ReturnType<typeof createPaymentsService>
  const {user} = createPaymentsRouters(service)
  const app = express().use(express.json()).use(authenticateJwt).use(user)
  const student = token('Student')
  for (let attempt=0;attempt<20;attempt++) {
    assert.equal((await request(app).post('/quote').auth(student,{type:'bearer'}).send({attempt})).status,200)
  }
  const limited = await request(app).post('/quote').auth(student,{type:'bearer'}).send({attempt:21})
  assert.equal(limited.status,429)
  assert.equal(limited.body.code,'PAYMENT_RATE_LIMIT')
  assert.equal(quotes,20)
  assert.equal((await request(app).post('/quote').auth(token('Student',2),{type:'bearer'}).send({})).status,200)
})
