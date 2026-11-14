import { afterEach, expect, it, vi } from 'vitest'
import { paymentsApi } from './payments-api'

vi.mock('../auth/auth-storage', () => ({ getCsrfToken: () => 'test-csrf' }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('payment writes send cookie credentials and CSRF, without a JavaScript-readable bearer token', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { paymentId: 'test-payment' } })))
  vi.stubGlobal('fetch', fetcher)
  await paymentsApi.quote({ kind: 'Fine', targetId: 1, channelCode: 'GCASH', amount: '40' })
  const [url, options] = fetcher.mock.calls[0]
  expect(url).toBe('/api/v1/user/payments/quote')
  expect(options.credentials).toBe('include')
  expect(options.method).toBe('POST')
  expect(options.headers.get('X-CSRF-Token')).toBe('test-csrf')
  expect(options.headers.has('Authorization')).toBe(false)
})

it('payment history remains owner-scoped through the cookie and propagates access errors', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, code: 'ACCOUNT_ACCESS_REVOKED', message: 'Sign in again.' }), { status: 401 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(paymentsApi.mine('pending')).rejects.toMatchObject({ code: 'ACCOUNT_ACCESS_REVOKED' })
  expect(fetcher.mock.calls[0][1].credentials).toBe('include')
  expect(fetcher.mock.calls[0][1].headers.has('Authorization')).toBe(false)
})
