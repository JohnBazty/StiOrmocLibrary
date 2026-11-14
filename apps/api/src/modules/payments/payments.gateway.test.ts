import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createPaymentGatewayService } from './payments.gateway.ts'

test('disabled gateway and forged callback fail without database/provider access', async () => {
  const database = {getConnection:()=>{throw new Error('Unexpected database access')}} as unknown as Pool
  const disabled = createPaymentGatewayService(database,{config:()=>({enabled:false})})
  await assert.rejects(disabled.checkout({accountId:1,role:'Student'},{}),error=>(error as any).status===503)
  await assert.rejects(disabled.receive(undefined,{}),error=>(error as any).status===503)
  const enabled = createPaymentGatewayService(database,{config:()=>({enabled:true,webhookToken:'fixture-callback-token'}) as never})
  await assert.rejects(enabled.receive('forged',{}),error=>(error as any).status===401)
})
