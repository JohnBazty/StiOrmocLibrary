import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { authenticateJwt, ACCESS_COOKIE } from '../auth/jwt-auth.middleware.ts'
import { createAttendanceConfirmationRouters } from './attendance-confirmation.routes.ts'

test('attendance handoff routes require scanner roles, owner identity and cookie CSRF',async()=>{
  const calls:unknown[][]=[]
  const service=Object.fromEntries(['create','read','pending','confirm','cancel'].map(name=>[name,async(...args:unknown[])=>{calls.push([name,...args]);return {request:null}}]))
  const routers=createAttendanceConfirmationRouters(service as never)
  const app=express().use(express.json()).use(authenticateJwt).use('/scanner',routers.scanner).use('/user',routers.user)
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.status??500).json({code:error.code}))
  const token=(role:string)=>jwt.sign({accountId:7,schoolId:'QA-7',role,authVersion:1},env.jwt.secret,{issuer:env.jwt.issuer,audience:env.jwt.audience,expiresIn:60})
  assert.equal((await request(app).get('/user/pending')).status,401)
  assert.equal((await request(app).post('/scanner').auth(token('Student'),{type:'bearer'}).send({})).status,403)
  assert.equal((await request(app).post('/scanner').auth(token('Faculty'),{type:'bearer'}).send({})).status,403)
  assert.equal((await request(app).post('/user/id/confirm').set('Cookie',ACCESS_COOKIE+'='+token('Student')).send({purpose:'Study'})).status,403)
  assert.equal(calls.length,0)
  assert.equal((await request(app).post('/scanner').auth(token('Staff'),{type:'bearer'}).send({qr_payload:'pass',request_id:'key'})).status,200)
  const pending=await request(app).get('/user/pending?accountId=999').auth(token('Student'),{type:'bearer'})
  assert.equal(pending.status,200);assert.equal(pending.headers['cache-control'],'private, no-store')
  assert.deepEqual(calls.at(-1),['pending',7])
  assert.equal((await request(app).post('/user/id/confirm').auth(token('Student'),{type:'bearer'}).send({purpose:'Study'})).status,200)
  assert.deepEqual(calls.at(-1),['confirm',7,'id',{purpose:'Study'}])
})
