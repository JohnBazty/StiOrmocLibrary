import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import {requireLibraryPermission} from '../auth/jwt-auth.middleware.ts'
import {collectionReviewRouter} from './collection-review.routes.ts'
test('Staff, Student, Faculty and recovery Admin cannot read, export or mutate collection review',async()=>{
 for(const role of ['Staff','Student','Faculty','Admin']){const app=express();app.use(express.json());app.use((r,s,n)=>{s.locals.authenticatedUser={accountId:1,role};n()});app.use('/review',requireLibraryPermission('library.manage'),collectionReviewRouter)
  for(const path of ['/review','/review/report?format=pdf']){const response=await request(app).get(path);assert.equal(response.status,403);assert.equal(response.body.code,'JWT_ROLE_FORBIDDEN')}
  for(const path of ['/review/reference','/review/requirements','/review/titles/1/decisions'])assert.equal((await request(app).post(path).send({})).status,403)
 }
})
