import { afterEach, expect, it, vi } from 'vitest'
import { blockMessageFor, hasKioskSession, kioskLogin, kioskSessionAlive, renewKioskSession, verifyDeskStaff } from './kiosk-session'
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

it('kioskSessionAlive asks the server and treats only a 401 or a missing token as signed out', async () => {
  vi.mocked(getAccessToken).mockReturnValue('kiosk.token')
  vi.mocked(getCurrentClaims).mockReturnValue({ role: 'Staff' } as never)
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  try {
    fetchMock.mockResolvedValueOnce({ status: 200 })
    await expect(kioskSessionAlive()).resolves.toBe(true)
    fetchMock.mockResolvedValueOnce({ status: 401 })
    await expect(kioskSessionAlive()).resolves.toBe(false)
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(kioskSessionAlive()).resolves.toBe(true)
    vi.mocked(getAccessToken).mockReturnValue(null as never)
    await expect(kioskSessionAlive()).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer kiosk.token' }) }))
  } finally {
    vi.unstubAllGlobals()
  }
})

it('renewKioskSession stores the fresh token and reports a lost or unreachable session', async () => {
  vi.mocked(getAccessToken).mockReturnValue('kiosk.token')
  vi.mocked(getCurrentClaims).mockReturnValue({ role: 'Staff' } as never)
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  try {
    fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ data: { token: 'fresh.token' } }) })
    await expect(renewKioskSession()).resolves.toBe('ok')
    expect(saveAccessToken).toHaveBeenCalledWith('fresh.token')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/activity', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer kiosk.token' }) }))

    fetchMock.mockResolvedValueOnce({ status: 401, ok: false })
    await expect(renewKioskSession()).resolves.toBe('lost')
    fetchMock.mockResolvedValueOnce({ status: 403, ok: false })
    await expect(renewKioskSession()).resolves.toBe('lost')
    fetchMock.mockResolvedValueOnce({ status: 503, ok: false })
    await expect(renewKioskSession()).resolves.toBe('offline')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(renewKioskSession()).resolves.toBe('offline')
  } finally {
    vi.unstubAllGlobals()
  }
})
