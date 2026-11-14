import assert from 'node:assert/strict'
import test from 'node:test'
import { createXenditClient, checkoutUrl, authenticateCallback, parseSessionEvent, verifyCapturedPayment } from './xendit.client.ts'

test('sandbox checkout links reject live hosts, credentials and deceptive subdomains', () => {
  assert.equal(checkoutUrl('https://dev.xen.to/fixture'),'https://dev.xen.to/fixture')
  for (const value of ['https://xen.to/live','https://dev.xen.to.evil.test/a','http://dev.xen.to/a',
    'https://user:pass@dev.xen.to/a','https://dev.xen.to:444/a','https://dev.xen.to/a#token']) assert.throws(()=>checkoutUrl(value))
})

test('callback authentication is strict and stored events omit personal data', () => {
  const token = 'fixture-callback-token-0123456789'
  assert.equal(authenticateCallback(token,token),true)
  assert.equal(authenticateCallback(token+'x',token),false)
  assert.equal(authenticateCallback(undefined,token),false)
  const body = {event:'payment_session.completed',business_id:'fixture-business',data:{
    payment_session_id:'ps-0123456789abcdef01234567',reference_id:'sti-pay-00000000-0000-4000-8000-000000000001',
    status:'COMPLETED',amount:41.40,currency:'PHP',country:'PH',session_type:'PAY',mode:'PAYMENT_LINK',
    payment_id:'py-fixture',email:'private@example.test',customer:{name:'Private'},
  }}
  const event = parseSessionEvent(body)
  assert.equal(JSON.stringify(event).includes('private'),false)
  assert.equal(event.paymentId,'00000000-0000-4000-8000-000000000001')
  assert.throws(()=>parseSessionEvent({...body,is_live:true}))
})

test('a completed session still requires a matching fully captured payment', () => {
  const expected = {payment_id:'py-fixture',business_id:'fixture-business',payment_request_id:'pr-fixture',
    type:'PAY',country:'PH',currency:'PHP',request_amount:41.4,capture_method:'AUTOMATIC',channel_code:'GCASH',
    status:'SUCCEEDED',captures:[{capture_id:'cap-fixture',capture_amount:41.4}]}
  const session = {business_id:'fixture-business',payment_id:'py-fixture',payment_request_id:'pr-fixture'}
  const attempt = {total_centavos:'4140',channel_code:'GCASH'}
  assert.doesNotThrow(()=>verifyCapturedPayment(expected,session,attempt))
  for (const patch of [{status:'AUTHORIZED'},{business_id:'wrong'},{channel_code:'CARDS'},
    {captures:[{capture_id:'cap-fixture',capture_amount:40}]},{currency:'USD'},{payment_request_id:'pr-other'}]) {
    assert.throws(()=>verifyCapturedPayment({...expected,...patch},session,attempt))
  }
})

test('provider calls use fixed origin, no redirect following and sanitized failures', async () => {
  const config = {enabled:true,mode:'test',apiOrigin:'https://api.xendit.co',secretKey:'xnd_development_fixture',webhookToken:'fixture'} as const
  let calls = 0
  const client = createXenditClient(()=>config as never,async (url,options)=>{
    calls++
    assert.equal(String(url),'https://api.xendit.co/sessions/ps-0123456789abcdef01234567')
    assert.equal(options?.redirect,'error')
    return new Response(JSON.stringify({error_code:'PRIVATE_ERROR',message:'private-provider-detail'}),{status:401})
  })
  await assert.rejects(client.getSession('ps-0123456789abcdef01234567'),(error: Error)=>
    error.message==='Payment provider is temporarily unavailable.')
  await assert.rejects(async()=>client.getSession('../balance'))
  assert.equal(calls,1)
})

test('payment evidence lookups pin the documented API version and bound response size', async () => {
  const config = {enabled:true,secretKey:'xnd_development_fixture'} as const
  const client = createXenditClient(()=>config as never,async (_url,options)=>{
    assert.equal((options?.headers as Record<string,string>)['api-version'],'2024-11-11')
    return new Response(JSON.stringify({status:'SUCCEEDED'}))
  })
  assert.equal((await client.getPayment('py-fixture')).status,'SUCCEEDED')
  const oversized = createXenditClient(()=>config as never,async ()=>new Response('a'.repeat(65537)))
  await assert.rejects(oversized.getPayment('py-fixture'),error=>(error as any).code==='PAYMENT_PROVIDER_UNAVAILABLE')
})

test('refund and payout clients keep their distinct API versions and exact amount contracts',async()=>{
  const calls:Array<{url:string;options:RequestInit|undefined}>=[]
  const client=createXenditClient(()=>({enabled:true,secretKey:'xnd_development_fixture'} as never),async(url,options)=>{
    calls.push({url:String(url),options});return new Response(JSON.stringify(String(url).includes('payment_id=')?[]:{status:'PENDING'}))
  })
  await client.createRefund({payment_id:'py-fixture',amount:51.01,reference_id:'qa'})
  await client.listRefunds('py-fixture')
  await client.createPayout({payout_details:{source_amount:5101}},'unique-key')
  assert.equal((calls[0].options?.headers as Record<string,string>)['api-version'],'2024-11-11')
  assert.equal(JSON.parse(String(calls[0].options?.body)).amount,51.01)
  assert.equal((calls[2].options?.headers as Record<string,string>)['api-version'],'2025-09-01')
  assert.equal((calls[2].options?.headers as Record<string,string>)['idempotency-key'],'unique-key')
  assert.equal(JSON.parse(String(calls[2].options?.body)).payout_details.source_amount,5101)
  assert.ok(calls.every(row=>row.url.startsWith('https://api.xendit.co/')))
})
