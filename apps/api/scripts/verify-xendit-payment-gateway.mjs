import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import express from 'express'
import { createPaymentsService } from '../src/modules/payments/payments.service.ts'
import { createPaymentGatewayService } from '../src/modules/payments/payments.gateway.ts'
import { createPaymentWebhookRouter } from '../src/modules/payments/payments.routes.ts'
import { HttpError } from '../src/core/http-error.ts'
import { createFinesService } from '../src/modules/fines/fines.service.ts'

export async function verifyPaymentGateway(pool, owner) {
  await owner.query(`ALTER TABLE users ADD COLUMN full_name text DEFAULT 'Disposable fixture',ADD COLUMN school_id text DEFAULT 'QA-ONLY';
    ALTER TABLE print_requests ADD COLUMN file_name text DEFAULT 'fixture.pdf',ADD COLUMN page_count integer DEFAULT 1,
      ADD COLUMN number_of_copies integer DEFAULT 1,ADD COLUMN total_sheets integer DEFAULT 1,
      ADD COLUMN print_type text DEFAULT 'Black and white',ADD COLUMN paper_size text DEFAULT 'A4',
      ADD COLUMN paid_at timestamptz,ADD COLUMN updated_at timestamptz,ADD COLUMN row_version integer DEFAULT 1;
    ALTER TABLE fines ADD COLUMN paid_at timestamptz,ADD COLUMN updated_at timestamptz;
    ALTER TABLE fine_adjustments ADD COLUMN adjustment_type text DEFAULT 'Reduction';
    ALTER TABLE borrow_transactions ADD COLUMN user_id bigint DEFAULT 1;
    ALTER TABLE lost_book_reports ADD COLUMN paid_at timestamptz,ADD COLUMN updated_at timestamptz,
      ADD COLUMN payment_recorded_by_user_id bigint;
    INSERT INTO print_requests(request_id,user_id,calculated_cost,payment_status,job_status)
      SELECT id,1,50,'Unpaid','Pending' FROM generate_series(10,19) id;
    INSERT INTO fines(fine_id,user_id,fine_amount,fine_type,payment_status)
      SELECT id,1,100,'Infraction','Unpaid' FROM generate_series(10,19) id;`)
  const baseline = await readFile(new URL('../../../database/supabase/001_from_baseline.sql',import.meta.url),'utf8')
  await owner.query(baseline.match(/CREATE TABLE IF NOT EXISTS clearance_statuses \([\s\S]*?\r?\n\);/)[0])
  const sessions = new Map(), captured = new Map()
  let creates = 0, timeout = false, now = new Date(), providerOffline = false
  const config = ()=>({enabled:true,mode:'test',webhookToken:'fixture-callback-token-0123456789',returnUrl:null})
  const provider = {
    async createSession(body) {
      creates++
      const id = 'ps-'+randomUUID().replaceAll('-','').slice(0,24)
      const session = {...body,payment_session_id:id,business_id:'fixture-business',status:'ACTIVE',
        payment_link_url:'https://checkout-staging.xendit.co/sessions/'+id}
      sessions.set(id,session)
      // An unknown-outcome timeout still creates the remote fixture, matching a lost HTTP response.
      if (timeout) throw new Error('Synthetic timeout')
      return session
    },
    async getSession(id) { if(providerOffline)throw new Error('Synthetic outage');return structuredClone(sessions.get(id)) },
    async getPayment(id) { if(providerOffline)throw new Error('Synthetic outage');return structuredClone(captured.get(id)) },
  }
  const service = createPaymentsService(pool,{enabled:()=>true,clock:()=>now})
  const gateway = createPaymentGatewayService(pool,{config,provider,clock:()=>now})
  const actor = {accountId:1,role:'Student'}
  await service.setFee({accountId:3,role:'Librarian'},{channelCode:'GCASH',displayName:'Fixture GCash',fixedFee:'1',
    percentageBasisPoints:100,taxBasisPoints:0,minTotal:'1',maxTotal:'100000',requestKey:'phase3-fee-rule'})
  const quote = (kind,id,amount)=>service.quote(actor,{kind,targetId:id,channelCode:'GCASH',...(amount?{amount}:{})})
  function finish(session,status='COMPLETED') {
    session.status = status
    if (status==='COMPLETED') {
      session.payment_id='py-'+randomUUID()
      session.payment_request_id='pr-'+randomUUID()
      captured.set(session.payment_id,{payment_id:session.payment_id,payment_request_id:session.payment_request_id,
        business_id:session.business_id,type:'PAY',country:'PH',currency:'PHP',request_amount:session.amount,
        status:'SUCCEEDED',capture_method:'AUTOMATIC',channel_code:'GCASH',
        captures:[{capture_id:'cap-'+randomUUID(),capture_amount:session.amount}]})
    }
  }
  const event = session=>({event:session.status==='EXPIRED'?'payment_session.expired':'payment_session.completed',
    business_id:session.business_id,data:structuredClone(session)})
  const findSession = id=>[...sessions.values()].find(item=>item.reference_id==='sti-pay-'+id)
  const sessionFor = async (kind,id,amount)=>{
    const quoted=await quote(kind,id,amount)
    await gateway.checkout(actor,{quoteId:quoted.paymentId,requestKey:'gateway-'+id+'-'+kind})
    return {quoted,session:findSession(quoted.paymentId)}
  }

  const quoted = await quote('Fine',10,'40')
  await owner.query("UPDATE accounts SET account_status='Active' WHERE account_id=2")
  await assert.rejects(gateway.check({accountId:2,role:'Student'},quoted.paymentId),error=>error.status===404)
  await Promise.all([gateway.checkout(actor,{quoteId:quoted.paymentId,requestKey:'gateway-concurrent'}),
    gateway.checkout(actor,{quoteId:quoted.paymentId,requestKey:'gateway-concurrent'})])
  assert.equal(creates,1)
  const session = findSession(quoted.paymentId)
  assert.equal((await service.read(actor,quoted.paymentId)).state,'Active')
  finish(session)
  const webhook = express().use('/webhook',createPaymentWebhookRouter(gateway))
  webhook.use((error,_request,response,_next)=>response.status(error instanceof HttpError?error.status:500).json({code:error.code}))
  assert.equal((await request(webhook).post('/webhook').set('x-callback-token','forged').send(event(session))).status,401)
  assert.equal((await request(webhook).post('/webhook').set('x-callback-token',config().webhookToken).send(event(session))).status,200)
  await gateway.receive(config().webhookToken,event(session))
  assert.equal((await owner.query("SELECT count(*)::int count FROM online_payment_events WHERE payment_id=$1",[quoted.paymentId])).rows[0].count,1)
  await Promise.all([gateway.recover(),gateway.recover()])
  assert.equal((await service.read(actor,quoted.paymentId)).state,'Succeeded',JSON.stringify((await owner.query(
    'SELECT state,last_error_code FROM online_payment_events WHERE payment_id=$1',[quoted.paymentId])).rows))
  assert.equal((await owner.query('SELECT payment_status FROM fines WHERE fine_id=10')).rows[0].payment_status,'Partially Paid')
  const receipt = (await owner.query('SELECT * FROM fine_payment_receipts WHERE online_payment_attempt_id=$1',[quoted.paymentId])).rows[0]
  assert.equal(receipt.amount_received,'40.00');assert.equal(receipt.total_received,'41.40')
  assert.equal(receipt.received_by_user_id,null)
  await assert.rejects(createFinesService(pool).reverseReceipt({accountId:3,role:'Librarian'},receipt.fine_payment_receipt_id,
    {reason:'Disposable gateway reversal check'}),error=>error.code==='ONLINE_REFUND_REQUIRED')
  assert.equal((await owner.query('SELECT standing_status FROM clearance_statuses WHERE user_id=1')).rows[0].standing_status,'Not Cleared')
  await assert.rejects(owner.query("UPDATE fine_payment_receipts SET confirmation_source='Legacy' WHERE fine_payment_receipt_id=$1",[receipt.fine_payment_receipt_id]),error=>error.code==='23514')
  await gateway.receive(config().webhookToken,{...event(session),event:'payment_session.expired',data:{...session,status:'EXPIRED'}})
  await gateway.recover()
  assert.equal((await service.read(actor,quoted.paymentId)).state,'Succeeded')

  const print = await sessionFor('Printing',10)
  finish(print.session)
  now = new Date(now.getTime()+61_000)
  await gateway.check(actor,print.quoted.paymentId)
  assert.equal((await owner.query('SELECT payment_status FROM print_requests WHERE request_id=10')).rows[0].payment_status,'Paid')
  assert.equal((await owner.query('SELECT count(*)::int count FROM print_cash_payments WHERE request_id=10')).rows[0].count,0)
  assert.equal((await owner.query('SELECT total_received FROM print_payment_receipts WHERE request_id=10')).rows[0].total_received,'51.50')

  const uncertain = await quote('Fine',11,'40')
  timeout = true
  await gateway.checkout(actor,{quoteId:uncertain.paymentId,requestKey:'uncertain-create'})
  const countAfterTimeout = creates
  await gateway.checkout(actor,{quoteId:uncertain.paymentId,requestKey:'uncertain-create'})
  assert.equal(creates,countAfterTimeout)
  assert.equal((await service.read(actor,uncertain.paymentId)).state,'Review')
  timeout = false
  const unknownSession = findSession(uncertain.paymentId)
  finish(unknownSession)
  await gateway.receive(config().webhookToken,event(unknownSession))
  await gateway.recover()
  assert.equal((await service.read(actor,uncertain.paymentId)).state,'Succeeded')

  const changed = await sessionFor('Fine',12,'40')
  await owner.query('INSERT INTO fine_adjustments(fine_id,amount_adjusted) VALUES(12,1)')
  finish(changed.session)
  await gateway.receive(config().webhookToken,event(changed.session));await gateway.recover()
  assert.equal((await service.read(actor,changed.quoted.paymentId)).state,'Review')
  assert.equal((await owner.query('SELECT count(*)::int count FROM fine_payment_receipts WHERE online_payment_attempt_id=$1',[changed.quoted.paymentId])).rows[0].count,0)

  const mismatch = await sessionFor('Fine',13,'40')
  finish(mismatch.session)
  captured.get(mismatch.session.payment_id).channel_code='CARDS'
  await gateway.receive(config().webhookToken,event(mismatch.session));await gateway.recover()
  assert.notEqual((await service.read(actor,mismatch.quoted.paymentId)).state,'Succeeded')
  assert.equal((await owner.query("SELECT state FROM online_payment_events WHERE payment_id=$1",[mismatch.quoted.paymentId])).rows[0].state,'Review')

  const outage = await sessionFor('Fine',14,'40')
  finish(outage.session)
  await gateway.receive(config().webhookToken,event(outage.session))
  providerOffline = true
  await gateway.recover()
  const deferred = (await owner.query('SELECT * FROM online_payment_events WHERE payment_id=$1',[outage.quoted.paymentId])).rows[0]
  assert.equal(deferred.state,'Pending');assert.equal(deferred.attempts,1)
  providerOffline = false
  now = new Date(now.getTime()+3*60_000)
  await owner.query(`UPDATE online_payment_events SET state='Processing',lease_token=$1,lease_until=$2
    WHERE payment_id=$3`,[randomUUID(),new Date(now.getTime()-1000),outage.quoted.paymentId])
  await gateway.recover()
  assert.equal((await service.read(actor,outage.quoted.paymentId)).state,'Succeeded')

  const expired = await sessionFor('Fine',15,'40')
  finish(expired.session,'EXPIRED')
  await gateway.receive(config().webhookToken,event(expired.session));await gateway.recover()
  assert.equal((await service.read(actor,expired.quoted.paymentId)).state,'Expired')

  const transactional = await sessionFor('Fine',16,'40')
  finish(transactional.session)
  await gateway.receive(config().webhookToken,event(transactional.session))
  let failAllocation = true
  const failingPool = {...pool,async getConnection(){
    const connection = await pool.getConnection()
    return {...connection,async execute(sql,values){
      if (failAllocation && sql.includes('INSERT INTO fine_payment_allocations')) {
        failAllocation=false;throw new Error('Synthetic allocation outage')
      }
      return connection.execute(sql,values)
    }}
  }}
  await createPaymentGatewayService(failingPool,{config,provider,clock:()=>now}).recover()
  assert.notEqual((await service.read(actor,transactional.quoted.paymentId)).state,'Succeeded')
  assert.equal((await owner.query('SELECT count(*)::int count FROM fine_payment_receipts WHERE online_payment_attempt_id=$1',
    [transactional.quoted.paymentId])).rows[0].count,0)
  now = new Date(now.getTime()+3*60_000)
  await gateway.recover()
  assert.equal((await service.read(actor,transactional.quoted.paymentId)).state,'Succeeded')

  const pendingPayment = await sessionFor('Fine',17,'40')
  finish(pendingPayment.session)
  captured.get(pendingPayment.session.payment_id).status='AUTHORIZED'
  await gateway.receive(config().webhookToken,event(pendingPayment.session));await gateway.recover()
  assert.notEqual((await service.read(actor,pendingPayment.quoted.paymentId)).state,'Succeeded')
  captured.get(pendingPayment.session.payment_id).status='SUCCEEDED'
  now = new Date(now.getTime()+3*60_000)
  await gateway.recover()
  assert.equal((await service.read(actor,pendingPayment.quoted.paymentId)).state,'Succeeded')
  const lost = await sessionFor('LostBook',1)
  finish(lost.session)
  await gateway.receive(config().webhookToken,event(lost.session));await gateway.recover()
  assert.equal((await owner.query('SELECT payment_status FROM lost_book_reports WHERE lost_book_report_id=1')).rows[0].payment_status,'Paid')
  assert.equal((await owner.query('SELECT amount_allocated FROM fine_payment_allocations WHERE lost_book_report_id=1')).rows[0].amount_allocated,'150.00')
  return {provider:'controlled-fixture',sessionConcurrency:'passed',duplicateCallbacks:'passed',fineAllocation:'passed',
    printingReceipt:'passed',unknownCreationRecovery:'passed',changedBalance:'passed',providerOutageRecovery:'passed',outOfOrder:'passed',
    settlementRollback:'passed',pendingCaptureRecovery:'passed',expiredLeaseRecovery:'passed',lostBookSettlement:'passed'}
}
