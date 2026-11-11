import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {createPaymentOperations} from '../src/modules/payments/payments.operations.ts'
import {createPaymentsService} from '../src/modules/payments/payments.service.ts'
import {createPaymentGatewayService} from '../src/modules/payments/payments.gateway.ts'
import {createLiveReportsService,parseReportFilters,exportLiveReport} from '../src/modules/reports/live-reports.service.ts'
import {verifyIntegrityProtectedCsv} from '../src/modules/reports/csv-integrity.ts'
import {PrintingRepository} from '../src/modules/printing/printing.repository.ts'
import {guardCounterPayment} from '../src/modules/payments/payments.guard.ts'

export async function verifyPaymentOperations({pool,owner,service,gateway,actor,config,provider,clock,sessionFor,finish,event}){
  await owner.query(`CREATE TABLE academic_terms(academic_term_id bigint,academic_year text,term_name text,starts_on date,ends_on date);
    CREATE TABLE library_job_runs(job_name text,last_success_at timestamp,last_error text);
    INSERT INTO library_job_runs VALUES('operational-minute',now(),NULL);
    INSERT INTO print_requests(request_id,user_id,calculated_cost,payment_status,job_status) VALUES(70,1,50,'Unpaid','Pending'),(80,1,50,'Unpaid','Pending');`)
  const older=await sessionFor('Printing',80)
  await gateway.cancel(actor,older.quoted.paymentId)
  // A delayed captured outcome must retain review evidence alongside a newer active session.
  await owner.query('UPDATE print_requests SET calculated_cost=40 WHERE request_id=80')
  const newer=await sessionFor('Printing',80)
  finish(older.session);await gateway.receive(config().webhookToken,event(older.session));await gateway.recover(25)
  assert.equal((await service.read(actor,older.quoted.paymentId)).state,'Review')
  assert.equal((await owner.query('SELECT provider_payment_id FROM online_payment_attempts WHERE payment_id=$1',[older.quoted.paymentId])).rows[0].provider_payment_id,older.session.payment_id)
  await gateway.cancel(actor,newer.quoted.paymentId)
  const counter=await pool.getConnection();await counter.beginTransaction()
  try{await counter.execute('SELECT request_id FROM print_requests WHERE request_id=80 FOR UPDATE');await assert.rejects(guardCounterPayment(counter,{kind:'Printing',targetId:80}),error=>error.code==='ONLINE_PAYMENT_ACTIVE')}
  finally{await counter.rollback();counter.release()}
  await assert.rejects(service.prepare(actor,{quoteId:(await service.quote(actor,{kind:'Printing',targetId:80,channelCode:'GCASH'})).paymentId,requestKey:'late-capture-review-fixture'}),error=>error.code==='PAYMENT_ALREADY_ACTIVE')
  const pausedConfig=()=>({...config(),checkoutEnabled:false})
  const pausedService=createPaymentsService(pool,{enabled:()=>true,checkoutEnabled:()=>false,clock})
  const pausedGateway=createPaymentGatewayService(pool,{config:pausedConfig,provider,clock})
  const operations=createPaymentOperations(pool,{config:pausedConfig,gateway:pausedGateway,clock})
  const librarian={accountId:3,role:'Librarian'}
  const pending=await sessionFor('Printing',70)
  await assert.rejects(pausedService.quote(actor,{kind:'Printing',targetId:70,channelCode:'GCASH'}),error=>error.code==='ONLINE_CHECKOUT_PAUSED')
  const options=await pausedService.options(actor,{kind:'Printing',targetId:70})
  assert.equal(options.paymentAllowed,false);assert.equal(options.active.paymentId,pending.quoted.paymentId)
  finish(pending.session);await pausedGateway.receive(config().webhookToken,event(pending.session))
  await operations.recover()
  assert.equal((await service.read(actor,pending.quoted.paymentId)).state,'Succeeded')
  const status=await operations.status(librarian)
  assert.equal(status.checkoutEnabled,false);assert.equal(status.runner,'operational-minute')
  await assert.rejects(operations.status(actor),error=>error.status===403)
  const settlement={reference:'TEST-SETTLEMENT-ONLY',processingCost:'1.50',settledAt:clock().toISOString()}
  await operations.settlement(librarian,pending.quoted.paymentId,settlement)
  await operations.settlement(librarian,pending.quoted.paymentId,settlement)
  await assert.rejects(operations.settlement(librarian,pending.quoted.paymentId,{...settlement,processingCost:'1.51'}),error=>error.code==='SETTLEMENT_ALREADY_RECORDED')
  assert.equal((await operations.readSettlement(librarian,pending.quoted.paymentId)).net_centavos,'5000')
  await assert.rejects(owner.query('UPDATE online_payment_settlements SET processing_cost_centavos=0'),error=>error.code==='55000')
  await assert.rejects(owner.query('DELETE FROM online_payment_settlements'),error=>error.code==='55000')
  await assert.rejects(owner.query(`INSERT INTO online_payment_settlements(payment_id,provider_reference,gross_centavos,processing_cost_centavos,settled_at,recorded_by_account_id)
    SELECT payment_id,'TEST-WRONG',1,0,now(),3 FROM online_payment_attempts WHERE state<>'Succeeded' LIMIT 1`),error=>error.code==='23514')
  const reports=createLiveReportsService(pool)
  const printing=await reports.read(3,parseReportFilters({kind:'printRevenue'}))
  const fine=await reports.read(3,parseReportFilters({kind:'payments'}))
  const reconciliation=await reports.read(3,parseReportFilters({kind:'onlinePayments'}))
  assert.ok(reconciliation.rows.some(row=>row.id===older.quoted.paymentId&&row.status==='Review'&&row.provider_reference===older.session.payment_id))
  assert.ok(reconciliation.metrics.captured_needing_review>0)
  assert.equal(verifyIntegrityProtectedCsv(await (async()=>{const chunks=[];for await(const chunk of exportLiveReport(reconciliation,'csv'))chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)})()).valid,true)
  assert.ok(printing.rows.some(row=>row.provider_reference===pending.session.payment_id&&Number(row.principal)===50&&Number(row.transaction_fee)===1.5))
  assert.equal(printing.rows.filter(row=>row.receipt_number==='QA-OLD-PRINT').length,1)
  assert.ok(fine.rows.some(row=>row.confirmation_source==='Xendit'&&Number(row.transaction_fee)>0))
  assert.equal(printing.metrics.net_settled,50)
  const printingRepository=new PrintingRepository(pool),financeFilters={from:'2000-01-01',to:'2100-01-01',period:'monthly',label:'QA only'}
  assert.equal((await printingRepository.revenueSummary(financeFilters)).total_revenue,printing.metrics.principal)
  const revenueEntries=await printingRepository.revenueEntries(financeFilters)
  assert.equal(revenueEntries.length,printing.rows.filter(row=>row.status==='Issued').length)
  assert.ok(revenueEntries.some(row=>row.provider_reference===pending.session.payment_id&&Number(row.amount_paid)===50))
  const manila=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock())
  const dated=await reports.read(3,parseReportFilters({kind:'printRevenue',period:'custom',from:manila,to:manila}))
  assert.ok(dated.rows.some(row=>row.provider_reference===pending.session.payment_id))
  async function bytes(stream){const chunks=[];for await(const c of stream)chunks.push(Buffer.from(c));return Buffer.concat(chunks)}
  for(const report of [printing,fine]){
    const csv=await bytes(exportLiveReport(report,'csv'))
    assert.equal(verifyIntegrityProtectedCsv(csv).valid,true)
    assert.match(csv.toString(),/provider_reference/)
    await writeFile(`output/xendit-sandbox/phase67-${report.kind}.csv`,csv)
    await writeFile(`output/xendit-sandbox/phase67-${report.kind}.json`,JSON.stringify(report))
    await writeFile(`output/xendit-sandbox/phase67-${report.kind}.pdf`,await bytes(exportLiveReport(report,'pdf')))
  }
  await owner.query("SET ROLE anon")
  await assert.rejects(owner.query('SELECT * FROM online_payment_settlements'),error=>error.code==='42501')
  await owner.query('RESET ROLE')
  const protection=(await owner.query("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') anon_select,has_table_privilege('authenticated',oid,'SELECT') authenticated_select FROM pg_class WHERE oid='online_payment_settlements'::regclass")).rows[0]
  assert.equal(protection.relrowsecurity,true);assert.equal(protection.anon_select,false);assert.equal(protection.authenticated_select,false)
  return {lateCaptureConflict:'passed',pausedRecovery:'passed',settlementEvidence:'passed',appendOnly:'passed',reportMath:'passed',manilaRange:'passed',legacyCashOnce:'passed',exportIntegrity:'passed',browserRole:'denied'}
}
