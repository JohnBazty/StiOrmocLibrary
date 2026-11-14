import assert from 'node:assert/strict'
import test from 'node:test'
import { previewCredit, previewFine, previewPrint, type PreviewCredit } from './preview-balances.ts'

const fine = { fineId: 1, lostBookReportId: null, balance: 190, paid: 0, status: 'Unpaid', paymentAllowed: true }
const credits: PreviewCredit[] = [{ kind: 'Fine', targetId: 1, principalCentavos: 5000, paymentId: 'partial' }]
test('a partial verified credit updates amount, balance and status without changing the source', () => {
  const result = previewFine(fine, credits)
  assert.equal(result.balance, 140); assert.equal(result.paid, 50)
  assert.equal(result.status, 'Partially Paid'); assert.equal(result.paymentAllowed, true)
  assert.equal(fine.balance, 190); assert.equal(fine.paid, 0)
  assert.equal(previewFine({ ...fine, fineId: 2 }, credits).balance, 190)
})
test('full and repeated legacy completions cap at the outstanding bill and disable Pay', () => {
  const result = previewFine(fine, [...credits, { ...credits[0], principalCentavos: 19000, paymentId: 'full' }])
  assert.equal(result.status, 'Paid'); assert.equal(result.balance, 0)
  assert.equal(result.paid, 190); assert.equal(result.paymentAllowed, false)
  assert.equal(result.localPaymentId, 'full')
  assert.equal(previewFine({ ...fine, balance: 0, paid: 190, status: 'Paid' }, credits).paid, 190)
  assert.equal(previewFine({ ...fine, status: 'Voided' }, credits).status, 'Voided')
})
test('printing/replacement namespaces never collide and cancelled print jobs remain cancelled', () => {
  const print = { request_id: 1, calculated_cost: 50, payment_status: 'Unpaid', job_status: 'Pending' }
  assert.equal(previewPrint(print, credits).payment_status, 'Unpaid')
  const printingCredits: PreviewCredit[] = [{ ...credits[0], kind: 'Printing' }]
  assert.equal(previewPrint(print, printingCredits).payment_status, 'Paid')
  assert.equal(previewPrint({ ...print, job_status: 'Cancelled' }, printingCredits).payment_status, 'Unpaid')
  assert.equal(previewPrint(print, [{ ...printingCredits[0], principalCentavos: 4900 }]).payment_status, 'Unpaid')
  assert.equal(previewCredit(credits, 'LostBook', 1, 19000).applied, 0)
})
test('a confirmed refund takes precedence over a previously paid printing view',()=>{
  const result=previewPrint({request_id:1,calculated_cost:50,payment_status:'Paid',job_status:'Pending'},[{kind:'Printing',targetId:1,principalCentavos:5000,paymentId:'refund-1',voided:true}])
  assert.equal(result.payment_status,'Refunded');assert.equal(result.job_status,'Cancelled')
})
