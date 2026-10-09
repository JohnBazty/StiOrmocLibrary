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
  school_id: string
  first_name: string
  last_name: string
  contact_number: string
  program_strand: string
  year_grade_level: string
  password: string
  confirm_password: string
}

export type RegistrationResult = {
  account: { id: number; schoolId: string; role: 'Student'; firstName: string; lastName: string }
}

export type LoginPortal = 'user' | 'staff'

export async function login(schoolId: string, password: string, portal: LoginPortal): Promise<LoginResult> {
  clearAccessToken()
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ portal, school_id: schoolId, password }),
  })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AuthenticationError('The authentication service returned an unexpected response.', 'NON_JSON_RESPONSE')
  }
  const payload = await response.json() as {
    data?: LoginResult
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  }
  if (!response.ok || !payload.data) {
    throw new AuthenticationError(payload.message ?? 'Sign in failed.', payload.code, payload.details?.errors)
  }
  const claims = decodeAccessToken(payload.data.token)
  if (!claims || claims.role !== payload.data.user.role || claims.userId !== payload.data.user.id) {
    throw new AuthenticationError('The server returned an invalid access token.', 'INVALID_TOKEN_RESPONSE')
  }
  return payload.data
}

export async function requestPasswordReset(schoolIdOrEmail: string): Promise<{ message: string }> {
  const response = await fetch('/api/v1/auth/password-reset/request', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ school_id_or_email: schoolIdOrEmail }),
  })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AuthenticationError('The password reset service returned an unexpected response.', 'NON_JSON_RESPONSE')
  }
  const payload = await response.json() as {
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  }
  if (!response.ok) {
    throw new AuthenticationError(payload.message ?? 'Unable to start password reset.', payload.code, payload.details?.errors)
  }
  return { message: payload.message ?? 'If an eligible student account matches, a reset code was sent.' }
}

export async function verifyPasswordResetOtp(schoolIdOrEmail: string, otp: string): Promise<{ resetToken: string }> {
  const response = await fetch('/api/v1/auth/password-reset/verify', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ school_id_or_email: schoolIdOrEmail, otp }),
  })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AuthenticationError('The password reset service returned an unexpected response.', 'NON_JSON_RESPONSE')
  }
  const payload = await response.json() as {
    data?: { resetToken?: string }
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  }
  if (!response.ok || !payload.data?.resetToken) {
    throw new AuthenticationError(payload.message ?? 'Unable to verify the reset code.', payload.code, payload.details?.errors)
  }
  return { resetToken: payload.data.resetToken }
}

export async function confirmPasswordReset(
  resetToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  const response = await fetch('/api/v1/auth/password-reset/confirm', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reset_token: resetToken,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  })
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AuthenticationError('The password reset service returned an unexpected response.', 'NON_JSON_RESPONSE')
  }
  const payload = await response.json() as {
    message?: string
    code?: string
    details?: { errors?: Record<string, string> }
  }
  if (!response.ok) {
    throw new AuthenticationError(payload.message ?? 'Unable to update the password.', payload.code, payload.details?.errors)
  }
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

function normalizeSessionRole(role: string): AuthRole | null {
  if (role === 'System Administrator' || role === 'Admin') return 'Admin'
  if (role === 'Librarian' || role === 'Faculty' || role === 'Student') return role
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
  try {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include', headers: { Accept: 'application/json' } })
    if (csrfResponse.ok) {
      const csrfPayload = await csrfResponse.json() as { csrfToken?: string }
      if (csrfPayload.csrfToken) {
        await fetch('/api/auth/logout', {
          method: 'POST', credentials: 'include', redirect: 'manual',
          headers: {
            Accept: 'application/json', 'x-csrf-token': csrfPayload.csrfToken,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
      }
    }
  } finally {
    clearAccessToken()
    setSessionIdentity(null)
  }
}
