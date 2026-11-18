import assert from 'node:assert/strict'
import test from 'node:test'
import type { RowDataPacket } from 'mysql2/promise'
import { revenueSnapshot } from './printing-revenue.ts'
import { parseFinanceFilters } from './printing.validation.ts'

test('snapshot sums principal to centavos and retains unknown historical quantities', () => {
  const entries = [
    {amount_paid:'0.10',total_sheets:1,number_of_copies:1,payment_method:'Cash'},
    {amount_paid:'0.20',total_sheets:2,number_of_copies:1,payment_method:'GCASH',transaction_fee:5},
    {amount_paid:'20.00',total_sheets:null,number_of_copies:null},
  ] as unknown as RowDataPacket[]
  const snapshot = revenueSnapshot(entries,parseFinanceFilters({period:'daily',date:'2026-11-18'}))
  assert.equal(snapshot.summary.total_revenue,20.30)
  assert.equal(snapshot.summary.paid_requests,3)
  assert.equal(snapshot.summary.total_sheets,3)
  assert.equal(snapshot.summary.total_copies,2)
  assert.equal(snapshot.entries,entries)
  assert.equal(snapshot.entries[2].total_sheets,null)
})
