import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { env } from '../../config/env.js'
import { authenticateJwt } from '../auth/jwt-auth.middleware.ts'
import { createPaymentsRouters } from './payments.routes.ts'
import { ACCESS_COOKIE } from '../auth/jwt-auth.middleware.ts'
import type { createPaymentsService } from './payments.service.ts'
import type { createPaymentGatewayService } from './payments.gateway.ts'

function token(role: string, accountId = 1) {
  return jwt.sign({accountId,schoolId:'QA-PAYMENT-001',role,authVersion:1},env.jwt.secret,
    {issuer:env.jwt.issuer,audience:env.jwt.audience,expiresIn:60})
}

test('demo checkout requires borrower authentication and CSRF and is disabled without the local preview',async()=>{
  const {user}=createPaymentsRouters({} as never)
  const app=express().use(express.json()).use(authenticateJwt).use(user)
  app.use((error:any,_request:express.Request,response:express.Response,_next:express.NextFunction)=>{response.status(error.status??500).json({code:error.code})})
  assert.equal((await request(app).post('/demo-checkout').send({})).status,401)
  for(const role of ['Staff','Librarian','Admin']) assert.equal((await request(app).post('/demo-checkout').auth(token(role),{type:'bearer'}).send({})).status,403)
  const cookie=await request(app).post('/demo-checkout').set('Cookie',ACCESS_COOKIE+'='+token('Student')).send({})
  assert.equal(cookie.status,403);assert.equal(cookie.body.code,'INVALID_CSRF_TOKEN')
  const disabled=await request(app).post('/demo-checkout').auth(token('Student'),{type:'bearer'}).send({})
  assert.equal(disabled.status,503);assert.equal(disabled.body.code,'DEMO_WALLET_DISABLED')
})

test('all money-out routes reject Student, Faculty and Staff; cookie writes require CSRF',async()=>{
  const {admin}=createPaymentsRouters({} as never)
  const app=express().use(express.json()).use(authenticateJwt).use('/admin',admin)
  const routes=[['get','/admin/funds'],['get','/admin/00000000-0000-4000-8000-000000000001/refunds'],
    ['post','/admin/funds/beneficiaries'],['post','/admin/funds/sample-bank'],['post','/admin/funds/withdrawals'],['post','/admin/funds/recover'],
    ['post','/admin/funds/practice-transfers'],['post','/admin/funds/practice-transfers/00000000-0000-4000-8000-000000000001/confirm'],
    ['post','/admin/funds/practice-transfers/00000000-0000-4000-8000-000000000001/cancel'],
    ['post','/admin/funds/transfer-fee'],['post','/admin/funds/void'],['post','/admin/funds/00000000-0000-4000-8000-000000000001/confirm'],
    ['post','/admin/funds/00000000-0000-4000-8000-000000000001/check'],['post','/admin/funds/00000000-0000-4000-8000-000000000001/cancel']]
  for(const role of ['Student','Faculty','Staff','Admin'])for(const [method,path]of routes){
    const response=method==='get'?await request(app).get(path).auth(token(role),{type:'bearer'}):await request(app).post(path).auth(token(role),{type:'bearer'}).send({})
    assert.equal(response.status,403,role+' '+method+' '+path)
  }
  const response=await request(app).post('/admin/funds/withdrawals').set('Cookie',ACCESS_COOKIE+'='+token('Librarian')).send({})
  assert.equal(response.status,403);assert.equal(response.body.code,'INVALID_CSRF_TOKEN')
  for (const path of ['/funds/sample-bank','/funds/practice-transfers','/funds/practice-transfers/00000000-0000-4000-8000-000000000001/confirm','/funds/practice-transfers/00000000-0000-4000-8000-000000000001/cancel']) {
    const blocked=await request(app).post('/admin'+path).set('Cookie',ACCESS_COOKIE+'='+token('Librarian')).send({})
    assert.equal(blocked.status,403);assert.equal(blocked.body.code,'INVALID_CSRF_TOKEN')
  }
})

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

test('borrowers can read only their own payment overview through the user route',async()=>{
  let actorId=0
  const service={userList:async(actor:{accountId:number})=>{actorId=actor.accountId;return {items:[],pagination:{page:1,limit:25,total:0}}}} as unknown as ReturnType<typeof createPaymentsService>
  const {user}=createPaymentsRouters(service)
  const app=express().use(authenticateJwt).use(user)
  assert.equal((await request(app).get('/?accountId=999').auth(token('Staff'),{type:'bearer'})).status,403)
  const response=await request(app).get('/?accountId=999').auth(token('Student',7),{type:'bearer'})
  assert.equal(response.status,200);assert.equal(actorId,7)
  assert.equal(response.headers['cache-control'],'private, no-store')
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

test('checkout and check routes use the gateway behind borrower authentication', async () => {
  let checked = 0
  const gateway = {checkout:async()=>({state:'Active',gatewayConnected:true}),check:async(actor: {accountId:number},id: string)=>{
    assert.equal(actor.accountId,1);assert.equal(id,'fixture-id');checked++;return {state:'Succeeded'}
  }} as unknown as ReturnType<typeof createPaymentGatewayService>
  const {user} = createPaymentsRouters({} as ReturnType<typeof createPaymentsService>,gateway)
  const app = express().use(express.json()).use(authenticateJwt).use(user)
  assert.equal((await request(app).post('/checkout').auth(token('Student'),{type:'bearer'}).send({})).body.data.gatewayConnected,true)
  assert.equal((await request(app).post('/fixture-id/check').send({})).status,401)
  assert.equal((await request(app).post('/fixture-id/check').auth(token('Staff'),{type:'bearer'}).send({})).status,403)
  assert.equal((await request(app).post('/fixture-id/check').auth(token('Student'),{type:'bearer'}).send({})).status,200)
  assert.equal(checked,1)
})

test('settlement and recovery controls require Librarian permission and cookie CSRF protection',async()=>{
  let writes=0
  const operations={status:async()=>({}),recover:async()=>{writes++;return {}},settlement:async()=>{writes++;return {}},readSettlement:async()=>null} as never
  const {admin}=createPaymentsRouters({} as ReturnType<typeof createPaymentsService>,undefined,operations)
  const app=express().use(express.json()).use(authenticateJwt).use(admin)
  for(const role of ['Student','Faculty','Staff']){
    assert.equal((await request(app).get('/operations').auth(token(role),{type:'bearer'})).status,403)
    assert.equal((await request(app).post('/fixture/settlement').auth(token(role),{type:'bearer'}).send({})).status,403)
    assert.equal((await request(app).post('/recover').auth(token(role),{type:'bearer'}).send({})).status,403)
  }
  assert.equal((await request(app).post('/recover').auth(token('Librarian'),{type:'bearer'}).send({})).status,200)
  const cookie=express().use(express.json()).use((_request,response,next)=>{response.locals.authenticatedUser={role:'Librarian',accountId:3};response.locals.authenticationType='session';next()}).use(admin)
  assert.equal((await request(cookie).post('/recover').send({})).status,403)
  assert.equal(writes,1)
})
