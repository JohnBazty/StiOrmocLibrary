import assert from 'node:assert/strict'
import test from 'node:test'
import { withLocalPaymentLock } from './local-payment-lock.ts'

test('local writers use a transaction advisory lock suitable for transaction pooling and always release',async()=>{
  const calls:string[]=[],q={beginTransaction:async()=>{calls.push('begin')},commit:async()=>{calls.push('commit')},rollback:async()=>{calls.push('rollback')},release(){calls.push('release')},execute:async(sql:string)=>{calls.push(sql);return [[{held:true}]]}}
  const database={getConnection:async()=>q} as never
  assert.equal(await withLocalPaymentLock(database,async()=>42),42)
  assert.ok(calls[1].includes('pg_try_advisory_xact_lock'))
  assert.deepEqual(calls.slice(-2),['commit','release'])
  calls.length=0
  await assert.rejects(withLocalPaymentLock(database,async()=>{throw new Error('Provider failure')}))
  assert.deepEqual(calls.slice(-2),['rollback','release'])
})
test('a second writer fails closed before making a provider call',async()=>{
  let providerCalls=0,released=false
  const q={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){released=true},execute:async()=>[[{held:false}]]}
  await assert.rejects(withLocalPaymentLock({getConnection:async()=>q} as never,async()=>{providerCalls++;return 1}),{status:409})
  assert.equal(providerCalls,0);assert.equal(released,true)
})
