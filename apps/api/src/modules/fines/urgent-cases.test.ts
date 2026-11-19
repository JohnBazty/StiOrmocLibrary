import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { urgentReasons,urgentSettings,createUrgentCases } from './urgent-cases.ts'
import { toPgPlaceholders } from '../../config/sql.js'
import type { Pool } from '../../config/db.js'
test('urgent thresholds use original instants, exact boundaries and current partial balances',()=>{
 const now=new Date('2026-11-17T00:00:00Z'),date=new Date('2026-11-15T00:00:00Z'),rules={amount:100,overdue_days:2,unpaid_days:3}
 assert.deepEqual(urgentReasons(50,date,date,rules,now).reasons,['Days overdue'])
 assert.deepEqual(urgentReasons(0,date,date,rules,now).reasons,[])
 assert.deepEqual(urgentReasons(100,date,date,rules,new Date(now.getTime()-1)).reasons,['Outstanding amount'])
 assert.throws(()=>urgentSettings({version:1,amount:-1,overdueDays:null,unpaidDays:null,emailEnabled:false}))
})
test('Postgres source balances, partial payments, notice retries, settings conflict and RLS',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE users(user_id BIGINT PRIMARY KEY,full_name TEXT,school_id TEXT,email TEXT,account_status TEXT);
 CREATE TABLE accounts(account_id BIGINT PRIMARY KEY,user_id BIGINT,role TEXT,account_status TEXT);
 CREATE TABLE fines(fine_id BIGINT,transaction_id BIGINT,user_id BIGINT,fine_type TEXT,applied_date TIMESTAMP,fine_amount NUMERIC,payment_status TEXT);
 CREATE TABLE borrow_transactions(transaction_id BIGINT,user_id BIGINT,borrowed_at TIMESTAMP,due_at TIMESTAMP,transaction_status TEXT,lost_confirmed_at TIMESTAMP);
 CREATE TABLE fine_payment_allocations(fine_payment_receipt_id BIGINT,fine_id BIGINT,lost_book_report_id BIGINT,amount_allocated NUMERIC);
 CREATE TABLE fine_payment_receipts(fine_payment_receipt_id BIGINT,receipt_status TEXT);
 CREATE TABLE fine_adjustments(fine_id BIGINT,amount_adjusted NUMERIC);
 CREATE TABLE lost_book_reports(lost_book_report_id BIGINT,user_id BIGINT,verified_at TIMESTAMP,reported_at TIMESTAMP,replacement_charge NUMERIC,report_status TEXT,payment_status TEXT);
 CREATE TABLE print_requests(request_id BIGINT,user_id BIGINT,created_at TIMESTAMP,calculated_cost NUMERIC,payment_status TEXT,job_status TEXT,pricing_review_state TEXT);
 CREATE TABLE print_payment_receipts(request_id BIGINT,receipt_status TEXT,amount_received NUMERIC,print_cash_payment_id BIGINT);
 CREATE TABLE print_cash_payments(request_id BIGINT,print_cash_payment_id BIGINT,amount_paid NUMERIC);
 CREATE TABLE library_service_charges(charge_id BIGINT,user_id BIGINT,created_at TIMESTAMPTZ,amount_assessed NUMERIC,charge_status TEXT);
 CREATE TABLE library_service_cash_payments(charge_id BIGINT,amount_paid NUMERIC,receipt_status TEXT);
 CREATE TABLE notifications(user_id BIGINT,message_title TEXT,message_body TEXT,trigger_type TEXT,source_type TEXT,action_path TEXT,priority TEXT,dedupe_key TEXT,scheduled_for TIMESTAMP,delivered_at TIMESTAMP,UNIQUE(user_id,dedupe_key));
 INSERT INTO users VALUES(1,'Synthetic librarian','SYNTHETIC-LIB','synthetic@example.invalid','Active'),(2,'Synthetic student','SYNTHETIC-STU','synthetic2@example.invalid','Active');
 INSERT INTO accounts VALUES(1,1,'Librarian','Active');
 INSERT INTO fines VALUES(1,NULL,2,'Infraction','2026-11-01 08:00',100,'Unpaid');
 INSERT INTO fine_payment_receipts VALUES(1,'Issued');INSERT INTO fine_payment_allocations VALUES(1,1,NULL,40);`)
 await pg.exec(readFileSync(new URL('../../../../../database/supabase/057_urgent_cases.sql',import.meta.url),'utf8'))
 const execute=async(sql:string,v:unknown[]=[])=>{let q=toPgPlaceholders(sql);const write=/^\s*(INSERT|UPDATE)/i.test(q);if(/^INSERT/i.test(q)&&!/RETURNING/i.test(q))q+=' RETURNING *';const r=await pg.query(q,v);return write?[{affectedRows:r.affectedRows,rows:r.rows}]:[r.rows]}
 const database={execute,getConnection:async()=>({execute,beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){}})} as unknown as Pool
 let sent=0;const service=createUrgentCases(database,async()=>{sent++})
 assert.equal((await service.list()).items.length,0)
 await service.save(1,{version:1,amount:50,overdueDays:null,unpaidDays:null,emailEnabled:true})
 await assert.rejects(service.save(1,{version:1,amount:50,overdueDays:null,unpaidDays:null,emailEnabled:false}))
 const items=(await service.list(new Date('2026-11-17T00:00:00Z'))).items
 assert.equal(Number(items[0].balance),60);assert.equal(items[0].unpaidDays,16)
 await service.notify();await service.notify();assert.equal(sent,1)
 assert.equal((await pg.query('SELECT * FROM notifications')).rows.length,1)
 await pg.exec('UPDATE fine_payment_allocations SET amount_allocated=100')
 assert.equal((await service.list()).items.length,0)
 await pg.exec('SET ROLE anon');await assert.rejects(pg.exec('SELECT * FROM urgent_case_settings'));await pg.exec('RESET ROLE')
 }finally{await pg.close()}
})
