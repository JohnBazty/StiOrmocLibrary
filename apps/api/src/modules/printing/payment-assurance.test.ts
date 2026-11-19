import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createCanvas } from '@napi-rs/canvas'
import { toPgPlaceholders } from '../../config/sql.js'
import { createPrintingPaymentAssurance, type AssuranceAttempt } from './payment-assurance.service.ts'
import { normalizePaymentProof } from './payment-proof.storage.ts'

const borrower={accountId:70,role:'Student'},other={accountId:80,role:'Student'},librarian={accountId:90,role:'Librarian'}
const paymentId='00000000-0000-4000-8000-000000000001'
const attempt:AssuranceAttempt={paymentId,accountId:70,userId:7,kind:'Printing',targetId:1,state:'Active',channelCode:'GCASH',principalCentavos:1000,feeCentavos:110,totalCentavos:1110,providerPaymentId:'pay_confirmed_reference',providerSessionId:'ps_session',createdAt:'2026-11-17T01:00:00Z'}
function image(){const canvas=createCanvas(40,60);canvas.getContext('2d').fillRect(0,0,40,60);return{buffer:canvas.toBuffer('image/png'),mimetype:'image/png',originalname:'proof.png'} as Express.Multer.File}
async function fixture(){
 const pg=new PGlite(),files=new Map<string,Buffer>();let current={...attempt}
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE users(user_id bigint PRIMARY KEY,account_status text,full_name text,school_id text);
 CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint REFERENCES users,role text,account_status text);
 CREATE TABLE print_requests(request_id bigint PRIMARY KEY,user_id bigint REFERENCES users);
 CREATE TABLE print_cash_payments(request_id bigint,received_at timestamptz);
 CREATE TABLE print_payment_receipts(request_id bigint,receipt_status text,print_receipt_id bigint,amount_received numeric(10,2));
 INSERT INTO users VALUES(7,'Active','Borrower','QA-7'),(8,'Active','Other borrower','QA-8'),(9,'Active','Librarian','QA-9');
 INSERT INTO accounts VALUES(70,7,'Student','Active'),(80,8,'Student','Active'),(90,9,'Librarian','Active');
 INSERT INTO print_requests VALUES(1,7),(2,8);`)
 await pg.exec(await readFile(new URL('../../../../../database/supabase/055_printing_receivables_and_payment_review.sql',import.meta.url),'utf8'))
 const execute=async(sql:string,values:unknown[]=[])=>{const result=await pg.query(toPgPlaceholders(sql),values);return [/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)?{rows:result.rows}:result.rows]}
 const q={execute,beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){}}
 const service=createPrintingPaymentAssurance({execute,getConnection:async()=>q} as never,{
  attempt:async()=>({...current}),storage:{put:async(key,contents)=>{files.set(key,Buffer.from(contents))},read:async key=>Buffer.from(files.get(key)!),remove:async key=>{files.delete(key)}},
 })
 return {pg,files,service,confirm(){current={...current,state:'Succeeded',confirmedAt:'2026-11-17T01:01:00Z'}},close:()=>pg.close()}
}
test('proof images reject invalid signatures and excessive dimensions; output is sanitized PNG',async()=>{
 const result=await normalizePaymentProof(image());assert.equal(result.mimeType,'image/png');assert.equal(result.contents.subarray(1,4).toString(),'PNG')
 await assert.rejects(normalizePaymentProof({...image(),buffer:Buffer.from('<svg onload="bad()"/>')} as never),{code:'PAYMENT_PROOF_INVALID'})
 const oversized=image();oversized.buffer.writeUInt32BE(20000,16)
 await assert.rejects(normalizePaymentProof(oversized),{code:'PAYMENT_PROOF_INVALID'})
 await assert.rejects(normalizePaymentProof({...image(),buffer:Buffer.alloc(4*1024*1024)} as never),{code:'PAYMENT_PROOF_TOO_LARGE'})
})
test('owned proof is idempotent, private, and cannot approve or settle an unconfirmed payment',async()=>{
 const f=await fixture();try{
  const input={request_key:randomUUID(),external_reference:'pay_confirmed_reference',declared_amount:'11.10'}
  const proof=await f.service.upload(borrower,paymentId,input,image())
  assert.equal(proof.review_status,'Pending');assert.equal('storage_key' in proof,false);assert.equal(f.files.size,1)
  assert.equal((await f.service.upload(borrower,paymentId,input,image())).proof_id,proof.proof_id)
  await assert.rejects(f.service.upload(borrower,paymentId,{...input,declared_amount:'11.11'},image()),{status:409})
  await assert.rejects(f.service.list(other,paymentId),{status:404})
  await assert.rejects(f.service.image(other,proof.proof_id),{status:404})
  await assert.rejects(f.service.review(borrower,proof.proof_id,{version:1,status:'Verified',reason:'Confirmed provider transaction'}),{status:403})
  await assert.rejects(f.service.review(librarian,proof.proof_id,{version:1,status:'Verified',reason:'Confirmed provider transaction'}),{code:'PAYMENT_PROOF_NOT_CONFIRMED'})
  await assert.rejects(f.service.paymentRecord(borrower,paymentId),{code:'PAYMENT_RECORD_UNAVAILABLE'})
  f.confirm()
  const verified=await f.service.review(librarian,proof.proof_id,{version:1,status:'Verified',reason:'Matched provider transaction'})
  assert.equal(verified.review_status,'Verified');assert.equal(verified.version,2)
  assert.equal((await f.service.list(borrower,paymentId)).length,1)
  assert.equal((await f.service.image(borrower,proof.proof_id)).subarray(1,4).toString(),'PNG')
  const record=await f.service.paymentRecord(borrower,paymentId);assert.equal(record.totalCentavos,1110)
  assert.equal((await f.pg.query('SELECT * FROM print_cash_payments')).rows.length,0)
  assert.equal((await f.pg.query('SELECT * FROM print_payment_receipts')).rows.length,0)
  await assert.rejects(f.service.review(librarian,proof.proof_id,{version:1,status:'Rejected',reason:'Changed my mind'}),{status:409})
 }finally{await f.close()}
})
test('review rejects an amount/reference mismatch and permits replacement only after rejection',async()=>{
 const f=await fixture();try{
  const input={request_key:randomUUID(),external_reference:'wrong_reference',declared_amount:'11.10'}
  const proof=await f.service.upload(borrower,paymentId,input,image());f.confirm()
  await assert.rejects(f.service.review(librarian,proof.proof_id,{version:1,status:'Verified',reason:'Matched'}),{code:'PAYMENT_PROOF_MISMATCH'})
  await assert.rejects(f.service.upload(borrower,paymentId,{...input,request_key:randomUUID()},image()),{code:'PAYMENT_PROOF_EXISTS'})
  await f.service.review(librarian,proof.proof_id,{version:1,status:'Rejected',reason:'Reference does not match'})
  const second=await f.service.upload(borrower,paymentId,{...input,request_key:randomUUID(),external_reference:'pay_confirmed_reference'},image())
  assert.notEqual(second.proof_id,proof.proof_id);assert.equal(second.review_status,'Pending')
 }finally{await f.close()}
})
