import { afterEach,expect,it,vi } from 'vitest'
import { refundRequestsApi } from './refund-requests-api'
afterEach(()=>vi.unstubAllGlobals())
it('uses the actual owner/admin router mounts for options, submission and withdrawal',async()=>{
  const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({success:true,data:{}}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher)
  await refundRequestsApi.options('owned-payment',false,'50.00')
  await refundRequestsApi.create('owned-payment',{amount:'50.00',reasonCode:'OTHER',reason:'Refund request explanation',requestKey:'request',expectedTotalCentavos:5150})
  await refundRequestsApi.withdraw('request',2)
  await refundRequestsApi.options('owned-payment',true)
  expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/api/v1/user/payments/owned-payment/refund-options?amount=50.00','/api/v1/user/payments/owned-payment/refund-requests','/api/v1/user/payments/refund-requests/request/withdraw','/api/v1/admin/payments/owned-payment/refund-options'])
})
