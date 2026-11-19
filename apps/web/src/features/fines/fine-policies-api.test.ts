import { afterEach, expect, it, vi } from 'vitest'
import { finePoliciesApi } from './fine-policies-api'

vi.mock('../auth/auth-storage', () => ({ getCsrfToken: () => 'saved-csrf-token' }))
afterEach(() => vi.unstubAllGlobals())

it('publishes fine rules using the existing cookie and CSRF boundary', async () => {
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{versionId:2}}),{status:201}))
 vi.stubGlobal('fetch',fetcher)
 await finePoliciesApi.publish({hourlyRate:2,dailyRate:10,maximumPenalty:500,effectiveOn:'2026-11-20',changeReason:'Approved library policy update.'})
 const [url,options]=fetcher.mock.calls[0]
 expect(url).toBe('/api/v1/admin/fine-policies')
 expect(options.credentials).toBe('include')
 expect(options.headers.get('X-CSRF-Token')).toBe('saved-csrf-token')
 expect(options.headers.has('Authorization')).toBe(false)
})

it('retains server validation details for the policy form', async () => {
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({success:false,message:'Choose a later date.',details:{errors:{effectiveOn:'The date is too early.'}}}),{status:422})))
 await expect(finePoliciesApi.publish({} as never)).rejects.toMatchObject({name:'Error',message:'Choose a later date.',fieldErrors:{effectiveOn:'The date is too early.'}})
})
