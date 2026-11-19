import assert from 'node:assert/strict'
import test from 'node:test'
import express, { type ErrorRequestHandler } from 'express'
import request from 'supertest'
import { selfProfileRouter } from './users.routes.ts'

test('crafted self-profile edits are forbidden for every portal role', async () => {
 for(const role of ['Student','Faculty','Librarian','Staff','Admin']) {
  const app=express();app.use(express.json());app.use((_request,response,next)=>{response.locals.authenticatedUser={accountId:9,role};next()})
  app.use('/profile',selfProfileRouter)
  app.use(((error,_request,response,_next)=>{response.status(error.status??500).json({code:error.code})}) as ErrorRequestHandler)
  const response=await request(app).patch('/profile/me').send({accountId:2,first_name:'New',last_name:'Name',program_strand:'BSIT',year_grade_level:'4th Year'})
  assert.equal(response.status,403);assert.equal(response.body.code,'USER_PROFILE_READ_ONLY')
 }
})
