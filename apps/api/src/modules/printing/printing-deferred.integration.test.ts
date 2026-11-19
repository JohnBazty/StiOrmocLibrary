import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import {phaseTwoActors as actors,printingPhaseTwoFixture} from './printing-phase-two.test-fixture.ts'

test('real deferred service records approval, owner acknowledgment and librarian revocation once with complete history',async t=>{
  const f=await printingPhaseTwoFixture();t.after(()=>f.close())
  const {createPrintingDeferredService}=await import('./printing-deferred.service.ts')
  const service=createPrintingDeferredService(f.pool),body={reason:'Borrower will settle at the library',version:1,request_key:randomUUID()}
  const approved=await service.approve(actors.librarian,1,body)
  assert.equal(approved.version,1)
  await service.approve(actors.librarian,1,body)
  assert.equal((await f.pg.query<any>('SELECT * FROM print_deferred_events')).rows.length,1)
  await assert.rejects(service.acknowledge(actors.other,1,{version:1,accepted:true}),{status:404})
  await assert.rejects(service.acknowledge(actors.borrower,1,{version:1,accepted:false}),{status:422})
  await service.acknowledge(actors.borrower,1,{version:1,accepted:true})
  await service.acknowledge(actors.borrower,1,{version:1,accepted:true})
  assert.equal((await f.pg.query<any>('SELECT * FROM print_deferred_events')).rows.length,2)
  await assert.rejects(service.revoke(actors.staff,1,{version:1,reason:'Staff cannot authorize'}),{status:403})
  await assert.rejects(service.revoke(actors.librarian,1,{version:2,reason:'Stale version'}),{status:409})
  await service.revoke(actors.librarian,1,{version:1,reason:'Borrower chose immediate payment'})
  await assert.rejects(service.acknowledge(actors.borrower,1,{version:1,accepted:true}),{status:409})
  const rows=(await f.pg.query<any>(`SELECT event_type FROM print_deferred_events ORDER BY event_id`)).rows
  assert.deepEqual(rows.map(row=>row.event_type),['Approved','Acknowledged','Revoked'])
  assert.equal((await f.pg.query<any>(`SELECT payment_status FROM print_requests WHERE request_id=1`)).rows[0].payment_status,'Unpaid')
  assert.equal((await f.pg.query<any>(`SELECT * FROM print_cash_payments`)).rows.length,0)
})

test('deferred service rejects unauthorized, stale and changed-price approvals without creating hidden debt or payment',async t=>{
  const f=await printingPhaseTwoFixture();t.after(()=>f.close())
  const {createPrintingDeferredService}=await import('./printing-deferred.service.ts')
  const service=createPrintingDeferredService(f.pool),body=()=>({reason:'Authorized remaining balance',version:1,request_key:randomUUID()})
  await assert.rejects(service.approve(actors.staff,1,body()),{status:403})
  await assert.rejects(service.approve({...actors.borrower,role:'Librarian'},1,body()),{status:403})
  await assert.rejects(service.approve(actors.librarian,1,{...body(),agreed_payment_date:'2026-99-01'}),{status:422})
  await assert.rejects(service.approve(actors.librarian,1,{...body(),agreed_payment_date:'2026-02-30'}),{status:422})
  await assert.rejects(service.approve(actors.librarian,1,{...body(),version:2}),{status:409})
  const first=body();await service.approve(actors.librarian,1,first)
  await assert.rejects(service.approve(actors.librarian,1,{...first,reason:'Different retry payload'}),{status:409})
  await f.pg.exec(`UPDATE print_requests SET calculated_cost=120,row_version=row_version+1 WHERE request_id=1`)
  await assert.rejects(service.acknowledge(actors.borrower,1,{version:1,accepted:true}),{status:409})
  await f.pg.exec(`UPDATE print_requests SET calculated_cost=100,pricing_snapshot='{"price":110}' WHERE request_id=1`)
  await assert.rejects(service.acknowledge(actors.borrower,1,{version:1,accepted:true}),{status:409})
  await f.pg.exec(`UPDATE print_requests SET pricing_snapshot='{"price":100}',pricing_review_state='Awaiting confirmation' WHERE request_id=1`)
  await assert.rejects(service.acknowledge(actors.borrower,1,{version:1,accepted:true}),{status:409})
  assert.equal((await f.pg.query<any>('SELECT * FROM print_deferred_events')).rows.length,1)
})

test('an approved balance can receive partial cash without losing agreement, but approval cannot begin or be revoked after printing',async t=>{
  const f=await printingPhaseTwoFixture();t.after(()=>f.close())
  const {createPrintingDeferredService}=await import('./printing-deferred.service.ts')
  const {createPrintingService}=await import('./printing.service.ts')
  const {PrintingRepository}=await import('./printing.repository.ts')
  const deferred=createPrintingDeferredService(f.pool),cash=createPrintingService(f.pool,new PrintingRepository(f.pool),null)
  await deferred.approve(actors.librarian,1,{reason:'Approved remaining counter balance',version:1,request_key:randomUUID()})
  await cash.recordCash(actors.librarian,1,{amount_paid:40,request_key:randomUUID()})
  await deferred.acknowledge(actors.borrower,1,{version:1,accepted:true})
  assert.equal((await f.pg.query<any>(`SELECT payment_status FROM print_requests WHERE request_id=1`)).rows[0].payment_status,'Partially Paid')
  await f.pg.exec(`UPDATE print_requests SET job_status='Printing' WHERE request_id=1`)
  await assert.rejects(deferred.revoke(actors.librarian,1,{version:1,reason:'Already printing'}),{status:409})
  await assert.rejects(deferred.approve(actors.librarian,1,{reason:'Cannot approve after printing',version:4,request_key:randomUUID()}),{status:409})
  await cash.recordCash(actors.librarian,1,{amount_paid:60,request_key:randomUUID()})
  assert.equal((await f.pg.query<any>(`SELECT payment_status FROM print_requests WHERE request_id=1`)).rows[0].payment_status,'Paid')
})
