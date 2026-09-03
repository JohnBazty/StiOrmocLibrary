import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('cash fines migration excludes online payment and preserves auditable receipt ledgers',async()=>{
  const sql=await readFile(new URL('../../../../../database/migrations/20260902_031_cash_fines_and_receipts.sql',import.meta.url),'utf8')
  assert.match(sql,/payment_method` ENUM\('Cash'\)/)
  assert.doesNotMatch(sql,/payment_method` ENUM\([^)]*(?:GCash|Online)/i)
  for(const table of ['fine_policy_versions','fine_infractions','fine_payment_receipts','fine_payment_allocations','fine_adjustments'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS `'+table+'`'))
  assert.match(sql,/balance_before/);assert.match(sql,/receipt_status` ENUM\('Issued','Reversed'\)/)
})
