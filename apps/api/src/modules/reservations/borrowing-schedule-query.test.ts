import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { queryBorrowingSchedules } from './borrowing-schedule-query.ts'
import { createAdminBorrowingScheduleRouter } from './borrowing-schedule.routes.ts'

test('staff schedule query is read-only, filters and paginates pending schedules by pickup date',async()=>{
 const pg=new PGlite();let writes=0
 try {
  await pg.exec(`CREATE TABLE users(user_id BIGINT PRIMARY KEY,full_name TEXT,school_id TEXT,user_role TEXT);
   CREATE TABLE titles(title_id BIGINT PRIMARY KEY,title TEXT);
   CREATE TABLE borrowing_schedules(schedule_id BIGINT PRIMARY KEY,user_id BIGINT,title_id BIGINT,pickup_date DATE,status TEXT,created_at TIMESTAMPTZ,last_reason TEXT);
   CREATE TABLE library_operating_schedule(day_of_week INT,is_open BOOLEAN,opens_at TIME,closes_at TIME);
   CREATE TABLE library_closed_days(closed_date DATE);
   CREATE TABLE academic_terms(academic_term_id BIGINT PRIMARY KEY,ends_on DATE,is_active INT);
   CREATE TABLE enrollment_semesters(semester_id BIGINT PRIMARY KEY,end_date DATE,started_at TIMESTAMPTZ,ended_at TIMESTAMPTZ);
   INSERT INTO library_operating_schedule SELECT n,true,'07:00','17:00' FROM generate_series(1,6) n;
   INSERT INTO users VALUES(1,'Sample Student','SAMPLE-1','Student'),(2,'Sample Faculty','SAMPLE-2','Faculty');
   INSERT INTO titles VALUES(10,'Sample book'),(20,'Another book');
   INSERT INTO borrowing_schedules VALUES(1,1,10,'2026-11-21','scheduled',NOW(),NULL),(2,2,20,'2026-11-20','scheduled',NOW(),'No copy is available yet.'),(3,1,20,'2026-11-22','prepared',NOW(),NULL);`)
  const pool={execute:async(sql:string,values:unknown[]=[])=>{if(!/^\s*SELECT/i.test(sql))writes++;const r=await pg.query(toPgPlaceholders(sql),values);return [r.rows]}} as unknown as Pool
  const first=await queryBorrowingSchedules(pool,{limit:1},new Date('2026-11-19T02:00:00Z'))
  assert.equal(first.pagination.total,2);assert.equal(first.items[0].userRole,'Faculty');assert.equal(first.items[0].pickupDate,'2026-11-20')
  assert.equal(first.items[0].preparationStartsAt,'2026-11-18T23:00:00.000Z')
  assert.equal((await queryBorrowingSchedules(pool,{page:2,limit:1})).items[0].scheduleId,1)
  assert.equal((await queryBorrowingSchedules(pool,{role:'Student',dateFrom:'2026-11-21',dateTo:'2026-11-21',user:'SAMPLE-1'})).pagination.total,1)
  assert.equal((await queryBorrowingSchedules(pool,{user:"' OR 1=1 --"})).pagination.total,0)
  await assert.rejects(queryBorrowingSchedules(pool,{dateFrom:'2026-02-30'}),{code:'RESERVATION_FILTER_INVALID'})
  assert.equal(writes,0)
 } finally{await pg.close()}
})
test('only Librarian and Staff may read the administrative schedule listing',async()=>{
 let reads=0
 const query=async()=>{reads++;return {available:true,items:[],pagination:{page:1,limit:25,pages:0,total:0}}}
 for(const role of ['Student','Faculty','Staff','Librarian','Admin','']){
  const app=express();app.use((_req,res,next)=>{res.locals.authenticatedUser=role?{id:1,role}:undefined;next()});app.use('/schedules',createAdminBorrowingScheduleRouter(query))
  await request(app).get('/schedules').expect(['Staff','Librarian'].includes(role)?200:403)
  await request(app).post('/schedules').expect(404)
 }
 assert.equal(reads,2)
})
