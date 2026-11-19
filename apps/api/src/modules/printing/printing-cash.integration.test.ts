import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { phaseTwoActors as actors,printingPhaseTwoFixture } from './printing-phase-two.test-fixture.ts'

test('real printing cash service accepts 40+60 exactly once, rejects changed retries and overpayment, and returns one request per bill',async t=>{
  const f=await printingPhaseTwoFixture();t.after(()=>f.close())
  const {createPrintingService}=await import('./printing.service.ts')
  const {PrintingRepository}=await import('./printing.repository.ts')
  const repository=new PrintingRepository(f.pool),service=createPrintingService(f.pool,repository,null)
  const first={amount_paid:'40.00',request_key:randomUUID()}
  const partial=await service.recordCash(actors.librarian,1,first)
  assert.equal(partial.payment_status,'Partially Paid');assert.equal(partial.balance,60)
  assert.equal(Number(partial.receipt!.amount_received),40)
  const retry=await service.recordCash(actors.librarian,1,first)
  assert.equal(retry.already_recorded,true);assert.equal(retry.receipt!.print_receipt_id,partial.receipt!.print_receipt_id)
  await assert.rejects(service.recordCash(actors.librarian,1,{...first,amount_paid:'41.00'}),{code:'PRINT_PAYMENT_RETRY_CHANGED'})
  await assert.rejects(service.recordCash(actors.librarian,1,{amount_paid:'60.01',request_key:randomUUID()}),{code:'PRINT_PAYMENT_AMOUNT_INVALID'})
  const settled=await service.recordCash(actors.staff,1,{amount_paid:'60.00',request_key:randomUUID()})
  assert.equal(settled.payment_status,'Paid');assert.equal(settled.balance,0);assert.equal(Number(settled.receipt!.amount_received),60)
  const money=await f.pg.query<{paid:string,receipts:number}>(`SELECT SUM(amount_received) paid,COUNT(*)::int receipts FROM print_payment_receipts WHERE request_id=1`)
  assert.deepEqual(money.rows,[{paid:'100.00',receipts:2}])
  assert.equal((await f.pg.query('SELECT * FROM notifications')).rows.length,2)
  const owned=await repository.ownRequests(actors.borrower.schoolId)
  assert.equal(owned.length,1,'two receipts must not duplicate the source printing request')
  const queue=await repository.queue({q:'',status:'',payment:'',page:1,limit:20})
  assert.equal(queue.pagination.total,2);assert.equal(queue.rows.length,2)
})

test('cash service rechecks live operator authority and rejects forged, inactive or mismatched account identities',async t=>{
  const f=await printingPhaseTwoFixture();t.after(()=>f.close())
  const {createPrintingService}=await import('./printing.service.ts')
  const {PrintingRepository}=await import('./printing.repository.ts')
  const service=createPrintingService(f.pool,new PrintingRepository(f.pool),null)
  const payment=()=>({amount_paid:40,request_key:randomUUID()})
  await assert.rejects(service.recordCash(actors.borrower,1,payment()),{status:403})
  await assert.rejects(service.recordCash({...actors.borrower,role:'Librarian'},1,payment()),{status:403})
  await assert.rejects(service.recordCash({...actors.librarian,schoolId:actors.borrower.schoolId},1,payment()),{status:403})
  await f.pg.exec(`UPDATE accounts SET account_status='Deactivated' WHERE account_id=20`)
  await assert.rejects(service.recordCash(actors.librarian,1,payment()),{status:403})
  assert.equal((await f.pg.query('SELECT * FROM print_cash_payments')).rows.length,0)
})
