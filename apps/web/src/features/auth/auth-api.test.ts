import { afterEach, describe, expect, it, vi } from 'vitest'
import { login, registerStudent } from './auth-api'

function token(payload: Record<string, unknown>) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('normalized authentication API client', () => {
  it('submits login_as, school_id, and password to the versioned endpoint', async () => {
    const accessToken = token({ userId: 2, accountId: 2, schoolId: 'ADMIN-001', role: 'Admin', exp: Math.floor(Date.now() / 1000) + 900 })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({
      success: true,
      data: { token: accessToken, tokenType: 'Bearer', expiresIn: 900, redirect: '/admin/dashboard', user: { id: 2, accountId: 2, schoolId: 'ADMIN-001', fullName: null, role: 'Admin' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await login('ADMIN-001', 'Admin', 'admin123')
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(options?.body))).toEqual({ login_as: 'Admin', school_id: 'ADMIN-001', password: 'admin123' })
  })

  it('submits every normalized student profile field to registration', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({
      success: true,
      data: { account: { id: 40, schoolId: 'STI-2026-0040', role: 'Student', firstName: 'Ana', lastName: 'Reyes' } },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      school_id: 'STI-2026-0040', first_name: 'Ana', last_name: 'Reyes', contact_number: '09171234567',
      program_strand: 'BS Information Technology', year_grade_level: '2nd Year', password: 'LibraryPass9', confirm_password: 'LibraryPass9',
    }

    await registerStudent(input)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/register')
    expect(JSON.parse(String(options?.body))).toEqual(input)
  })
})

afterEach(() => vi.unstubAllGlobals())
