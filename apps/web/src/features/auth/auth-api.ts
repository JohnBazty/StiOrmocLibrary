import {
  clearAccessToken, decodeAccessToken, getAccessToken, getCurrentIdentity, saveAccessToken, setSessionIdentity,
  type AuthenticatedIdentity, type AuthRole,
} from './auth-storage'

export class AuthenticationError extends Error {
  constructor(message: string, public code = 'AUTHENTICATION_FAILED', public errors: Record<string, string> = {}) {
    super(message)
  }
}

export type LoginResult = {
  token: string
  tokenType: 'Bearer'
  expiresIn: number
  redirect: string
  user: { id: number; accountId: number; schoolId: string; fullName: string | null; email?: string; role: AuthRole }
}

export type LoginPortal = 'user' | 'staff' | 'personnel'
export type LoginChallenge = { otpRequired: true; challengeId: string; emailHint: string; expiresIn: number; resendAfter: number }

export class DeviceSwitchRequired extends Error {
  constructor(public switchToken: string) { super('This account is signed in on another device.') }
}

const DEVICE_KEY = 'smartlib_device_session'
let loginGeneration = 0
type DeviceHint = { sessionId: string; rememberedUntil?: number }
function readDeviceHint(): DeviceHint | null {
  try {
    const hint = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null')
    return typeof hint?.sessionId === 'string' ? hint : null
  } catch { return null }
}
const deviceHint = () => readDeviceHint()?.sessionId
export function rememberedDeviceExpired() {
  const deadline = readDeviceHint()?.rememberedUntil
  return typeof deadline === 'number' && deadline <= Date.now()
}
function setDeviceHint(hint?: DeviceHint) {
  try {
    if (hint) localStorage.setItem(DEVICE_KEY, JSON.stringify(hint))
    else localStorage.removeItem(DEVICE_KEY)
  } catch { /* Device recovery is unavailable when browser storage is blocked. */ }
}

async function loginResponse(response: Response, message: string): Promise<LoginResult> {
  const payload = await response.json().catch(() => null)
  if (!payload) throw new AuthenticationError('The library service is temporarily unavailable. Please try again.', 'NON_JSON_RESPONSE')
  if (!response.ok || !payload.data) throw new AuthenticationError(payload.message ?? message, payload.code, payload.details?.errors)
  if (payload.data.otpRequired) throw new LoginCodeRequired(payload.data)
  if (payload.data.deviceSwitchRequired && typeof payload.data.switchToken === 'string') throw new DeviceSwitchRequired(payload.data.switchToken)
  const claims = decodeAccessToken(payload.data.token)
  if (!claims || claims.role !== payload.data.user?.role || claims.userId !== payload.data.user?.id) {
    throw new AuthenticationError('The server returned an invalid access token.', 'INVALID_TOKEN_RESPONSE')
  }
  return payload.data
}

export function saveLogin(result: LoginResult) {
  loginGeneration++
  const claims = decodeAccessToken(result.token)
  setDeviceHint(claims?.deviceSession && claims.sessionId ? { sessionId: claims.sessionId, rememberedUntil: claims.rememberedUntil } : undefined)
  setSessionIdentity(null)
  saveAccessToken(result.token)
}

export async function login(schoolId: string, password: string, portal: LoginPortal = 'user', remember = false): Promise<LoginResult> {
  const deviceSessionId = deviceHint()
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ portal: portal === 'personnel' ? 'staff' : portal, school_id: schoolId, password, ...(remember ? { remember_device: true } : {}), device_session_id: deviceSessionId }),
  })
  return loginResponse(response, 'Sign in failed.')
}
export class LoginCodeRequired extends Error {
  constructor(public challenge: LoginChallenge) { super('Enter the code sent to your school email.') }
}
export async function verifyLoginCode(challengeId: string, code: string): Promise<LoginResult> {
  const response = await fetch('/api/v1/auth/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge_id: challengeId, code, device_session_id: deviceHint() }) })
  return loginResponse(response, 'Code verification is unavailable.')
}
export async function resendLoginCode(challengeId: string) {
  const response = await fetch('/api/v1/auth/login/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge_id: challengeId }) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new AuthenticationError(payload?.message ?? 'The code could not be sent.')
}

export async function deviceLoginAvailable(signal: AbortSignal) {
  const response = await fetch('/api/v1/auth/device', { signal })
  return response.ok && (await response.json()).data?.enabled === true
}

function deviceRequest(action: 'resume' | 'switch' | 'logout', body: object = {}, bearer?: string | null) {
  return fetch(`/api/v1/auth/device/${action}`, {
    method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', 'X-Library-Device': '1', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  })
}

export async function confirmDeviceSwitch(token: string) {
  return loginResponse(await deviceRequest('switch', { switch_token: token, device_session_id: deviceHint() }), 'This device could not sign in. Try again.')
}

let resumePending: { sessionId: string; request: Promise<AuthenticatedIdentity | null> } | undefined
let signOutPending = false
export async function resumeDeviceSession(expectedSessionId?: string) {
  const hint = deviceHint()
  if (!hint || signOutPending || (expectedSessionId && expectedSessionId !== hint)) return null
  if (resumePending?.sessionId === hint) return resumePending.request
  const request = (async () => {
    const response = await deviceRequest('resume', { session_id: hint })
    if (response.status === 401 || response.status === 404) {
      if (deviceHint() === hint) setDeviceHint()
      return null
    }
    const result = await loginResponse(response, 'Your device could not reconnect. Try again.')
    if (deviceHint() !== hint || signOutPending) return null
    saveAccessToken(result.token)
    return getCurrentIdentity()
  })()
  resumePending = { sessionId: hint, request }
  try { return await request } finally { if (resumePending?.request === request) resumePending = undefined }
}

export async function rosterRegistrationRequest<T>(step = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/v1/auth/roster-registration' + step, {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.data) {
    throw new AuthenticationError(payload?.message ?? 'Student registration is temporarily unavailable. Try again.')
  }
  return payload.data
}

async function recoveryRequest<T>(action: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/v1/auth/password-recovery/${action}`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const payload = (response.headers.get('content-type') ?? '').includes('application/json')
    ? await response.json().catch(() => null) as { data?: T; message?: string; code?: string } | null : null
  if (!payload) throw new AuthenticationError('Password recovery is temporarily unavailable. Please try again.', 'NON_JSON_RESPONSE')
  if (!response.ok || !payload.data) throw new AuthenticationError(payload.message ?? 'Password recovery failed.', payload.code)
  return payload.data
}
export const requestPasswordRecovery = (identifier: string, portal?: 'staff') =>
  recoveryRequest<{ challengeId: string; message: string }>('request', portal ? { identifier, portal } : { identifier })
export const verifyPasswordRecovery = (challengeId: string, code: string) => recoveryRequest<{ resetToken: string; expiresIn: number }>('verify', { challenge_id: challengeId, code })
export const resetPassword = (challengeId: string, token: string, password: string, confirmation: string) => recoveryRequest<{ message: string }>('reset', { challenge_id: challengeId, reset_token: token, password, confirm_password: confirmation })

function normalizeSessionRole(role: string): AuthRole | null {
  if (role === 'System Administrator' || role === 'Admin') return 'Admin'
  if (role === 'Librarian' || role === 'Faculty' || role === 'Student' || role === 'Staff' || role === 'Library Staff') return role === 'Library Staff' ? 'Staff' : role
  return null
}

export async function resolveSessionIdentity(): Promise<AuthenticatedIdentity | null> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include', headers: { Accept: 'application/json' } })
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) return null
    const payload = await response.json() as { user?: { id?: number; fullName?: string; email?: string; role?: string } }
    const role = normalizeSessionRole(payload.user?.role ?? '')
    const userId = Number(payload.user?.id)
    if (!role || !Number.isSafeInteger(userId) || userId < 1) return null
    const identity: AuthenticatedIdentity = {
      userId, schoolId: payload.user?.email ?? '', fullName: payload.user?.fullName, role, source: 'session',
    }
    setSessionIdentity(identity)
    return identity
  } catch {
    return null
  }
}

export async function logout() {
  const token = getAccessToken()
  const claims = token ? decodeAccessToken(token, true) : null
  const generation = loginGeneration
  const deviceSessionId = claims?.deviceSession ? claims.sessionId : !token ? deviceHint() : undefined
  if (deviceSessionId) {
    signOutPending = true
    try {
      const response = await deviceRequest('logout', { session_id: deviceSessionId }, token)
      const payload = await response.json().catch(() => null)
      if (!payload?.data?.signedOut && payload?.code !== 'DEVICE_DISABLED') throw new Error('Sign out was not confirmed.')
      if (loginGeneration !== generation) return
      if (deviceHint() === deviceSessionId) setDeviceHint()
    } finally { signOutPending = false }
  }
  if (token && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('sti-library-session-activity')
    channel.postMessage({ type: 'logout', accountId: claims?.userId, sessionId: claims?.sessionId })
    channel.close()
  }
  // Device sessions clear locally after server confirmation. Legacy sessions clear before the request.
  clearAccessToken()
  setSessionIdentity(null)
  if (deviceSessionId) return
  try {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (csrfResponse.ok) {
      const csrfPayload = await csrfResponse.json() as { csrfToken?: string }
      if (csrfPayload.csrfToken) {
        await fetch('/api/auth/logout', {
          method: 'POST', credentials: 'include', redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Accept: 'application/json', 'x-csrf-token': csrfPayload.csrfToken,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
      }
    }
  } catch { /* Local logout remains complete while the old server session expires. */ }
}
