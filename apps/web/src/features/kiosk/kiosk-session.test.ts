import { afterEach, expect, it, vi } from 'vitest'
import { blockMessageFor, hasKioskSession, kioskLogin, verifyDeskStaff } from './kiosk-session'
import { login } from '../auth/auth-api'
import { clearAccessToken, getAccessToken, getCurrentClaims, saveAccessToken } from '../auth/auth-storage'
import { STRINGS } from './i18n'

vi.mock('../auth/auth-api', () => ({ login: vi.fn() }))
vi.mock('../auth/auth-storage', () => ({
  login: vi.fn(),
  getAccessToken: vi.fn(),
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

it('verifyDeskStaff accepts a desk account and restores the kiosk token', async () => {
  vi.mocked(getAccessToken).mockReturnValue('kiosk.token')
  vi.mocked(login).mockResolvedValue(loginResult('Librarian'))
  await expect(verifyDeskStaff('LIB-1', 'pw')).resolves.toBe(true)
  expect(saveAccessToken).toHaveBeenCalledWith('kiosk.token')
})

it('verifyDeskStaff rejects wrong credentials and non-desk accounts without logging the kiosk out', async () => {
  vi.mocked(getAccessToken).mockReturnValue('kiosk.token')
  vi.mocked(login).mockRejectedValueOnce(new Error('Sign in failed.'))
  await expect(verifyDeskStaff('LIB-1', 'wrong')).resolves.toBe(false)
  vi.mocked(login).mockResolvedValueOnce(loginResult('Student'))
  await expect(verifyDeskStaff('S-1', 'pw')).resolves.toBe(false)
  expect(saveAccessToken).toHaveBeenCalledTimes(2)
  expect(saveAccessToken).toHaveBeenCalledWith('kiosk.token')
})
