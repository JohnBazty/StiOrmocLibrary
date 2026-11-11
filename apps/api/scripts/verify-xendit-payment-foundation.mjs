import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { db } from '../src/config/db.js'
import { toPgPlaceholders } from '../src/config/sql.js'
import { HttpError } from '../src/core/http-error.ts'
import { authenticateJwt, createActiveJwtAccountGuard } from '../src/modules/auth/jwt-auth.middleware.ts'
import { createPaymentsService } from '../src/modules/payments/payments.service.ts'
import { createPaymentsRouters } from '../src/modules/payments/payments.routes.ts'

function adapt(executor) {
  return {
    async execute(sql, values = []) {
      const result = await executor.query(toPgPlaceholders(sql),values)
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
        return [{insertId:0,affectedRows:result.rowCount,rows:result.rows},result]
      }
      return [result.rows,result]
    },
  }
}

export async function verifyPaymentFoundation(cluster,{gateway=false}={}) {
  const owner = cluster.getPgClient('sti_xendit_sandbox','127.0.0.1')
  await owner.connect()
  const schema = 'payment_qa_' + randomUUID().replaceAll('-','')
  let native
  try {
    const identity = (await owner.query('SELECT current_database() AS name,host(inet_server_addr()) AS host')).rows[0]
    assert.equal(identity.name,'sti_xendit_sandbox')
    assert.equal(identity.host,'127.0.0.1')
    for (const role of ['anon','authenticated']) {
      if (!(await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount) await owner.query('CREATE ROLE '+role+' NOLOGIN')
    }
    await owner.query('CREATE SCHEMA '+schema)
    await owner.query('SET search_path TO '+schema+',pg_catalog')
    await owner.query(`
      CREATE TABLE users(user_id bigint PRIMARY KEY,account_status text DEFAULT 'Active');
      CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint REFERENCES users,role text,
        account_status text DEFAULT 'Active',auth_version integer DEFAULT 1,school_id text);
      CREATE TABLE library_login_sessions(session_id text PRIMARY KEY,account_id bigint REFERENCES accounts,
        auth_version integer,revoked_at timestamptz,last_activity_at timestamptz,remembered_until timestamptz);
      CREATE TABLE borrow_transactions(transaction_id bigint PRIMARY KEY,transaction_status text,lost_confirmed_at timestamptz);
      CREATE TABLE print_requests(request_id bigint PRIMARY KEY,user_id bigint REFERENCES users,
        calculated_cost numeric(10,2),payment_status text,job_status text);
      CREATE TABLE fines(fine_id bigint PRIMARY KEY,user_id bigint REFERENCES users,transaction_id bigint REFERENCES borrow_transactions,
        fine_amount numeric(10,2),fine_type text,payment_status text);
      CREATE TABLE lost_book_reports(lost_book_report_id bigint PRIMARY KEY,user_id bigint REFERENCES users,
        replacement_charge numeric(10,2),payment_status text,report_status text);
      CREATE TABLE fine_adjustments(fine_id bigint REFERENCES fines,amount_adjusted numeric(10,2));
      INSERT INTO users VALUES(1,'Active'),(2,'Active'),(3,'Active');
      INSERT INTO accounts VALUES(1,1,'Student','Active',1,'QA-PAYMENT-001'),
        (2,2,'Student','Active',1,'QA-PAYMENT-002'),(3,3,'Librarian','Active',1,'QA-PAYMENT-LIB');
      INSERT INTO library_login_sessions VALUES('fixture-session-1',1,1,NULL,now(),NULL),
        ('fixture-session-2',2,1,NULL,now(),NULL),('fixture-session-3',3,1,NULL,now(),NULL);
      INSERT INTO borrow_transactions VALUES(1,'Overdue',NULL);
      INSERT INTO print_requests VALUES(1,1,50,'Unpaid','Pending'),(2,2,20,'Unpaid','Pending'),(3,1,15,'Paid','Completed');
      INSERT INTO fines VALUES(1,1,NULL,100,'Infraction','Unpaid'),(2,1,1,100,'Overdue','Accruing'),
        (3,1,NULL,100,'Infraction','Unpaid'),(4,1,NULL,100,'Infraction','Waived');
      INSERT INTO lost_book_reports VALUES(1,1,150,'Unpaid','Confirmed');
    `)
    const baseline = await readFile(new URL('../../../database/supabase/001_from_baseline.sql',import.meta.url),'utf8')
    const gapfill = await readFile(new URL('../../../database/supabase/005_main_product_gapfill.sql',import.meta.url),'utf8')
    function ddl(source, name) {
      const statement = source.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\r?\\n\\);'))?.[0]
      assert.ok(statement,'Missing baseline receipt definition')
      return statement
    }
    for (const name of ['fine_payment_receipts','fine_payment_allocations','print_cash_payments']) await owner.query(ddl(baseline,name))
    await owner.query(ddl(gapfill,'print_payment_receipts'))
    await owner.query(`INSERT INTO fine_payment_receipts(request_key,user_id,amount_received,received_by_user_id,received_at)
      VALUES('legacy-fixture',1,40,3,now());
      INSERT INTO fine_payment_allocations(fine_payment_receipt_id,fine_id,amount_allocated,balance_before,balance_after)
      VALUES(1,3,40,100,60);
      INSERT INTO print_cash_payments(request_id,amount_paid,received_at) VALUES(3,15,now());`)
    const insertPrintReceipt = `INSERT INTO print_payment_receipts(print_cash_payment_id,request_id,user_id,
      receipt_number,verification_code,student_name_snapshot,school_id_snapshot,file_name_snapshot,
      page_count_snapshot,copies_snapshot,total_sheets_snapshot,print_type_snapshot,paper_size_snapshot,
      amount_received,received_by_user_id,received_by_name_snapshot,received_at)
      VALUES(1,3,1,'QA-OLD-PRINT','QA-OLD-CODE','Fixture student','QA-PAYMENT-001','fixture.pdf',
        1,1,1,'Black and white','A4',15,NULL,'Former staff',now())`
    await owner.query(insertPrintReceipt)
    const oldFine = (await owner.query('SELECT user_id,amount_received,payment_method,received_by_user_id FROM fine_payment_receipts')).rows
    const oldPrint = (await owner.query('SELECT * FROM print_payment_receipts')).rows[0]
    await owner.query('BEGIN')
    await owner.query(await readFile(new URL('../../../database/supabase/034_online_payment_foundation.sql',import.meta.url),'utf8'))
    await owner.query('COMMIT')
    assert.deepEqual((await owner.query('SELECT user_id,amount_received,payment_method,received_by_user_id FROM fine_payment_receipts')).rows,oldFine)
    assert.equal((await owner.query('SELECT confirmation_source FROM fine_payment_receipts')).rows[0].confirmation_source,'Legacy')
    const migratedPrint = (await owner.query('SELECT * FROM print_payment_receipts')).rows[0]
    for (const key of Object.keys(oldPrint)) assert.deepEqual(migratedPrint[key],oldPrint[key])
    assert.equal(migratedPrint.confirmation_source,'Legacy')

    const connection = cluster.getPgClient('sti_xendit_sandbox','127.0.0.1')
    native = new pg.Pool({
      host:'127.0.0.1',port:55438,user:'sandbox_owner',database:'sti_xendit_sandbox',
      password:connection.connectionParameters.password,options:'-c search_path='+schema+',pg_catalog',max:6,
    })
    const pool = {
      ...adapt(native),driver:'postgres',
      async getConnection() {
        const client = await native.connect()
        return {...adapt(client),beginTransaction:()=>client.query('BEGIN'),commit:()=>client.query('COMMIT'),
          rollback:()=>client.query('ROLLBACK'),release:()=>client.release(),ping:()=>client.query('SELECT 1')}
      },
      end:()=>native.end(),
    }
    let now = new Date()
    const service = createPaymentsService(pool,{enabled:()=>true,clock:()=>now})
    const student = {accountId:1,role:'Student'}, other = {accountId:2,role:'Student'}, librarian = {accountId:3,role:'Librarian'}
    const fee = {channelCode:'GCASH',displayName:'GCash',fixedFee:'1',percentageBasisPoints:100,taxBasisPoints:0,
      minTotal:'1',maxTotal:'100000',requestKey:'fee-fixture-001'}
    const feeResult = await service.setFee(librarian,fee)
    assert.deepEqual(await service.setFee(librarian,fee),feeResult)
    await assert.rejects(service.setFee(librarian,{...fee,fixedFee:'2'}),error=>error.code==='PAYMENT_RETRY_CONFLICT')

    const quote = await service.quote(student,{kind:'Fine',targetId:1,channelCode:'GCASH',amount:'40'})
    assert.equal(quote.principalCentavos,4000)
    assert.equal(quote.feeCentavos,140)
    assert.equal(quote.totalCentavos,4140)
    assert.equal(quote.remainingCentavos,6000)
    const prepared = await service.prepare(student,{quoteId:quote.paymentId,requestKey:'checkout-fixture-001'})
    assert.equal(prepared.state,'Prepared')
    assert.equal(prepared.gatewayConnected,false)
    assert.deepEqual(await service.prepare(student,{quoteId:quote.paymentId,requestKey:'checkout-fixture-001'}),prepared)
    const repeated = await Promise.all([
      service.prepare(student,{quoteId:quote.paymentId,requestKey:'checkout-fixture-001'}),
      service.prepare(student,{quoteId:quote.paymentId,requestKey:'checkout-fixture-001'}),
    ])
    assert.ok(repeated.every(item=>item.paymentId===quote.paymentId))
    assert.equal((await service.list(librarian,{state:'Prepared'})).pagination.total,1)
    await assert.rejects(service.read(other,quote.paymentId),error=>error.status===404)
    await assert.rejects(service.quote(student,{kind:'Printing',targetId:2,channelCode:'GCASH'}),error=>error.status===404)
    await assert.rejects(service.quote(student,{kind:'Fine',targetId:2,channelCode:'GCASH'}),error=>error.code==='FINE_STILL_ACCRUING')
    await assert.rejects(service.quote(student,{kind:'LostBook',targetId:1,channelCode:'GCASH',amount:'10'}))
    await assert.rejects(service.quote(student,{kind:'Printing',targetId:1,channelCode:'GCASH',amount:'10'}))
    await assert.rejects(service.quote(student,{kind:'Fine',targetId:4,channelCode:'GCASH'}))

    const printA = await service.quote(student,{kind:'Printing',targetId:1,channelCode:'GCASH'})
    const printB = await service.quote(student,{kind:'Printing',targetId:1,channelCode:'GCASH'})
    await assert.rejects(service.prepare(student,{quoteId:printA.paymentId,requestKey:'checkout-fixture-001'}),error=>error.code==='PAYMENT_RETRY_CONFLICT')
    const parallel = await Promise.allSettled([
      service.prepare(student,{quoteId:printA.paymentId,requestKey:'concurrent-print-a'}),
      service.prepare(student,{quoteId:printB.paymentId,requestKey:'concurrent-print-b'}),
    ])
    assert.equal(parallel.filter(result=>result.status==='fulfilled').length,1)
    assert.equal(parallel.filter(result=>result.status==='rejected')[0].reason.code,'PAYMENT_ALREADY_ACTIVE')

    const changed = await service.quote(student,{kind:'Fine',targetId:3,channelCode:'GCASH',amount:'10'})
    await owner.query('INSERT INTO fine_adjustments VALUES(3,1)')
    await assert.rejects(service.prepare(student,{quoteId:changed.paymentId,requestKey:'changed-balance-001'}),error=>error.code==='PAYMENT_QUOTE_CHANGED')
    const staleFee = await service.quote(student,{kind:'Fine',targetId:3,channelCode:'GCASH',amount:'10'})
    await service.setFee(librarian,{...fee,fixedFee:'2',requestKey:'fee-fixture-002'})
    await assert.rejects(service.prepare(student,{quoteId:staleFee.paymentId,requestKey:'changed-fee-001'}),error=>error.code==='PAYMENT_QUOTE_CHANGED')
    await service.setFee(librarian,{...fee,channelCode:'CARDS',minTotal:'20',requestKey:'fee-card-fixture'})
    await assert.rejects(service.quote(student,{kind:'Fine',targetId:3,channelCode:'CARDS',amount:'1'}),error=>error.code==='PAYMENT_CHANNEL_LIMIT')
    await assert.rejects(owner.query("UPDATE online_payment_fee_rules SET fixed_centavos=0"),error=>error.code==='55000')
    await assert.rejects(owner.query("DELETE FROM online_payment_fee_rules"),error=>error.code==='55000')
    await assert.rejects(owner.query("UPDATE online_payment_attempts SET state='Succeeded' WHERE payment_id=$1",[quote.paymentId]),error=>error.code==='23514')
    await owner.query(`INSERT INTO fine_payment_receipts(request_key,user_id,amount_received,received_by_user_id,received_at)
      VALUES('new-cash-fixture',1,1,3,now())`)
    assert.equal((await owner.query("SELECT confirmation_source FROM fine_payment_receipts WHERE request_key='new-cash-fixture'")).rows[0].confirmation_source,'Staff')
    await assert.rejects(owner.query(`INSERT INTO fine_payment_receipts(request_key,user_id,amount_received,received_at)
      VALUES('missing-staff-fixture',1,1,now())`),error=>error.code==='23514')

    const routers = createPaymentsRouters(service)
    const app = express().use(express.json()).use(authenticateJwt,createActiveJwtAccountGuard(pool))
      .use('/api/v1/user/payments',routers.user).use('/api/v1/admin/payments',routers.admin)
    app.use((error, _request, response, _next)=>response.status(error instanceof HttpError?error.status:500)
      .json({success:false,code:error instanceof HttpError?error.code:'TEST_FAILURE'}))
    const bearer = (id,role)=>jwt.sign({accountId:id,schoolId:id===3?'QA-PAYMENT-LIB':'QA-PAYMENT-00'+id,role,authVersion:1,sessionId:'fixture-session-'+id},
      env.jwt.secret,{issuer:env.jwt.issuer,audience:env.jwt.audience,expiresIn:60})
    assert.equal((await request(app).get('/api/v1/user/payments/'+quote.paymentId)).status,401)
    assert.equal((await request(app).get('/api/v1/user/payments/'+quote.paymentId).auth(bearer(2,'Student'),{type:'bearer'})).status,404)
    assert.equal((await request(app).get('/api/v1/user/payments/'+quote.paymentId).auth(bearer(1,'Student'),{type:'bearer'})).status,200)
    await owner.query("UPDATE library_login_sessions SET revoked_at=now() WHERE account_id=1")
    assert.equal((await request(app).get('/api/v1/user/payments/'+quote.paymentId).auth(bearer(1,'Student'),{type:'bearer'})).status,401)
    await owner.query('UPDATE library_login_sessions SET revoked_at=NULL WHERE account_id=1')
    await owner.query("UPDATE accounts SET account_status='Deactivated' WHERE account_id=2")
    assert.equal((await request(app).post('/api/v1/user/payments/quote').auth(bearer(2,'Student'),{type:'bearer'})
      .send({kind:'Printing',targetId:2,channelCode:'GCASH'})).status,401)

    await owner.query('GRANT USAGE ON SCHEMA '+schema+' TO anon,authenticated')
    await owner.query('BEGIN')
    await owner.query('SET LOCAL ROLE anon')
    await assert.rejects(owner.query('SELECT * FROM '+schema+'.online_payment_attempts'),error=>error.code==='42501')
    await owner.query('ROLLBACK')
    await owner.query(`INSERT INTO online_payment_events(environment,provider_event_id,event_type,verified_fields)
      VALUES('test','fixture-event-1','fixture','{}')`)
    await assert.rejects(owner.query(`INSERT INTO online_payment_events(environment,provider_event_id,event_type,verified_fields)
      VALUES('test','fixture-event-1','fixture','{}')`),error=>error.code==='23505')

    now = new Date(now.getTime()+11*60_000)
    const renewed = await service.quote(student,{kind:'Printing',targetId:1,channelCode:'GCASH'})
    assert.equal((await service.prepare(student,{quoteId:renewed.paymentId,requestKey:'new-after-expiry'})).state,'Prepared')
    const winner = parallel.find(result=>result.status==='fulfilled').value
    assert.equal((await service.read(student,winner.paymentId)).state,'Expired')
    const expired = await service.quote(student,{kind:'Fine',targetId:3,channelCode:'GCASH',amount:'10'})
    now = new Date(now.getTime()+6*60_000)
    await assert.rejects(service.prepare(student,{quoteId:expired.paymentId,requestKey:'expired-quote-001'}),error=>error.code==='PAYMENT_QUOTE_EXPIRED')

    // Synthetic provider references verify storage constraints only; no provider payment is created.
    await owner.query(`UPDATE online_payment_attempts SET state='Succeeded',provider_session_id='fixture-session',
      provider_payment_id='fixture-payment' WHERE payment_id=$1`,[quote.paymentId])
    const fineReceipt = `INSERT INTO fine_payment_receipts(request_key,user_id,amount_received,payment_method,
      received_at,confirmation_source,online_payment_attempt_id,transaction_fee_centavos)
      VALUES($1,$2,$3,'GCASH',now(),'Xendit',$4,$5) RETURNING fine_payment_receipt_id,total_received`
    await assert.rejects(owner.query(fineReceipt,['wrong-owner',2,40,quote.paymentId,140]),error=>error.code==='23514')
    await assert.rejects(owner.query(fineReceipt,['wrong-fee',1,40,quote.paymentId,141]),error=>error.code==='23514')
    const receipt = (await owner.query(fineReceipt,['gateway-fixture',1,40,quote.paymentId,140])).rows[0]
    assert.equal(receipt.total_received,'41.40')
    const allocation = `INSERT INTO fine_payment_allocations(fine_payment_receipt_id,fine_id,
      amount_allocated,balance_before,balance_after) VALUES($1,$2,$3,100,60)`
    await assert.rejects(owner.query(allocation,[receipt.fine_payment_receipt_id,3,40]),error=>error.code==='23514')
    await assert.rejects(owner.query(allocation,[receipt.fine_payment_receipt_id,1,41.40]),error=>error.code==='23514')
    await owner.query(allocation,[receipt.fine_payment_receipt_id,1,40])
    assert.equal((await service.quote(student,{kind:'Fine',targetId:1,channelCode:'GCASH'})).principalCentavos,6000)
    await assert.rejects(owner.query(fineReceipt,['duplicate-payment',1,40,quote.paymentId,140]),error=>error.code==='23505')
    await owner.query(`UPDATE online_payment_attempts SET state='Succeeded',provider_session_id='fixture-print-session',
      provider_payment_id='fixture-print-payment' WHERE payment_id=$1`,[renewed.paymentId])
    const printReceipt = `INSERT INTO print_payment_receipts(request_id,user_id,receipt_number,verification_code,
      student_name_snapshot,school_id_snapshot,file_name_snapshot,page_count_snapshot,copies_snapshot,
      total_sheets_snapshot,print_type_snapshot,paper_size_snapshot,amount_received,payment_method,
      received_by_name_snapshot,received_at,confirmation_source,online_payment_attempt_id,transaction_fee_centavos)
      VALUES($1,1,$2,$3,'Fixture','QA-PAYMENT-001','fixture.pdf',1,1,1,'Black and white','A4',50,
        'GCASH','Xendit',now(),'Xendit',$4,250) RETURNING total_received`
    await assert.rejects(owner.query(printReceipt,[2,'QA-WRONG-PRINT','QA-WRONG-CODE',renewed.paymentId]),error=>error.code==='23514')
    assert.equal((await owner.query(printReceipt,[1,'QA-NEW-PRINT','QA-NEW-CODE',renewed.paymentId])).rows[0].total_received,'52.50')
    let gatewayResult
    if (gateway) {
      await owner.query(await readFile(new URL('../../../database/supabase/035_xendit_checkout_confirmation.sql',import.meta.url),'utf8'))
      const {verifyPaymentGateway} = await import('./verify-xendit-payment-gateway.mjs')
      gatewayResult = await verifyPaymentGateway(pool,owner)
    }
    return {migration:'034',isolation:'temporary-local-schema',quoteMath:'passed',concurrency:'passed',gateway:gatewayResult,
      ownership:'passed',cashCompatibility:'passed',receiptConstraints:'passed',eventDeduplication:'passed'}
  } catch (error) {
    // This verifier uses synthetic fixtures only. Report assertions without connection details.
    console.error('Payment foundation verification failed', error.code || error.name,
      error.stack?.split('\n').find(line => line.includes('verify-xendit-payment-foundation.mjs'))?.trim())
    if (error.code === 'ERR_ASSERTION') console.error(error.message)
    throw error
  } finally {
    if (native) await native.end()
    await owner.query('ROLLBACK')
    await owner.query('SET search_path TO pg_catalog')
    await owner.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE')
    await owner.end()
    await db.end()
  }
}
