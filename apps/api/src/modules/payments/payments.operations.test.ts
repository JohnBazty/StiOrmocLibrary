import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSettlement, createPaymentOperations } from './payments.operations.ts'

test('settlement records require explicit evidence, exact costs and a timezone',()=>{
  const input={reference:'TEST-BATCH-001',processingCost:'1.40',settledAt:'2026-11-11T16:00:00+08:00'}
  assert.equal(parseSettlement(input).cost,140n)
  assert.equal(parseSettlement({...input,processingCost:'0'}).cost,0n)
  for(const change of [{reference:''},{processingCost:'-1'},{processingCost:'1.001'},{settledAt:'2026-11-11T16:00'},{settledAt:'2026-02-30T16:00:00+08:00'},{paid:true}])
    assert.throws(()=>parseSettlement({...input,...change}))
})

test('disabled operations skip recovery and avoid payment table access',async()=>{
  const operations=createPaymentOperations({getConnection:()=>{throw new Error('Unexpected database access')}} as never,{config:()=>({enabled:false})})
  assert.deepEqual(await operations.recover(),{skipped:true,reason:'payments disabled'})
})
