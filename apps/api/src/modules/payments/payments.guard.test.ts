import assert from 'node:assert/strict'
import test from 'node:test'
import { guardCounterPayment } from './payments.guard.ts'

test('counter actions keep working before payment migrations exist', async()=>{
  let calls=0
  await guardCounterPayment({execute:async()=>{calls++;return [[{installed:false}]]}} as never,{kind:'Fine',targetId:1})
  assert.equal(calls,1)
})

test('an online reservation blocks cash changes even when online checkout configuration is off', async()=>{
  const database = {execute:async(sql:string)=>sql.includes('to_regclass')?[[{installed:true}]]:
    [[{payment_id:'fixture',state:'Creating'}]]} as never
  await assert.rejects(guardCounterPayment(database,{kind:'Printing',targetId:1}),
    (error:any)=>error.code==='ONLINE_PAYMENT_ACTIVE' && error.details.paymentId==='fixture')
})
