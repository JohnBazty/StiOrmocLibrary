import assert from 'node:assert/strict'
import test from 'node:test'
import { invoiceAmounts } from './printing-invoice.ts'

test('invoice shows a bill before payment and no amount due after confirmed payment or cancellation', () => {
  assert.deepEqual(invoiceAmounts('18.50', 'Unpaid', 'Pending'), { total: 18.5, amountDue: 18.5, status: 'Unpaid' })
  assert.deepEqual(invoiceAmounts('18.50', 'Paid', 'Completed'), { total: 18.5, amountDue: 0, status: 'Paid' })
  assert.deepEqual(invoiceAmounts('18.50', 'Paid', 'Cancelled'), { total: 18.5, amountDue: 0, status: 'Cancelled' })
  assert.deepEqual(invoiceAmounts(0, 'Unpaid', 'Pending'), { total: 0, amountDue: 0, status: 'Unpaid' })
})
test('invalid charges cannot become printable bills', () => {
  for (const amount of [-1, 'bad', Infinity]) assert.throws(() => invoiceAmounts(amount, 'Unpaid', 'Pending'), /staff review/)
})
test('refund invoices retain explicit pending/refunded state and do not ask for another payment',()=>{
  assert.deepEqual(invoiceAmounts(5,'Refund pending','Pending'),{total:5,amountDue:0,status:'Refund pending'})
  assert.deepEqual(invoiceAmounts(5,'Refunded','Cancelled'),{total:5,amountDue:0,status:'Refunded'})
})
