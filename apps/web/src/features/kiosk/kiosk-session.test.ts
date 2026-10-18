import { afterEach, expect, it, vi } from 'vitest'
import { blockMessageFor, hasKioskSession, kioskLogin } from './kiosk-session'
import { login } from '../auth/auth-api'
import { clearAccessToken, getCurrentClaims, saveAccessToken } from '../auth/auth-storage'
import { STRINGS } from './i18n'

vi.mock('../auth/auth-api', () => ({ login: vi.fn() }))
vi.mock('../auth/auth-storage', () => ({
  login: vi.fn(),
  getCurrentClaims: vi.fn(),
  saveAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  setSessionIdentity: vi.fn(),
}))

afterEach(() => vi.clearAllMocks())

const loginResult = (role: string) => ({ token: 't.k.n', user: { role } }) as never

it('hasKioskSession is true only for a desk role', () => {
  vi.mocked(getCurrentClaims).mockReturnValue({ role: 'Staff' } as never)
  expect(hasKioskSession()).toBe(true)
  vi.mocked(getCurrentClaims).mockReturnValue({ role: 'Student' } as never)
  expect(hasKioskSession()).toBe(false)
  vi.mocked(getCurrentClaims).mockReturnValue(null)
  expect(hasKioskSession()).toBe(false)
})

it('kioskLogin saves the token for a desk account', async () => {
  vi.mocked(login).mockResolvedValue(loginResult('Librarian'))
  await kioskLogin('STAFF-1', 'pw')
  expect(login).toHaveBeenCalledWith('STAFF-1', 'pw', 'staff')
  expect(saveAccessToken).toHaveBeenCalledWith('t.k.n')
})

it('kioskLogin rejects a non-desk account and clears the token', async () => {
  vi.mocked(login).mockResolvedValue(loginResult('Student'))
  await expect(kioskLogin('S-1', 'pw')).rejects.toThrow(/desk account/)
  expect(clearAccessToken).toHaveBeenCalled()
  expect(saveAccessToken).not.toHaveBeenCalled()
})

it('blockMessageFor maps network/non-JSON faults to the service-unavailable block', () => {
  expect(blockMessageFor(new TypeError('fetch failed'))).toBe(STRINGS.en.serviceUnavailable)
  expect(blockMessageFor({ code: 'NON_JSON_RESPONSE' })).toBe(STRINGS.en.serviceUnavailable)
  expect(blockMessageFor(new Error('Sign in failed.'))).toBe('Sign in failed.')
})
