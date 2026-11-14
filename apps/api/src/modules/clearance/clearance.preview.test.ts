import assert from 'node:assert/strict'
import test from 'node:test'
import { createClearanceService } from './clearance.service.ts'
import type { PreviewCredit } from '../payments/preview-balances.ts'

function fixture(credits: PreviewCredit[] | undefined, options: { loan?: boolean; override?: string; resolution?: string; cashPaid?: number } = {}) {
  const statements: string[] = []
  const database = { async execute(sql: string) {
    statements.push(sql)
    if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 7 }]]
    if (sql.includes('FROM users u WHERE')) return [[{ user_id: 7, school_id: 'QA-CLEARANCE', full_name: 'Disposable borrower', account_status: 'Active' }]]
    if (sql.includes('FROM borrow_transactions bt INNER JOIN materials')) return [options.loan ? [{ transaction_id: 10, fine_id: 1, title: 'Unreturned book', current_fine: 190, transaction_status: 'Borrowed' }] : []]
    if (sql.includes('SELECT calculated.*')) return [[1, 2].map(id => ({ fine_id: id, title: 'Fine ' + id, fine_amount: 190, calculation_basis: 'Daily', overdue_units: 19, rate_applied: 10 }))]
    if (sql.includes('FROM lost_book_reports l INNER JOIN borrow_transactions')) return [[{ lost_book_report_id: 1, title: 'Lost book', replacement_charge: 50, paid_amount:options.cashPaid??0, report_status: 'Confirmed', charge_resolution: options.resolution??'Quoted', payment_status: 'Unpaid' }]]
    if (sql.includes('FROM clearance_overrides o INNER JOIN users')) return [options.override ? [{ clearance_override_id: 8, override_status: options.override, reason: 'Staff review', applied_by: 'Librarian' }] : []]
    if (sql.includes('FROM in_library_uses')) return [[]]
    throw new Error('Unexpected statement')
  } } as never
  return { statements, service: createClearanceService(database, credits === undefined ? {} : { previewCredits: async () => credits }) }
}
const actor = { accountId: 3, role: 'Student' }

test('book-price replacement charges combine cash allocations and confirmed online principal',async()=>{
  const fines=full.filter(row=>row.kind==='Fine')
  const partial=await fixture(fines,{resolution:'Book Price',cashPaid:20}).service.mine(actor)
  assert.equal(partial.summary.unpaidReplacementCharges,30)
  const paid=await fixture([...fines,{kind:'LostBook',targetId:1,principalCentavos:3000,paymentId:'balance'}],{resolution:'Book Price',cashPaid:20}).service.mine(actor)
  assert.equal(paid.summary.totalOutstanding,0)
  assert.equal(paid.lostBooks[0].paymentStatus,'Paid')
})
test('dashboard standing can read the signed-in account without updating the official cache', async () => {
  const f = fixture(undefined), result = await f.service.mine(actor, false)
  assert.equal(result.summary.totalOutstanding, 430)
  assert.equal(result.status, 'Not Cleared')
  assert.ok(f.statements.every(sql => /^\s*SELECT/i.test(sql)))
})
const full: PreviewCredit[] = [1, 2].map(targetId => ({ kind: 'Fine', targetId, principalCentavos: 19000, paymentId: 'fine-' + targetId }))
full.push({ kind: 'LostBook', targetId: 1, principalCentavos: 5000, paymentId: 'replacement' })

test('clearance removes fully paid fines and replacement blockers without writing the official cache', async () => {
  const f = fixture(full), result = await f.service.mine(actor)
  assert.equal(result.status, 'Cleared'); assert.equal(result.computedStatus, 'Cleared')
  assert.equal(result.summary.totalOutstanding, 0); assert.equal(result.summary.blockCount, 0)
  assert.deepEqual(result.fines, []); assert.equal(result.lostBooks[0].paymentStatus, 'Paid')
  assert.equal(result.reason, 'No library obligations')
  assert.ok(f.statements.every(sql => /^\s*SELECT/i.test(sql)))
  const original = await f.service.compute(7, false)
  assert.equal(original.summary.totalOutstanding, 430, 'Staff calculation retains original school amounts')
  assert.equal(original.status, 'Not Cleared')
})

test('partial credits update every outstanding figure but do not clear unpaid charges', async () => {
  const f = fixture([{ kind: 'Fine', targetId: 1, principalCentavos: 5000, paymentId: 'partial' }])
  const result = await f.service.mine(actor)
  assert.equal(result.summary.unpaidOverdueFines, 330)
  assert.equal(result.summary.unpaidReplacementCharges, 50)
  assert.equal(result.summary.totalOutstanding, 380)
  assert.equal(result.fines.find(row => row.fineId === 1)?.amount, 140)
  assert.match(result.reason, /330\.00/); assert.equal(result.status, 'Not Cleared')
})

test('paying charges never removes an unreturned book or overrides an authorized decision', async () => {
  const withLoan = await fixture(full, { loan: true }).service.mine(actor)
  assert.equal(withLoan.summary.totalOutstanding, 0)
  assert.equal(withLoan.summary.activeLoans, 1); assert.equal(withLoan.loans.length, 1)
  assert.equal(withLoan.loans[0].currentFine, 0)
  assert.equal(withLoan.computedStatus, 'Not Cleared'); assert.match(withLoan.reason, /1 unreturned book/)
  const overridden = await fixture(full, { override: 'Not Cleared' }).service.mine(actor)
  assert.equal(overridden.computedStatus, 'Cleared'); assert.equal(overridden.status, 'Not Cleared')
  assert.match(overridden.reason, /Authorized override/)
})

test('credits for another bill or for printing never clear library obligations', async () => {
  const result = await fixture([{ kind: 'Fine', targetId: 99, principalCentavos: 99999, paymentId: 'other' },
    { kind: 'Printing', targetId: 1, principalCentavos: 19000, paymentId: 'print' }]).service.mine(actor)
  assert.equal(result.summary.totalOutstanding, 430); assert.equal(result.status, 'Not Cleared')
})

test('confirmed refund restore reopens clearance, while cancellation credits keep the incorrect charge cleared',async()=>{
  const restored=full.map(row=>row.kind==='Fine'&&row.targetId===1?{...row,principalCentavos:14000}:row)
  const reopened=await fixture(restored).service.mine(actor)
  assert.equal(reopened.summary.totalOutstanding,50);assert.equal(reopened.computedStatus,'Not Cleared')
  const cancelled=await fixture([...restored,{kind:'Fine',targetId:1,principalCentavos:5000,paymentId:'refund',voided:true}]).service.mine(actor)
  assert.equal(cancelled.summary.totalOutstanding,0);assert.equal(cancelled.computedStatus,'Cleared')
})
