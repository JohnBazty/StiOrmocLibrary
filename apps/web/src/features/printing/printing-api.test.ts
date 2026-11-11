import { afterEach, expect, it, vi } from 'vitest'
import { printingApi } from './printing-api'

vi.mock('../auth/auth-storage',()=>({getAccessToken:()=> 'local-test-token'}))
afterEach(()=>vi.unstubAllGlobals())

it.each([
  new Response('',{status:502}),
  new Response('<html>Unavailable</html>',{status:502}),
  new Response(null,{status:200}),
  Response.json({success:true}),
])('rejects incomplete printing responses so the form can offer a retry',async(response)=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response))
  await expect(printingApi.quote(new FormData())).rejects.toThrow(/printing service.*(try again|response)/i)
})

it('keeps the server explanation for unreadable files',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({message:'The PDF could not be read. Upload an unencrypted, valid PDF.'},{status:422})))
  await expect(printingApi.quote(new FormData())).rejects.toThrow('The PDF could not be read.')
})
