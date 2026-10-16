import {
  clearAccessToken, decodeAccessToken, getAccessToken, setSessionIdentity,
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

export type StudentRegistrationInput = {
  role?: Exclude<AuthRole, 'Admin'>
  school_id: string
  school_email?: string
  first_name: string
  last_name: string
  program_strand: string
  year_grade_level: string
  password: string
  confirm_password: string
}

export type RegistrationResult = {
  requestId: number
  schoolId: string
  email: string
  status: 'PendingEmail'
}

export type LoginPortal = 'user' | 'staff' | 'personnel'
export type LoginChallenge = { otpRequired: true; challengeId: string; emailHint: string; expiresIn: number; resendAfter: number }

export async function login(schoolId: string, password: string, portal: LoginPortal = 'user'): Promise<LoginResult> {
  clearAccessToken()
  setSessionIdentity(null)
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ portal: portal === 'personnel' ? 'staff' : portal, school_id: schoolId, password }),
  })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AuthenticationError('The library service is temporarily unavailable. Please try again.', 'NON_JSON_RESPONSE')
  }
  const payload = await response.json().catch(() => null) as {
    data?: LoginResult | LoginChallenge
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  } | null
  if (!payload) throw new AuthenticationError('The library service is temporarily unavailable. Please try again.', 'NON_JSON_RESPONSE')
  if (!response.ok || !payload.data) {
    throw new AuthenticationError(payload.message ?? 'Sign in failed.', payload.code, payload.details?.errors)
  }
  if ('otpRequired' in payload.data) throw new LoginCodeRequired(payload.data)
  const claims = decodeAccessToken(payload.data.token)
  if (!claims || claims.role !== payload.data.user.role || claims.userId !== payload.data.user.id) {
    throw new AuthenticationError('The server returned an invalid access token.', 'INVALID_TOKEN_RESPONSE')
  }
  return payload.data
}
export class LoginCodeRequired extends Error {
  constructor(public challenge: LoginChallenge) { super('Enter the code sent to your school email.') }
}
export async function verifyLoginCode(challengeId: string, code: string): Promise<LoginResult> {
  const response = await fetch('/api/v1/auth/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge_id: challengeId, code }) })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.data?.token || !decodeAccessToken(payload.data.token)) throw new AuthenticationError(payload?.message ?? 'Code verification is unavailable.')
  return payload.data
}
export async function resendLoginCode(challengeId: string) {
  const response = await fetch('/api/v1/auth/login/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge_id: challengeId }) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new AuthenticationError(payload?.message ?? 'The code could not be sent.')
}

export async function registerStudent(input: StudentRegistrationInput): Promise<RegistrationResult> {
  const response = await fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AuthenticationError('The registration service returned an unexpected response.', 'NON_JSON_RESPONSE')
  }
  const payload = await response.json() as {
    data?: RegistrationResult
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  }
  if (!response.ok || !payload.data) {
    throw new AuthenticationError(payload.message ?? 'Registration failed.', payload.code, payload.details?.errors)
  }
  return payload.data
}

export async function verifyRegistration(schoolId: string, code: string): Promise<{ status: 'Active' | 'PendingApproval'; role: AuthRole }> {
  const response = await fetch('/api/v1/auth/register/verify', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ school_id: schoolId, code }),
  })
  const payload = await response.json() as { data?: { status: 'Active' | 'PendingApproval'; role: AuthRole }; message?: string; code?: string }
  if (!response.ok || !payload.data) throw new AuthenticationError(payload.message ?? 'Code verification failed.', payload.code)
  return payload.data
}

export async function resendRegistrationCode(schoolId: string) {
  const response = await fetch('/api/v1/auth/register/resend', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ school_id: schoolId }),
  })
  const payload = await response.json() as { message?: string; code?: string }
  if (!response.ok) throw new AuthenticationError(payload.message ?? 'Unable to resend the code.', payload.code)
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
export const requestPasswordRecovery = (identifier: string) => recoveryRequest<{ challengeId: string; message: string }>('request', { identifier })
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
  if (token && typeof BroadcastChannel !== 'undefined') {
    const claims = decodeAccessToken(token)
    const channel = new BroadcastChannel('sti-library-session-activity')
    channel.postMessage({ type: 'logout', accountId: claims?.userId })
    channel.close()
  }
  // Clear immediately. A delayed logout response must not erase a later login.
  clearAccessToken()
  setSessionIdentity(null)
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
