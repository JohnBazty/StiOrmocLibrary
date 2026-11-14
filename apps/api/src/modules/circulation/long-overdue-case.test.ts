import assert from 'node:assert/strict'
import test from 'node:test'
import {createCaseTestDatabase,LIBRARIAN_ACCOUNT,STAFF_ACCOUNT} from './circulation-case.test.helper.ts'
import {createCirculationCaseService,openLongOverdueCaseInTransaction} from './circulation-case.service.ts'
const input={transactionId:900,physicalCopyId:50,borrowerUserId:7,policyVersionId:null,thresholdDays:3,thresholdReachedAt:new Date('2026-11-13T07:17:00Z'),title:'QA overdue title'}
test('long-overdue case creation is idempotent and does not declare a book lost or add a replacement charge',async()=>{
 const {pg,pool,connection}=await createCaseTestDatabase()
 try{
  await pg.exec("UPDATE borrow_transactions SET transaction_status='Overdue',returned_at=NULL WHERE transaction_id=900")
  const first=await openLongOverdueCaseInTransaction(connection as never,input)
  const again=await openLongOverdueCaseInTransaction(connection as never,input)
  assert.equal(first.created,true);assert.equal(again.created,false)
  assert.equal((await pg.query('SELECT 1 FROM circulation_cases')).rows.length,1)
  assert.equal((await pg.query('SELECT 1 FROM circulation_case_events')).rows.length,1)
  assert.equal((await pg.query('SELECT 1 FROM lost_book_reports')).rows.length,0)
  assert.equal((await pg.query<{status:string}>("SELECT transaction_status status FROM borrow_transactions WHERE transaction_id=900")).rows[0].status,'Overdue')
  const service=createCirculationCaseService(pool)
  const list=await service.listCases({})
  assert.equal(list.items[0].caseType,'Long Overdue')
  const detail=await service.addNote(STAFF_ACCOUNT,list.items[0].caseId,{notes:'Contact borrower for a physical return.'})
  assert.equal(detail.case.status,'Under Investigation')
  await assert.rejects(()=>service.recordDisposition(LIBRARIAN_ACCOUNT,list.items[0].caseId,{disposition:'lost',reason:'Unreturned'}),{code:'CASE_DISPOSITION_TYPE_INVALID'})
  const summaries=await service.publicSummariesForTransactions(7,[900])
  assert.equal(summaries.get(900)?.caseType,'Long Overdue')
  assert.doesNotMatch(summaries.get(900)?.instruction??'',/Contact borrower/)
 }finally{await pg.close()}
})

test('a confirmed physical return closes the long-overdue follow-up once without changing its fine', async () => {
 const {pg,pool,connection}=await createCaseTestDatabase()
 try {
  await pg.exec("UPDATE borrow_transactions SET transaction_status='Overdue',returned_at=NULL WHERE transaction_id=900; INSERT INTO fines(transaction_id,fine_amount,payment_status) VALUES(900,190,'Unpaid')")
  await openLongOverdueCaseInTransaction(connection as never,input)
  const {resolveLongOverdueCaseAtReturn}=await import('./circulation-case.service.ts')
  await resolveLongOverdueCaseAtReturn(connection as never,900,2,input.thresholdReachedAt)
  assert.equal((await pool.execute<any[]>("SELECT status FROM circulation_cases"))[0][0].status,'Open')
  await pg.exec("UPDATE borrow_transactions SET transaction_status='Returned',returned_at=NOW() WHERE transaction_id=900")
  await resolveLongOverdueCaseAtReturn(connection as never,900,2,input.thresholdReachedAt)
  await resolveLongOverdueCaseAtReturn(connection as never,900,2,input.thresholdReachedAt)
  assert.equal((await pool.execute<any[]>("SELECT status FROM circulation_cases"))[0][0].status,'Resolved')
  assert.equal((await pg.query("SELECT 1 FROM circulation_case_events WHERE event_type='Resolved'")).rows.length,1)
  assert.deepEqual((await pg.query("SELECT fine_amount::text,payment_status FROM fines WHERE transaction_id=900")).rows,[{fine_amount:'190.00',payment_status:'Unpaid'}])
 } finally {await pg.close()}
})

test('follow-up summaries prefer an active damage case over a closed overdue case and link Faculty to their portal', async () => {
 const {pg,pool,connection}=await createCaseTestDatabase()
 try {
  await pg.exec("INSERT INTO accounts VALUES(70,7,'Faculty','Active')")
  const overdue=await openLongOverdueCaseInTransaction(connection as never,input)
  await pg.query("UPDATE circulation_cases SET status='Resolved' WHERE case_id=$1",[overdue.caseId])
  const {openDamageCaseAtReturn}=await import('./circulation-case.service.ts')
  await openDamageCaseAtReturn(connection as never,{transactionId:900,physicalCopyId:50,borrowerUserId:7,actorUserId:2,baselineCondition:'Good',observedCondition:'Damaged',description:'Cover damaged.',openedAt:input.thresholdReachedAt})
  const summary=await createCirculationCaseService(pool).publicSummariesForTransactions(7,[900])
  assert.equal(summary.get(900)?.caseType,'Damage')
  assert.equal((await pg.query<{action_path:string}>('SELECT action_path FROM notifications LIMIT 1')).rows[0].action_path,'/faculty/borrowing')
  assert.equal((await createCirculationCaseService(pool).publicSummariesForTransactions(8,[900])).size,0)
 } finally {await pg.close()}
})
