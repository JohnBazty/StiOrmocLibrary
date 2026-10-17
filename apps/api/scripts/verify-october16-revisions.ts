/** Disposable-schema acceptance. No school records, credentials, email or storage are mutated. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcrypt'
import { env } from '../src/config/env.js'
import { db } from '../src/config/db.js'
import { toPgPlaceholders } from '../src/config/sql.js'
import type { Pool } from 'mysql2/promise'
import { createJwtAuthService } from '../src/modules/auth/jwt-auth.service.ts'
import { createLoginSecurityService } from '../src/modules/auth/login-security.service.ts'
import { createActiveJwtAccountGuard, verifyAccessToken } from '../src/modules/auth/jwt-auth.middleware.ts'
import { createClearanceScheduleService } from '../src/modules/clearance/clearance-schedule.service.ts'
import { printingInvoice, createPrintingInvoicePdf } from '../src/modules/printing/printing-invoice.ts'
import { exactLoanDeadline } from '../src/modules/circulation/exact-loan-deadline.ts'
import { createCirculationService } from '../src/modules/circulation/circulation.service.ts'

const schema = `oct16_check_${randomUUID().replaceAll('-', '')}`
if (env.db.driver !== 'postgres' || !/^oct16_check_[a-f0-9]{32}$/.test(schema)) throw new Error('Isolated Postgres configuration required.')
const admin = new pg.Client({connectionString:env.db.connectionString}); await admin.connect()
const native = new pg.Pool({connectionString:env.db.connectionString,max:12,options:`-c timezone=Asia/Manila -c search_path=${schema}`})
const wrap = (q: Pick<pg.PoolClient,'query'>) => ({ async execute(sql: string,args:any[] = []) { let text=toPgPlaceholders(sql); const write=/^\s*(INSERT|UPDATE|DELETE)/i.test(text); if (/^\s*INSERT/i.test(text) && !/\bRETURNING\b/i.test(text)) text+=' RETURNING *'; const result=await q.query(text,args); return [write ? {affectedRows:result.rowCount,insertId:0} : result.rows,result] } })
const database = {...wrap(native),async getConnection(){const c=await native.connect();return {...wrap(c),beginTransaction:()=>c.query('BEGIN'),commit:()=>c.query('COMMIT'),rollback:()=>c.query('ROLLBACK'),release:()=>c.release()}}} as unknown as Pool
const baseline = async () => (await admin.query('SELECT (SELECT COUNT(*) FROM public.accounts)::int accounts,(SELECT COUNT(*) FROM public.users)::int users,(SELECT COUNT(*) FROM public.borrow_transactions)::int loans,(SELECT COUNT(*) FROM public.print_requests)::int printing')).rows[0]
const before=await baseline()
let checks=0
try {
  await admin.query(`CREATE SCHEMA ${schema}`)
  await native.query(`
    CREATE TABLE users(user_id bigint PRIMARY KEY,school_id text,email text,full_name text,password_hash text,user_role text,account_status text,auth_version int DEFAULT 1,updated_at timestamptz);
    CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint,school_id text,password_hash text,role text,account_status text,auth_version int DEFAULT 1,updated_at timestamptz);
    CREATE TABLE student_profiles(account_id bigint,first_name text,last_name text);
    CREATE TABLE registration_requests(school_id text,requested_role text,status text,password_hash text);
    CREATE TABLE auth_sessions(session_id text,session_data text);
    CREATE TABLE academic_terms(academic_term_id bigint PRIMARY KEY,academic_year text,term_name text,is_active int,starts_on date);
    CREATE TABLE print_requests(request_id bigint PRIMARY KEY,user_id bigint,file_name text,page_count int,number_of_copies int,total_sheets int,print_type text,paper_size text,calculated_cost numeric,payment_status text,job_status text,created_at timestamptz);
    CREATE TABLE print_payment_receipts(request_id bigint,receipt_status text,receipt_number text,received_at timestamptz,payment_method text);
  `)
  const sql=await readFile(new URL('../../../database/supabase/029_october16_revisions.sql',import.meta.url),'utf8')
  const c=await native.connect()
  try {await c.query('BEGIN');await c.query(sql);await c.query('ROLLBACK')} finally {c.release()}
  assert.equal((await native.query("SELECT to_regclass('library_login_sessions') AS name")).rows[0].name,null);checks++
  await native.query(sql)
  assert.equal((await native.query('SELECT COUNT(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relrowsecurity',[schema])).rows[0].n,5);checks++
  const password=await bcrypt.hash('Disposable-Login-42!',8)
  for (const [id,role] of [[1,'Student'],[2,'Faculty'],[3,'Librarian']] as const) {
    await native.query('INSERT INTO users(user_id,school_id,email,full_name,password_hash,user_role,account_status) VALUES($1,$2,$3,$4,$5,$6,\'Active\')',[id,`QA-${id}`,`oct16-disposable-${id}@ormoc.sti.edu.ph`,`Disposable ${role}`,password,role])
    await native.query('INSERT INTO accounts(account_id,user_id,school_id,password_hash,role,account_status) VALUES($1,$1,$2,$3,$4,\'Active\')',[id,`QA-${id}`,password,role])
  }
  const credentialService=createJwtAuthService(database)
  let timestamp=Date.now(), code='123456', mailCount=0
  const sent: Array<{email:string;code:string}>=[]
  const service=createLoginSecurityService(database,body=>credentialService.login(body,true),async(email,value)=>{mailCount++;sent.push({email,code:value})},()=>timestamp,()=>code)
  const request=(id:number,password='Disposable-Login-42!')=>({school_id:`QA-${id}`,password,portal:id===3?'staff':'user'})
  const failed=await Promise.all(Array.from({length:8},(_,index)=>service.login(index<4?request(1,'bad password'):{email:'oct16-disposable-1@ormoc.sti.edu.ph',password:'bad password'}).then(()=>null,e=>e)))
  assert.equal(failed.filter(error=>error?.code==='LOGIN_PAUSED').length,1)
  assert.equal(failed.filter(error=>/3 attempts remaining/.test(error?.message)).length,1)
  await assert.rejects(service.login(request(1)),e=>(e as any).code==='LOGIN_PAUSED');checks+=3
  timestamp+=600_001
  const challenge=await service.login(request(1))
  assert.equal(challenge.otpRequired,true);assert.equal(challenge.token,undefined);assert.equal(mailCount,1)
  assert.equal((await native.query('SELECT COUNT(*)::int n FROM library_login_sessions')).rows[0].n,0);checks+=3
  await assert.rejects(service.verify({challenge_id:challenge.challengeId,code:'999999'}));checks++
  await assert.rejects(service.resend({challenge_id:challenge.challengeId}));checks++
  timestamp+=60_001;code='234567';await service.resend({challenge_id:challenge.challengeId})
  await assert.rejects(service.verify({challenge_id:challenge.challengeId,code:'123456'}));checks++
  const logged=await service.verify({challenge_id:challenge.challengeId,code:'234567'})
  assert.equal(logged!.user.role,'Student');assert.ok(verifyAccessToken(logged!.token).sessionId);checks++
  await assert.rejects(service.verify({challenge_id:challenge.challengeId,code:'234567'}));checks++
  const faculty=await service.login(request(2));assert.equal(faculty.otpRequired,true);checks++
  const librarian=await service.login(request(3));assert.equal(librarian.user.role,'Librarian');assert.ok(librarian.token);checks++
  const facultyId=faculty.challengeId
  const attempts=await Promise.all([1,2,3].map(()=>service.verify({challenge_id:facultyId,code:'999999'}).catch(e=>e)))
  assert.equal(attempts.length,3)
  timestamp+=60_001;await assert.rejects(service.login(request(2)),e=>(e as any).code==='LOGIN_CODE_PAUSED');checks++
  const identity=verifyAccessToken(librarian.token)
  const guard=createActiveJwtAccountGuard(database)
  const guardStatus=()=>new Promise<number>((resolve,reject)=>{const response:any={locals:{authenticatedUser:identity},status(value:number){this.value=value;return this},json(){resolve(this.value)}};guard({} as any,response,(error?:any)=>error?reject(error):resolve(200))})
  assert.equal(await guardStatus(),200)
  await native.query("UPDATE library_login_sessions SET last_activity_at=NOW()-INTERVAL '11 minutes' WHERE session_id=$1",[identity.sessionId])
  assert.equal(await guardStatus(),401);checks+=2
  await native.query("INSERT INTO academic_terms VALUES(1,'2026-2027','First semester',1,'2026-08-01'),(2,'2026-2027','Second semester',0,'2027-01-01')")
  const schedules=createClearanceScheduleService(database)
  assert.equal((await schedules.current()).deadlineAt,null);checks++
  const deadline=new Date('2026-12-15T17:00:00+08:00').toISOString()
  const saved=await schedules.save({accountId:3,role:'Librarian'},{termId:1,deadlineAt:deadline,version:0})
  assert.equal(new Date(saved.deadlineAt).toISOString(),deadline)
  await assert.rejects(schedules.save({accountId:3,role:'Librarian'},{termId:1,deadlineAt:null,version:0}))
  for(const role of ['Student','Faculty','Staff','Admin'])await assert.rejects(schedules.save({accountId:3,role},{termId:1,deadlineAt:deadline,version:1}))
  await schedules.save({accountId:3,role:'Librarian'},{termId:1,deadlineAt:null,version:1})
  assert.equal((await schedules.current()).deadlineAt,null);assert.equal((await native.query('SELECT COUNT(*)::int n FROM clearance_schedule_events')).rows[0].n,2);checks+=8
  await native.query("INSERT INTO print_requests VALUES(1,1,'sample.pdf',2,3,6,'Monochrome','A4',18,'Unpaid','Pending',NOW())")
  const invoice=await printingInvoice({schoolId:'QA-1',role:'Student'},1,false,database)
  assert.equal(invoice.amountDue,18);assert.equal(invoice.status,'Unpaid')
  await assert.rejects(printingInvoice({schoolId:'QA-2',role:'Faculty'},1,false,database))
  await assert.rejects(printingInvoice({schoolId:'QA-1',role:'Student'},1,true,database))
  const pdf=createPrintingInvoicePdf(invoice),parts:Buffer[]=[];for await(const chunk of pdf)parts.push(Buffer.from(chunk));assert.ok(Buffer.concat(parts).subarray(0,5).toString()==='%PDF-');checks+=5
  await native.query("UPDATE print_requests SET payment_status='Paid' WHERE request_id=1")
  const paid=await printingInvoice({schoolId:'QA-1'},1,false,database);assert.equal(paid.invoiceNumber,invoice.invoiceNumber);assert.equal(paid.amountDue,0);checks+=2
  const due=exactLoanDeadline(new Date('2026-10-16T15:17:23.123+08:00'),1,new Set([1,2,3,4,5,6]),new Set(['2026-10-17']))
  assert.equal(due.toISOString(),'2026-10-19T07:17:23.123Z');checks++
  await native.query(`CREATE TABLE materials(material_id bigint PRIMARY KEY,title text,author text,barcode text);
    CREATE TABLE titles(title_id bigint PRIMARY KEY,title text,cover_image_path text);
    CREATE TABLE physical_copies(physical_copy_id bigint PRIMARY KEY,title_id bigint,material_id bigint,accession_number text,barcode text);
    CREATE TABLE authors(title_id bigint,author_name text,author_order int);
    CREATE TABLE borrow_transactions(transaction_id bigint PRIMARY KEY,user_id bigint,material_id bigint,physical_copy_id bigint,borrowed_at timestamp,due_at timestamp,returned_at timestamp,transaction_status text);
    INSERT INTO materials VALUES(1,'Old title','Sample author','COPY-1'),(2,'Waiting title','Sample author','COPY-2');
    INSERT INTO titles VALUES(1,'Sample title',null),(2,'Waiting title',null);
    INSERT INTO physical_copies VALUES(1,1,1,'ACC-1','COPY-1'),(2,2,2,'ACC-2','COPY-2');
    INSERT INTO borrow_transactions VALUES(1,1,1,1,'2026-10-15 15:17','2026-10-16 15:17','2026-10-16 14:00','Returned'),
      (2,1,1,1,'2026-10-16 15:17','2026-10-17 15:17',null,'Borrowed'),
      (3,1,2,2,null,null,null,'Pending'),(4,2,2,2,'2026-10-16 15:17','2026-10-17 15:17',null,'Borrowed')`)
  const collection=await createCirculationService(database).myBooks(1)
  assert.equal(collection.items.length,1);assert.equal(collection.items[0].transactionId,2);assert.equal(collection.items[0].title,'Sample title');checks++
  assert.equal(new Date(collection.items[0].borrowDate).toISOString(),'2026-10-16T07:17:00.000Z');checks++
  const otherCollection=await createCirculationService(database).myBooks(2)
  assert.equal(otherCollection.items.length,1);assert.equal(otherCollection.items[0].title,'Waiting title');checks++
  await assert.rejects(createCirculationService(database).myBooks(999));checks++
  timestamp+=600_001
  const expiring=await service.login(request(2))
  timestamp+=600_001
  await assert.rejects(service.verify({challenge_id:expiring.challengeId,code}));checks++
  timestamp+=60_001
  const once=await service.login(request(2))
  const concurrent=await Promise.all([1,2].map(()=>service.verify({challenge_id:once.challengeId,code}).then(value=>Boolean(value?.token),()=>false)))
  assert.equal(concurrent.filter(Boolean).length,1);checks++
  assert.deepEqual(await baseline(),before);checks++
  console.log(JSON.stringify({checks,passed:true,scope:'Disposable Postgres schema; fake sender; existing school counts unchanged',mailCount}))
} finally {
  await native.end()
  // Exact generated namespace, validated above; never delete a public or user-selected schema.
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin.end();await db.end()
}
