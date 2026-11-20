import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { borrowerEligibilityRows } from '../attendance/attendance-test-fixtures.ts'
import { createBorrowingScheduleService } from './borrowing-schedule.service.ts'

async function fixture(role='Student') {
 const pg=new PGlite()
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE users(user_id BIGINT PRIMARY KEY,user_role TEXT,email TEXT);
 CREATE TABLE accounts(account_id BIGINT PRIMARY KEY,user_id BIGINT,role TEXT,account_status TEXT);
 CREATE TABLE titles(title_id BIGINT PRIMARY KEY,title TEXT,record_type TEXT DEFAULT 'Book',lifecycle_status TEXT DEFAULT 'Active');
 CREATE TABLE materials(material_id BIGINT PRIMARY KEY,title TEXT,availability_status TEXT,updated_at TIMESTAMP);
 CREATE TABLE library_profile_settings(settings_id INT PRIMARY KEY,seat_capacity INT DEFAULT 80); INSERT INTO library_profile_settings(settings_id) VALUES(1);
 CREATE TABLE library_operating_schedule(day_of_week INT,is_open BOOLEAN,opens_at TIME,closes_at TIME);
 INSERT INTO library_operating_schedule SELECT d,true,'07:00','17:00' FROM generate_series(1,6) d;
 CREATE TABLE library_closed_days(closed_date DATE);
 CREATE TABLE academic_terms(academic_term_id BIGINT PRIMARY KEY,academic_year TEXT,term_name TEXT,starts_on DATE,ends_on DATE,is_active INT);
 CREATE TABLE enrollment_semesters(semester_id BIGINT PRIMARY KEY,academic_year TEXT,term_name TEXT,end_date DATE,started_at TIMESTAMPTZ,ended_at TIMESTAMPTZ);
 INSERT INTO academic_terms VALUES(1,'2026-2027','First semester','2026-08-01','2026-12-19',1);
 CREATE TABLE reservations(reservation_id BIGSERIAL PRIMARY KEY,user_id BIGINT,material_id BIGINT,book_title_id BIGINT,borrowing_policy_version_id BIGINT,request_kind TEXT,queue_position INT,reservation_status TEXT,reserved_at TIMESTAMP,assigned_physical_copy_id BIGINT,accession_id BIGINT,preparation_started_at TIMESTAMP,pickup_deadline TIMESTAMP,updated_at TIMESTAMP);
 CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,title_id BIGINT,material_id BIGINT,barcode TEXT,shelf_location TEXT,lifecycle_status TEXT DEFAULT 'Active',condition_status TEXT DEFAULT 'Good',availability_status TEXT DEFAULT 'Available',row_version INT DEFAULT 1,updated_at TIMESTAMP);
 CREATE TABLE borrow_transactions(transaction_id BIGSERIAL PRIMARY KEY,user_id BIGINT,material_id BIGINT,physical_copy_id BIGINT,reservation_id BIGINT,transaction_status TEXT,cancelled_at TIMESTAMP,cancelled_by_user_id BIGINT,cancellation_reason TEXT,updated_at TIMESTAMP);
 CREATE TABLE in_library_uses(physical_copy_id BIGINT,ended_at TIMESTAMP);
 CREATE TABLE book_request_events(event_id BIGSERIAL PRIMARY KEY,reservation_id BIGINT,event_status TEXT,physical_copy_id BIGINT,occurred_at TIMESTAMP,pickup_deadline TIMESTAMP,UNIQUE NULLS NOT DISTINCT(reservation_id,event_status,physical_copy_id));
 CREATE TABLE notifications(user_id BIGINT,message_title TEXT,message_body TEXT,trigger_type TEXT,source_type TEXT,source_id BIGINT,action_path TEXT,priority TEXT,dedupe_key TEXT,scheduled_for TIMESTAMP,delivered_at TIMESTAMP,UNIQUE(user_id,dedupe_key));
 CREATE TABLE book_request_email_deliveries(event_id BIGINT,recipient TEXT,subject TEXT,message_body TEXT,status TEXT);
 CREATE TABLE admin_notifications(event_type TEXT,actor_user_id BIGINT,reservation_id BIGINT,book_title_id BIGINT,message_title TEXT,message_body TEXT);
 INSERT INTO users VALUES(7,'${role}',NULL),(8,'Student',NULL);
 INSERT INTO accounts VALUES(7,7,'${role}','Active'),(8,8,'Student','Active');
 INSERT INTO titles VALUES(2,'Sample book','Book','Active'),(3,'Another book','Book','Active'),(4,'Third book','Book','Active');
 INSERT INTO materials VALUES(20,'Sample book','Available',NOW()),(30,'Another book','Available',NOW()),(40,'Third book','Available',NOW());
 INSERT INTO physical_copies(physical_copy_id,title_id,material_id,barcode) VALUES(20,2,20,'BOOK-20'),(30,3,30,'BOOK-30'),(40,4,40,'BOOK-40');`)
 for(const file of ['068_reservation_skip_and_audit.sql','070_reservation_settings.sql','071_scheduled_borrowing.sql']) await pg.exec(await readFile(new URL('../../../../../database/supabase/'+file,import.meta.url),'utf8'))
 const state={now:new Date('2026-11-19T02:00:00Z'),blocked:false,transactions:0}
 const execute=async(sql:string,values:readonly unknown[]=[])=>{
   if(sql.includes('FROM borrowing_policy_versions')) return [[{borrowing_policy_version_id:1,student_max_active_books:2,faculty_max_active_books:null,student_max_active_reservations:2,faculty_max_active_reservations:null}]]
   if(sql.includes('FROM borrowing_policy_material_rules')) return [[{is_borrowable:true}]]
   const eligible=borrowerEligibilityRows(sql,role,7)
   if(sql.includes('FROM users u LEFT JOIN accounts')) return [[{user_id:7,school_id:'TEST-7',user_role:role,account_id:7,account_status:state.blocked?'Deactivated':'Active',login_status:'Active'}]]
   if(eligible && !/library_(operating_schedule|closed_days|profile_settings)/.test(sql)) return [eligible]
   let query=toPgPlaceholders(sql)
   if(/^\s*INSERT/i.test(sql)&&! /RETURNING/i.test(sql))query+=' RETURNING *'
   const result=await pg.query<Record<string,unknown>>(query,[...values])
   return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)?[{affectedRows:result.affectedRows??0,insertId:Object.values(result.rows[0]??{})[0],rows:result.rows}]:[result.rows]
 }
 const q={execute,query:execute,beginTransaction:()=>{state.transactions++;return pg.exec('BEGIN')},commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){}}
 const pool={execute,query:execute,getConnection:async()=>q} as unknown as Pool
 return {pg,state,service:createBorrowingScheduleService(pool,()=>state.now)}
}
test('schedule dates run to the end of the current semester and nothing later is accepted',async()=>{
 const {pg,service}=await fixture()
 try {
  const {dates,semesterEnd}=await service.dates()
  assert.equal(semesterEnd,'2026-12-19')
  assert.equal(dates.at(-1),'2026-12-19')
  assert.ok(dates.includes('2026-12-01'))
  await pg.exec("UPDATE academic_terms SET ends_on='2026-12-31'; INSERT INTO enrollment_semesters VALUES(5,'2026-2027','First semester','2026-12-12','2026-08-01',NULL)")
  assert.equal((await service.dates()).semesterEnd,'2026-12-12')
  await assert.rejects(service.create(7,{titleId:2,pickupDate:'2026-12-15',clientRequestId:'schedule-request-late1'}),{code:'SCHEDULE_DATE_INVALID'})
  await pg.exec("DELETE FROM enrollment_semesters; UPDATE academic_terms SET is_active=0")
  assert.deepEqual((await service.dates()).dates,[])
 } finally { await pg.close() }
})
const body=(titleId=2,key='schedule-request-0001')=>({titleId,pickupDate:'2026-11-24',clientRequestId:key})
for(const role of ['Student','Faculty'])test(role+' can schedule with an active loan; two pending schedules, idempotency and ownership are enforced',async()=>{
 const {pg,service}=await fixture(role)
 try {
  await pg.exec("INSERT INTO borrow_transactions(user_id,material_id,physical_copy_id,transaction_status) VALUES(7,40,40,'Borrowed')")
  const first=await service.create(7,body())
  assert.equal((await service.create(7,body())).scheduleId,first.scheduleId)
  await service.create(7,body(3,'schedule-request-0002'))
  await assert.rejects(service.create(7,body(4,'schedule-request-0003')),{code:'SCHEDULE_LIMIT_REACHED'})
  await assert.rejects(service.cancel(8,first.scheduleId),{code:'SCHEDULE_NOT_FOUND'})
  assert.equal((await pg.query("SELECT * FROM reservations")).rows.length,0)
  await service.cancel(7,first.scheduleId)
  assert.equal((await service.list(7)).filter(r=>r.status==='scheduled').length,1)
 } finally {await pg.close()}
})
test('preparation honors the window, rechecks slots, assigns once and preserves pickup closing',async()=>{
 const {pg,state,service}=await fixture()
 try {
  await service.create(7,body())
  await service.process()
  assert.equal((await pg.query('SELECT * FROM reservations')).rows.length,0)
  state.now=new Date('2026-11-23T02:00:00Z');state.blocked=true
  await service.process();assert.equal((await pg.query('SELECT * FROM reservations')).rows.length,0)
  state.blocked=false;await service.process();await service.process()
  const rows=(await pg.query<any>('SELECT * FROM reservations')).rows
  assert.equal(rows.length,1);assert.equal(rows[0].assigned_physical_copy_id,20)
  assert.equal(rows[0].reservation_status,'approved')
  assert.equal(rows[0].pickup_deadline.toISOString(),'2026-11-24T09:00:00.000Z')
  assert.equal((await service.list(7))[0].status,'prepared')
 } finally {await pg.close()}
})
test('full student commitments and full ordinary queue retain schedules for retry',async()=>{
 const {pg,state,service}=await fixture()
 try {
  await service.create(7,body());state.now=new Date('2026-11-23T02:00:00Z')
  await pg.exec("INSERT INTO borrow_transactions(user_id,material_id,physical_copy_id,transaction_status) VALUES(7,30,30,'Borrowed'),(7,40,40,'Borrowed')")
  await service.process();assert.equal((await service.list(7))[0].status,'scheduled')
  await pg.exec("DELETE FROM borrow_transactions; INSERT INTO reservations(user_id,material_id,book_title_id,request_kind,queue_position,reservation_status,reserved_at) VALUES(8,20,2,'Reservation',1,'pending',NOW())")
  await service.process()
  assert.equal((await service.list(7))[0].status,'scheduled')
  assert.equal((await pg.query<any>('SELECT user_id FROM reservations WHERE assigned_physical_copy_id=20')).rows[0].user_id,8)
 } finally {await pg.close()}
})
test('closure cancels held requests and releases copies even if staff never mark ready',async()=>{
 const {pg,state,service}=await fixture()
 try {
  await service.create(7,body());state.now=new Date('2026-11-23T02:00:00Z');await service.process()
  await pg.exec("INSERT INTO library_closed_days VALUES('2026-11-24')")
  await service.process();await service.process()
  assert.equal((await pg.query<any>('SELECT reservation_status FROM reservations')).rows[0].reservation_status,'cancelled')
  assert.equal((await pg.query<any>('SELECT availability_status FROM physical_copies WHERE physical_copy_id=20')).rows[0].availability_status,'Available')
 } finally {await pg.close()}
})
test('missed dates become unfulfilled without entering the ordinary waitlist',async()=>{
 const {pg,state,service}=await fixture()
 try {
  await service.create(7,body());state.now=new Date('2026-11-24T09:00:00Z');await service.process()
  assert.equal((await service.list(7))[0].status,'unfulfilled')
  assert.equal((await pg.query('SELECT * FROM reservations')).rows.length,0)
 } finally {await pg.close()}
})
test('malformed dates, duplicate titles, conflicting keys, same-title loans and staff scheduling are rejected',async()=>{
 const {pg,service}=await fixture()
 try {
  for(const pickupDate of ['2026-11-19','2026-11-22','2026-12-21','2026-02-30','invalid'])await assert.rejects(service.create(7,{...body(),pickupDate}),{code:'SCHEDULE_DATE_INVALID'})
  await service.create(7,body())
  await assert.rejects(service.create(7,body(2,'schedule-request-0002')),{code:'SCHEDULE_ALREADY_EXISTS'})
  await assert.rejects(service.create(7,{...body(),pickupDate:'2026-11-25'}),{code:'REQUEST_KEY_REUSED'})
  await pg.exec("INSERT INTO borrow_transactions(user_id,material_id,physical_copy_id,transaction_status) VALUES(7,30,30,'Borrowed')")
  await assert.rejects(service.create(7,body(3,'schedule-request-0003')),{code:'BOOK_ALREADY_IN_ACCOUNT'})
  await pg.exec("UPDATE accounts SET role='Staff' WHERE account_id=7")
  await assert.rejects(service.create(7,body(4,'schedule-request-0004')),{code:'REQUEST_ROLE_FORBIDDEN'})
 } finally {await pg.close()}
})
test('closing expires an assigned but unready hold; a missing copy retries without early allocation',async()=>{
 const {pg,state,service}=await fixture()
 try {
  await service.create(7,body());state.now=new Date('2026-11-23T02:00:00Z')
  await pg.exec("UPDATE physical_copies SET availability_status='Unavailable' WHERE physical_copy_id=20")
  await service.process();assert.equal((await service.list(7))[0].status,'scheduled')
  await pg.exec("UPDATE physical_copies SET availability_status='Available' WHERE physical_copy_id=20")
  await service.process();state.now=new Date('2026-11-24T09:00:00Z');await service.process()
  assert.equal((await pg.query<any>('SELECT reservation_status FROM reservations')).rows[0].reservation_status,'expired')
  assert.equal((await pg.query<any>('SELECT availability_status FROM physical_copies WHERE physical_copy_id=20')).rows[0].availability_status,'Available')
 } finally {await pg.close()}
})
test('a changed closing time extends or shortens scheduled holds without changing ordinary deadlines',async()=>{
 const {pg,state,service}=await fixture()
 try {
  await service.create(7,body());state.now=new Date('2026-11-23T02:00:00Z');await service.process()
  await pg.exec("UPDATE library_operating_schedule SET closes_at='19:00' WHERE day_of_week=2")
  state.now=new Date('2026-11-24T09:00:00Z');await service.process()
  let r=(await pg.query<any>('SELECT * FROM reservations')).rows[0]
  assert.equal(r.reservation_status,'approved');assert.equal(r.pickup_deadline.toISOString(),'2026-11-24T11:00:00.000Z')
  await pg.exec("UPDATE library_operating_schedule SET closes_at='16:00' WHERE day_of_week=2")
  await service.process();r=(await pg.query<any>('SELECT * FROM reservations')).rows[0]
  assert.equal(r.reservation_status,'expired')
 } finally {await pg.close()}
})
test('bounded batches persist a cursor and release the circulation lock per schedule',async()=>{
 const {pg,state,service}=await fixture()
 try {
  state.now=new Date('2026-11-23T02:00:00Z')
  await pg.exec("UPDATE physical_copies SET availability_status='Unavailable'; INSERT INTO users(user_id,user_role) SELECT n,'Student' FROM generate_series(100,124) n; INSERT INTO borrowing_schedules(user_id,title_id,pickup_date,client_request_id) SELECT n,2,'2026-11-24','batch-schedule-'||n FROM generate_series(100,124) n")
  let result=await service.process(),passes=1
  assert.ok(result.nextCursor)
  while(result.nextCursor){result=await service.process(JSON.parse(result.nextCursor));passes++;assert.ok(passes<30)}
  assert.equal((await pg.query<any>('SELECT COUNT(*) AS n FROM borrowing_schedules WHERE last_reason IS NOT NULL')).rows[0].n,25)
  assert.equal(state.transactions,25)
 } finally {await pg.close()}
})
