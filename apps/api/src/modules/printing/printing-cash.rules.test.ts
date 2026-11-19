import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePrintCash, printBalance } from './printing-cash.rules.ts'

test('partial cash keeps the exact unpaid remainder and rejects zero, overpayment and fractional cents',()=>{
  const key='b3ac438b-451c-4f6c-bd44-5890c98c0a5e'
  assert.deepEqual(parsePrintCash({amount_paid:'40.01',request_key:key},10000n),{amount:4001n,requestKey:key,notes:null})
  assert.equal(printBalance('100.00','40.01'),5999n)
  for(const amount_paid of ['0','100.01','1.001','-1','NaN'])assert.throws(()=>parsePrintCash({amount_paid,request_key:key},10000n))
  assert.throws(()=>parsePrintCash({amount_paid:40},10000n))
  assert.throws(()=>printBalance('10','11'))
})
