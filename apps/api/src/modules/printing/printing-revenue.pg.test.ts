import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {PrintingRepository} from './printing.repository.ts'
import {toPgPlaceholders} from '../../config/sql.js'
import {parseFinanceFilters} from './printing.validation.ts'
test('printing revenue includes issued cash and online principal, excludes reversed receipts and counts each request output once',async()=>{
 const pg=new PGlite()
 try{
  await pg.exec(`CREATE TABLE users(user_id bigint PRIMARY KEY,full_name text,school_id text);
   CREATE TABLE print_requests(request_id bigint PRIMARY KEY,user_id bigint,file_name text,print_type text,paper_size text,page_count int,number_of_copies int,total_sheets int,payment_status text,job_status text);
   CREATE TABLE online_payment_attempts(payment_id text PRIMARY KEY,provider_payment_id text,updated_at timestamptz);
   CREATE TABLE print_payment_receipts(print_receipt_id bigint PRIMARY KEY,print_cash_payment_id bigint,online_payment_attempt_id text,request_id bigint,amount_received numeric,received_by_user_id bigint,received_at timestamp,payment_method text,receipt_status text,transaction_fee_centavos int,total_received numeric,confirmation_source text);
   CREATE TABLE print_cash_payments(print_cash_payment_id bigint PRIMARY KEY,request_id bigint,amount_paid numeric,received_by_user_id bigint,received_at timestamp);
   INSERT INTO users VALUES(1,'Borrower fixture','FIXTURE-001'),(2,'Operator fixture','FIXTURE-002');
   INSERT INTO print_requests VALUES(1,1,'mixed.pdf','Monochrome','A4',3,2,4,'Paid','Completed'),(2,1,'partial.pdf','Monochrome','A4',1,1,1,'Partially Paid','Pending'),(3,1,'legacy.pdf','Monochrome','A4',1,1,1,'Paid','Completed');
   INSERT INTO online_payment_attempts VALUES('online-one','provider-fixture','2026-11-18T02:00:00Z');
   INSERT INTO print_payment_receipts VALUES(1,1,NULL,1,40,2,'2026-11-18 09:00','Cash','Issued',0,40,'Counter'),(2,NULL,'online-one',1,60,NULL,'2026-11-18 10:00','GCash','Issued',1000,70,'Xendit'),(3,2,NULL,2,20,2,'2026-11-18 11:00','Cash','Issued',0,20,'Counter'),(4,3,NULL,2,90,2,'2026-11-18 11:30','Cash','Reversed',0,90,'Counter');
   INSERT INTO print_cash_payments VALUES(1,1,40,2,'2026-11-18 09:00'),(2,2,20,2,'2026-11-18 11:00'),(3,2,90,2,'2026-11-18 11:30'),(4,3,10,2,'2026-11-18 12:00');`)
  const pool={execute:async(sql:string,args:unknown[]=[])=>[(await pg.query(toPgPlaceholders(sql),args)).rows]} as never
  const repo=new PrintingRepository(pool),filters=parseFinanceFilters({period:'monthly',month:'2026-11',date:'2026-11-18'}),summary=await repo.revenueSummary(filters),entries=await repo.revenueEntries(filters)
  assert.equal(summary.total_revenue,130);assert.equal(summary.total_sheets,6);assert.equal(summary.total_copies,4);assert.equal(summary.paid_requests,2)
  assert.equal(entries.length,4);assert.ok(entries.some(row=>row.payment_method==='GCash'));assert.equal(new Set(entries.map(row=>row.collection_id)).size,4)
  await pg.exec("UPDATE print_payment_receipts SET receipt_status='Reversed' WHERE print_receipt_id=2")
  assert.equal((await repo.revenueSummary(filters)).total_revenue,70)
 }finally{await pg.close()}
})
