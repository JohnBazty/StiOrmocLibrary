import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { createFinesService,refreshClearance } from '../src/modules/fines/fines.service.ts'
import { createPrintingService } from '../src/modules/printing/printing.service.ts'
import { PrintingRepository } from '../src/modules/printing/printing.repository.ts'
import { createFineReceiptPdf } from '../src/modules/fines/fines.pdf.ts'
import { createPrintingReceiptPdf } from '../src/modules/printing/printing-receipt.pdf.ts'

export async function verifyPaymentCounter({pool,owner,service,gateway,actor,sessionFor,sessionByPayment,finish,event,config,controls}) {
  await owner.query(`ALTER TABLE users ADD COLUMN user_role text DEFAULT 'Student';
    UPDATE users SET school_id='QA-PAYMENT-001' WHERE user_id=1;
    UPDATE users SET school_id='QA-PAYMENT-LIB',user_role='Librarian' WHERE user_id=3;
    ALTER TABLE fine_adjustments ADD COLUMN reason text,ADD COLUMN adjusted_by_user_id bigint,ADD COLUMN adjusted_at timestamptz;
    ALTER TABLE borrow_transactions ADD COLUMN material_id bigint,ADD COLUMN physical_copy_id bigint;
    ALTER TABLE lost_book_reports ADD COLUMN transaction_id bigint;
    CREATE TABLE materials(material_id bigint PRIMARY KEY,title text);
    CREATE TABLE titles(title_id bigint PRIMARY KEY,title text);
    CREATE TABLE physical_copies(physical_copy_id bigint PRIMARY KEY,title_id bigint);
    CREATE TABLE fine_infractions(fine_id bigint,category text);
    CREATE TABLE notifications(user_id bigint,message_title text,message_body text,trigger_type text,source_type text,
      source_id bigint,action_path text,priority text,dedupe_key text,scheduled_for timestamptz,delivered_at timestamptz,
      UNIQUE(user_id,dedupe_key));
    CREATE TABLE print_status_history(request_id bigint,from_status text,to_status text,changed_by_user_id bigint,reason text);
    ALTER TABLE print_requests ADD COLUMN cancelled_at timestamptz,ADD COLUMN cancelled_reason text,ADD COLUMN processed_by_user_id bigint;
    INSERT INTO print_requests(request_id,user_id,calculated_cost,payment_status,job_status)
      SELECT id,1,50,'Unpaid','Pending' FROM generate_series(30,39) id;
    INSERT INTO fines(fine_id,user_id,fine_amount,fine_type,payment_status)
      SELECT id,1,100,'Infraction','Unpaid' FROM generate_series(30,39) id;`)
  const fines=createFinesService(pool),printing=createPrintingService(pool,new PrintingRepository(pool))
  const librarian={accountId:3,role:'Librarian'},printLibrarian={schoolId:'QA-PAYMENT-LIB',role:'Librarian'}
  const blocked=error=>error.code==='ONLINE_PAYMENT_ACTIVE'
  const payFine=id=>fines.recordCashPayment(librarian,{requestKey:'counter-fixture-'+id,allocations:[{fineId:id,amount:10}]})
  const first=await sessionFor('Fine',30,'40')
  await assert.rejects(payFine(30),blocked)
  await assert.rejects(fines.adjust(librarian,30,{type:'Waiver',reason:'Disposable waiver check'}),blocked)
  const options=await service.options(actor,{kind:'Fine',targetId:30})
  assert.equal(options.active.paymentId,first.quoted.paymentId)
  assert.equal(options.methods[0].channelCode,'CARDS')
  assert.equal((await gateway.cancel(actor,first.quoted.paymentId)).state,'Cancelled')
  const cash=await payFine(30)
  assert.equal(cash.paymentMethod,'Cash');assert.equal(cash.transactionFeeCentavos,0)
  assert.equal(cash.totalReceived,10)
  const pendingFine=await sessionFor('Fine',30,'20')
  await assert.rejects(fines.reverseReceipt(librarian,cash.receiptId,{reason:'Disposable active-payment reversal'}),blocked)
  assert.equal((await owner.query('SELECT receipt_status FROM fine_payment_receipts WHERE fine_payment_receipt_id=$1',[cash.receiptId])).rows[0].receipt_status,'Issued')
  await gateway.cancel(actor,pendingFine.quoted.paymentId)

  const print=await sessionFor('Printing',30)
  const payPrint=()=>printing.recordCash(printLibrarian,30,{amount_paid:50})
  await assert.rejects(payPrint(),blocked)
  await assert.rejects(printing.cancelOwn({schoolId:'QA-PAYMENT-001',role:'Student'},30),blocked)
  controls.hangCancel(true)
  const pending=await gateway.cancel(actor,print.quoted.paymentId)
  assert.equal(pending.cancellationPending,true);assert.equal(pending.checkoutUrl,null)
  await assert.rejects(payPrint(),blocked)
  controls.hangCancel(false);controls.advance(2)
  assert.equal((await gateway.check(actor,print.quoted.paymentId)).state,'Cancelled')
  assert.equal((await payPrint()).receipt.payment_method,'Cash')
  const printCash=(await new PrintingRepository(pool).receiptById((await owner.query('SELECT print_receipt_id FROM print_payment_receipts WHERE request_id=30')).rows[0].print_receipt_id))
  assert.equal(printCash.total_received,'50.00');assert.equal(printCash.transaction_fee_centavos,'0')

  const race=await sessionFor('Printing',31)
  controls.raceCancel()
  assert.equal((await gateway.cancel(actor,race.quoted.paymentId)).state,'Succeeded')
  await assert.rejects(printing.recordCash(printLibrarian,31,{amount_paid:50}),error=>error.code==='PRINT_ALREADY_PAID')
  const onlinePrint=await new PrintingRepository(pool).receiptById((await owner.query('SELECT print_receipt_id FROM print_payment_receipts WHERE request_id=31')).rows[0].print_receipt_id)
  assert.equal(onlinePrint.confirmation_source,'Xendit');assert.equal(onlinePrint.total_received,'51.50')
  await assert.rejects(printing.cancelOwn({schoolId:'QA-PAYMENT-001',role:'Student'},31),error=>error.code==='PRINT_REFUND_REVIEW_REQUIRED')

  const fine=await sessionFor('Fine',31,'40');finish(fine.session)
  await gateway.receive(config().webhookToken,event(fine.session));await gateway.recover()
  const paid=await service.read(actor,fine.quoted.paymentId)
  assert.ok(paid.receiptId)
  const onlineFine=await fines.receipt(paid.receiptId,actor)
  assert.equal(onlineFine.receivedBy,'Xendit');assert.equal(onlineFine.paymentMethod,'GCASH');assert.equal(onlineFine.totalReceived,41.40)
  await assert.rejects(owner.query("UPDATE fine_payment_receipts SET receipt_status='Reversed' WHERE fine_payment_receipt_id=$1",[paid.receiptId]),error=>error.code==='23514')
  assert.equal((await service.list(librarian,{channel:'GCASH',kind:'Fine',state:'Succeeded'})).items.some(item=>item.paymentId===paid.paymentId),true)
  await assert.rejects(gateway.cancel({accountId:2,role:'Student'},first.quoted.paymentId),error=>error.status===404)
  await assert.rejects(gateway.cancel({accountId:2,role:'Student'},first.quoted.paymentId,true),error=>error.status===403)
  const capturedReview=(await owner.query("SELECT payment_id FROM online_payment_attempts WHERE state='Review' AND provider_payment_id IS NOT NULL LIMIT 1")).rows[0]
  await assert.rejects(gateway.cancel(actor,capturedReview.payment_id),error=>error.code==='ONLINE_REFUND_REQUIRED')

  // Cash owns the row first. A checkout waiting on that row must see the fresh allocation after waiting.
  const queued=await service.quote(actor,{kind:'Fine',targetId:32,channelCode:'GCASH',amount:'40'})
  const lock=await pool.getConnection();await lock.beginTransaction()
  await lock.execute('SELECT fine_id FROM fines WHERE fine_id=32 FOR UPDATE')
  const waiting=gateway.checkout(actor,{quoteId:queued.paymentId,requestKey:'wait-for-cash-fixture'})
  await new Promise(resolve=>setTimeout(resolve,100))
  const [receipt]=await lock.execute(`INSERT INTO fine_payment_receipts(request_key,user_id,amount_received,received_by_user_id,received_at)
    VALUES('concurrent-cash-fixture',1,10,3,now()) RETURNING fine_payment_receipt_id`)
  await lock.execute(`INSERT INTO fine_payment_allocations(fine_payment_receipt_id,fine_id,amount_allocated,balance_before,balance_after)
    VALUES(?,32,10,100,90)`,[receipt.rows[0].fine_payment_receipt_id])
  await lock.execute("UPDATE fines SET payment_status='Partially Paid' WHERE fine_id=32")
  await lock.commit();lock.release()
  await assert.rejects(waiting,error=>error.code==='PAYMENT_QUOTE_CHANGED')

  await owner.query(`INSERT INTO users(user_id,account_status,school_id) VALUES(4,'Active','QA-PAYMENT-004');
    INSERT INTO accounts VALUES(4,4,'Student','Active',1,'QA-PAYMENT-004');
    UPDATE fines SET user_id=4 WHERE fine_id=39;
    INSERT INTO borrow_transactions(transaction_id,transaction_status,user_id) VALUES(40,'Borrowed',4);`)
  const otherStudent={accountId:4,role:'Student'}
  async function settlePortion(amount,key){
    const quoted=await service.quote(otherStudent,{kind:'Fine',targetId:39,channelCode:'GCASH',amount})
    await gateway.checkout(otherStudent,{quoteId:quoted.paymentId,requestKey:key})
    const session=sessionByPayment(quoted.paymentId);finish(session)
    await gateway.receive(config().webhookToken,event(session));await gateway.recover()
  }
  await settlePortion('40','clearance-partial-fixture')
  assert.equal((await owner.query('SELECT payment_status FROM fines WHERE fine_id=39')).rows[0].payment_status,'Partially Paid')
  await settlePortion('60','clearance-full-fixture')
  assert.equal((await owner.query('SELECT payment_status FROM fines WHERE fine_id=39')).rows[0].payment_status,'Paid')
  assert.equal((await owner.query('SELECT standing_status FROM clearance_statuses WHERE user_id=4')).rows[0].standing_status,'Not Cleared')
  await owner.query("UPDATE borrow_transactions SET transaction_status='Returned' WHERE transaction_id=40")
  const clearance=await pool.getConnection();await clearance.beginTransaction();await refreshClearance(clearance,4);await clearance.commit();clearance.release()
  assert.equal((await owner.query('SELECT standing_status FROM clearance_statuses WHERE user_id=4')).rows[0].standing_status,'Cleared')

  // Keep synthetic PDFs outside Git for text/layout inspection.
  async function save(stream,path){const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));await writeFile(path,Buffer.concat(chunks))}
  await save(createFineReceiptPdf(onlineFine),'output/xendit-sandbox/phase45-fine-receipt.pdf')
  await save(createPrintingReceiptPdf(onlinePrint),'output/xendit-sandbox/phase45-print-receipt.pdf')
  return {cashReservation:'passed',cancellationPending:'passed',cancelPaymentRace:'passed',freshBalanceAfterWait:'passed',
    receiptReadback:'passed',refundProtection:'passed',clearance:'passed',cashFees:'zero',syntheticPdfs:'generated'}
}
