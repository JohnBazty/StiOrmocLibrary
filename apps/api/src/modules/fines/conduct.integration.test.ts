import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import type { Pool } from '../../config/db.js'
import { createConductService, conductInput } from './conduct.service.ts'

test('conduct validation rejects invalid amounts, dates and categories',()=>{
  const input={schoolId:'TEST-ONLY',category:'Noise',details:'Synthetic incident only',incidentAt:'2026-01-01T03:00:00Z'}
  for(const amount of [-1,0,1.001,Infinity])assert.throws(()=>conductInput({...input,amount}))
  assert.throws(()=>conductInput({...input,category:'Unknown'}))
  assert.throws(()=>conductInput({...input,incidentAt:'invalid'}))
})

test('real Postgres migration, lifetime warnings, reviewed fine, retries and owner privacy',async()=>{
 const pg=new PGlite()
 try {
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE users(user_id BIGINT PRIMARY KEY,full_name TEXT,school_id TEXT,user_role TEXT,account_status TEXT);
 CREATE TABLE accounts(account_id BIGINT PRIMARY KEY,user_id BIGINT,school_id TEXT);
 CREATE TABLE fines(fine_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,transaction_id BIGINT,user_id BIGINT,fine_type TEXT,fine_amount NUMERIC,payment_status TEXT,calculation_basis TEXT,overdue_units INTEGER,rate_applied NUMERIC,applied_date TIMESTAMP,finalized_at TIMESTAMP,notes TEXT,updated_at TIMESTAMP);
 CREATE TABLE fine_infractions(fine_id BIGINT,category TEXT,incident_at TIMESTAMPTZ,incident_location TEXT,details TEXT,issued_by_user_id BIGINT);
 CREATE TABLE borrow_transactions(user_id BIGINT,transaction_status TEXT,lost_confirmed_at TIMESTAMP);
 CREATE TABLE lost_book_reports(user_id BIGINT,report_status TEXT,replacement_charge NUMERIC,payment_status TEXT);
 CREATE TABLE clearance_statuses(user_id BIGINT PRIMARY KEY,standing_status TEXT,reason_block_details TEXT,last_checked_at TIMESTAMP,updated_at TIMESTAMP);
 CREATE TABLE notifications(user_id BIGINT,message_title TEXT,message_body TEXT,trigger_type TEXT,source_type TEXT,source_id BIGINT,action_path TEXT,priority TEXT,dedupe_key TEXT,scheduled_for TIMESTAMP,delivered_at TIMESTAMP,UNIQUE(user_id,dedupe_key));
 INSERT INTO users VALUES(1,'Synthetic Librarian','LIB-TEST','Librarian','Active'),(2,'Synthetic Student','STU-TEST','Student','Active'),(3,'Synthetic Other','OTHER-TEST','Student','Active');
 INSERT INTO accounts VALUES(1,1,'LIB-TEST'),(2,2,'STU-TEST'),(3,3,'OTHER-TEST');`)
 await pg.exec(readFileSync(new URL('../../../../../database/supabase/056_conduct_records.sql',import.meta.url),'utf8'))
 const execute=async(sql:string,values:unknown[]=[])=>{
   const write=/^\s*(INSERT|UPDATE|DELETE)/i.test(sql);let q=toPgPlaceholders(sql)
   if(/^\s*INSERT/i.test(sql)&&! /RETURNING/i.test(sql))q+=' RETURNING *'
   const result=await pg.query<Record<string,unknown>>(q,values)
   return write?[{insertId:Number(Object.values(result.rows[0]??{})[0]??0),affectedRows:result.affectedRows,rows:result.rows}]:[result.rows]
 }
 const pool={execute,getConnection:async()=>({execute,beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){}})} as unknown as Pool
 const service=createConductService(pool),actor={accountId:1,role:'Librarian'}
 const input={schoolId:'STU-TEST',category:'Noise',details:'Synthetic incident for verification',incidentAt:'2026-01-01T03:00:00Z',priorWarnings:0,reviewReason:'Verified synthetic new entrant',amount:25}
 await assert.rejects(service.preview({accountId:2,role:'Student'},input))
 await assert.rejects(service.preview(actor,{...input,priorWarnings:undefined}))
 const stale=await service.preview(actor,input)
 for(const action of ['First warning','Second warning','Final warning','Eligible for fine review']){
   const preview=await service.preview(actor,input);assert.equal(preview.action,action)
   const body={...input,reviewToken:preview.reviewToken,requestKey:randomUUID()}
   const saved=await service.record(actor,body)
   if(action!=='Eligible for fine review'){assert.equal((await pg.query('SELECT * FROM fines')).rows.length,0);assert.equal((await pg.query('SELECT * FROM clearance_statuses')).rows.length,0)}
   assert.equal(saved.action,action==='Eligible for fine review'?'Fine issued':action)
   assert.equal((await service.record(actor,body)).incident_id,saved.incident_id)
   await assert.rejects(service.record(actor,{...body,details:'Changed synthetic payload'}))
 }
 assert.equal((await pg.query('SELECT * FROM fines')).rows.length,1)
 assert.equal((await pg.query('SELECT * FROM notifications')).rows.length,4)
 assert.equal((await pg.query('SELECT * FROM conduct_students')).rows.length,1)
 assert.equal((await service.preview(actor,{...input,priorWarnings:0})).action,'Eligible for fine review')
 await assert.rejects(service.record(actor,{...input,reviewToken:stale.reviewToken,requestKey:randomUUID()}))
 assert.equal((await service.preview(actor,{...input,category:'Eating or food'})).action,'First warning')
 assert.equal((await service.list({accountId:3,role:'Student'},{},true)).items.length,0)
 assert.equal((await service.list({accountId:2,role:'Student'},{},true)).items.length,4)
 await service.event(actor,1,{type:'Correction',reason:'Synthetic correction preserves facts'})
 await assert.rejects(service.event(actor,1,{type:'Voided',reason:'Synthetic review of earlier warning'}))
 await assert.rejects(service.event(actor,4,{type:'Voided',reason:'Synthetic linked fine must be retained'}))
 assert.equal((await pg.query<{standing_status:string}>('SELECT standing_status FROM clearance_statuses')).rows[0].standing_status,'Not Cleared')
 const security=await pg.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE relname IN ('conduct_students','conduct_incidents','conduct_events')")
 assert.equal(security.rows.length,3);assert.ok(security.rows.every(r=>r.relrowsecurity))
 await assert.rejects(pg.exec('UPDATE conduct_students SET prior_warnings=0'))
 await assert.rejects(pg.exec('DELETE FROM conduct_events'))
 await pg.exec('SET ROLE anon');await assert.rejects(pg.exec('SELECT * FROM conduct_incidents'));await pg.exec('RESET ROLE')
 } finally {await pg.close()}
})
