import { afterEach, describe, expect, it, vi } from 'vitest'
import { login, logout } from './auth-api'
import { saveAuthSession, getCsrfToken } from './auth-storage'

const csrf = (letter: string) => letter.repeat(64)
const signedIn = (session: Record<string, unknown>, letter = 'a') => ({ session: session as never, csrfToken: csrf(letter) })

describe('normalized authentication API client', () => {
  it('clears logout immediately and preserves a newer login when the old request finishes late', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const student = { userId: 999001, schoolId: 'EXAMPLE', role: 'Student', exp: Math.floor(Date.now() / 1000) + 900 }
    saveAuthSession(signedIn(student))
    const pending = logout()
    expect(getCsrfToken()).toBeNull()
    saveAuthSession(signedIn(student, 'b'))
    finish(new Response('{}',{status:503}))
    await pending
    expect(getCsrfToken()).toBe(csrf('b'))
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
    const session = { userId: 2, accountId: 2, schoolId: 'ADMIN-001', role: 'Admin', exp: Math.floor(Date.now() / 1000) + 900 }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({
      success: true,
      data: { session, csrfToken: csrf('c'), expiresIn: 900, redirect: '/admin/dashboard', user: { id: 2, accountId: 2, schoolId: 'ADMIN-001', fullName: null, role: 'Admin' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await login('ADMIN-001', 'admin123', portal)
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(options?.body))).toEqual({ portal: 'staff', school_id: 'ADMIN-001', password: 'admin123' })
  })

  it('signs out a cookie sign-in with its own CSRF token and no Authorization header', async () => {
    saveAuthSession(signedIn({ userId: 7, schoolId: 'FAC-7', role: 'Faculty', exp: Math.floor(Date.now() / 1000) + 900 }, 'd'))
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await logout()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/logout')
    expect(options?.headers).toEqual({ Accept: 'application/json', 'x-csrf-token': csrf('d') })
  })

  it('reports a failed cookie sign-out so the user can retry instead of being signed back in', async () => {
    saveAuthSession(signedIn({ userId: 7, schoolId: 'FAC-7', role: 'Faculty', exp: Math.floor(Date.now() / 1000) + 900 }, 'e'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(logout()).rejects.toThrow('Sign out was not confirmed.')
  })

  it('restores the CSRF token in a new tab so sign-out can clear the cookie', async () => {
    const session = { userId: 7, schoolId: 'FAC-7', role: 'Faculty', exp: Math.floor(Date.now() / 1000) + 900 }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => String(input) === '/api/v1/auth/me'
      ? new Response(JSON.stringify({ success: true, data: { session, csrfToken: csrf('f') } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await logout()
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/auth/logout')
    expect(options?.headers).toEqual({ Accept: 'application/json', 'x-csrf-token': csrf('f') })
    expect(getCsrfToken()).toBeNull()
  })

  it('rejects a sign-in reply without a valid CSRF token and stores nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: {
      session: { userId: 2, schoolId: 'ADMIN-001', role: 'Admin', exp: Math.floor(Date.now() / 1000) + 900 }, csrfToken: 'short', user: { id: 2, role: 'Admin' },
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(login('ADMIN-001', 'admin123', 'staff')).rejects.toMatchObject({ code: 'INVALID_TOKEN_RESPONSE' })
    expect(getCsrfToken()).toBeNull()
  })
})

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })
