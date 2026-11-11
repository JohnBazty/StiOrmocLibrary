import { afterEach, describe, expect, it, vi } from 'vitest'
import { login, logout } from './auth-api'
import { saveAccessToken, getAccessToken } from './auth-storage'

function token(payload: Record<string, unknown>) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('normalized authentication API client', () => {
  it('clears logout immediately and preserves a newer login when the old request finishes late', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    saveAccessToken(token({userId:999001,schoolId:'EXAMPLE',role:'Student',exp:Math.floor(Date.now()/1000)+900}))
    const pending = logout()
    expect(getAccessToken()).toBeNull()
    saveAccessToken('newer-login-token')
    finish(new Response('{}',{status:503}))
    await pending
    expect(getAccessToken()).toBe('newer-login-token')
  })
  it.each([undefined, 'application/json'])('reports a service outage for an empty gateway response (%s)', async contentType => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 502, headers: contentType ? { 'Content-Type': contentType } : {},
    })))
    await expect(login('ADMIN-PORTAL-001', 'test-password', 'personnel')).rejects.toMatchObject({
      message: 'The library service is temporarily unavailable. Please try again.', code: 'NON_JSON_RESPONSE',
    })
  })

  it.each(['staff', 'personnel'] as const)('submits the canonical staff portal for %s clients', async portal => {
    const accessToken = token({ userId: 2, accountId: 2, schoolId: 'ADMIN-001', role: 'Admin', exp: Math.floor(Date.now() / 1000) + 900 })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({
      success: true,
      data: { token: accessToken, tokenType: 'Bearer', expiresIn: 900, redirect: '/admin/dashboard', user: { id: 2, accountId: 2, schoolId: 'ADMIN-001', fullName: null, role: 'Admin' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await login('ADMIN-001', 'admin123', portal)
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(options?.body))).toEqual({ portal: 'staff', school_id: 'ADMIN-001', password: 'admin123' })
  })


})

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })
