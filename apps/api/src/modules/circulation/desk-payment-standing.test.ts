import assert from 'node:assert/strict'
import test from 'node:test'
import { borrowerEligibility } from './desk-circulation.policy.ts'
import { createRenewalRepository } from './renewal.repository.ts'
import { borrowerEligibilityRows } from '../attendance/attendance-test-fixtures.ts'
import type { PreviewCredit } from '../payments/preview-balances.ts'

const full:PreviewCredit[]=[{kind:'Fine',targetId:1,principalCentavos:19000,paymentId:'confirmed'}]
function fixture(overdue=false,hold=false){
  const statements:string[]=[]
  const q={async execute(sql:string){
    statements.push(sql)
    if(sql.includes('FROM fines f'))return [[{fine_id:1,balance:'190.00'}]]
    if(sql.includes('FROM lost_book_reports l'))return [[]]
    if(sql.includes('FROM clearance_overrides'))return [hold?[{override_status:'Not Cleared',reason:'Staff hold'}]:[]]
    if(sql.includes("AND (transaction_status='Overdue'"))return [overdue?[{transaction_id:1}]:[]]
    if(sql.includes('FROM borrowing_policy_versions'))return [[{student_max_active_books:2}]]
    if(sql.includes('FROM fines'))return [[{fine_id:1}]]
    if(sql.includes('FROM lost_book_reports'))return [[]]
    const rows=borrowerEligibilityRows(sql,'Student',7)
    if(rows!==undefined)return [rows]
    throw new Error('Unexpected SQL: '+sql)
  }}
  return {q:q as never,statements}
}
test('online cart and desk borrowing use confirmed payment balance and preserve other holds',async()=>{
  const f=fixture(),now=new Date('2026-11-16T01:00:00Z')
  const unpaid=await borrowerEligibility(f.q,7,now,'Online',[])
  assert.equal(unpaid.balance,190);assert.match(unpaid.blockers.join(' '),/₱190.00/)
  const paid=await borrowerEligibility(f.q,7,now,'Online',full)
  assert.equal(paid.balance,0);assert.deepEqual(paid.blockers,[])
  const partial=await borrowerEligibility(f.q,7,now,'Online',[{...full[0],principalCentavos:5000}])
  assert.equal(partial.balance,140);assert.match(partial.blockers.join(' '),/₱140.00/)
  const held=await borrowerEligibility(fixture(true,true).q,7,now,'Online',full)
  assert.equal(held.balance,0);assert.match(held.blockers.join(' '),/Return overdue books/);assert.match(held.blockers.join(' '),/Staff hold/)
})
test('renewal preview and confirmation share payment-aware fine blockers',async()=>{
  const f=fixture(),repository=createRenewalRepository(f.q,{previewCredits:async()=>full})
  const loan={userId:7,transactionId:1,titleId:null} as never
  assert.equal((await repository.loadBlockState(loan,f.q)).hasOutstandingFine,false)
  const unpaid=createRenewalRepository(f.q,{previewCredits:async()=>[]})
  assert.equal((await unpaid.loadBlockState(loan,f.q,true)).hasOutstandingFine,true)
})
