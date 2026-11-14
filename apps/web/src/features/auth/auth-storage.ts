export type AuthRole = 'Admin' | 'Librarian' | 'Faculty' | 'Student' | 'Staff'

export type AccessTokenClaims = {
  userId: number
  schoolId: string
  role: AuthRole
  exp: number
  sessionId?: string
  deviceSession?: boolean
  rememberedUntil?: number
  idleUntil?: number
}

/** What the API returns at sign-in: the JWT itself stays in an httpOnly cookie. */
export type AuthSession = { session: AccessTokenClaims; csrfToken: string; mustChangePassword?: boolean }

export type AuthenticatedIdentity = {
  userId: number
  schoolId: string
  fullName?: string
  role: AuthRole
  source: 'jwt' | 'session'
}

const SESSION_KEY = 'smartlib_auth_session'
const ROLES = new Set<AuthRole>(['Admin', 'Librarian', 'Faculty', 'Student', 'Staff'])
let cachedSessionIdentity: AuthenticatedIdentity | null = null

export function parseClaims(value: unknown, allowExpired = false): AccessTokenClaims | null {
  const payload = (value && typeof value === 'object' ? value : {}) as Partial<AccessTokenClaims>
  if (!Number.isSafeInteger(payload.userId) || Number(payload.userId) < 1) return null
  if (typeof payload.schoolId !== 'string' || !payload.schoolId) return null
  if (!ROLES.has(payload.role as AuthRole)) return null
  if (!Number.isFinite(payload.exp) || (!allowExpired && Number(payload.exp) * 1000 <= Date.now())) return null
  return payload as AccessTokenClaims
}

export function parseAuthSession(value: unknown): AuthSession | null {
  const data = (value && typeof value === 'object' ? value : {}) as Partial<AuthSession>
  const session = parseClaims(data.session, true)
  if (!session || typeof data.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(data.csrfToken)) return null
  return { session, csrfToken: data.csrfToken, mustChangePassword: data.mustChangePassword === true }
}

export function dashboardForRole(role: AuthRole) {
  return ({
    Admin: '/admin/dashboard',
    Librarian: '/librarian/dashboard',
    Faculty: '/faculty/dashboard',
    Student: '/student/dashboard',
    Staff: '/staff/dashboard',
  })[role]
}

function readAuthSession() {
  try { return parseAuthSession(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')) } catch { return null }
}

export function saveAuthSession(value: AuthSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
}

/** Sent as X-CSRF-Token; the browser sends the cookie by itself. */
export function getCsrfToken() {
  return readAuthSession()?.csrfToken ?? null
}

export function passwordChangeRequired() {
  return readAuthSession()?.mustChangePassword === true
}

export function clearAuthSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function setSessionIdentity(identity: AuthenticatedIdentity | null) {
  cachedSessionIdentity = identity
}

export function getSessionIdentity() {
  return cachedSessionIdentity
}

/** The stored claims; expired ones only when allowExpired (device sessions resume after expiry). */
export function getStoredClaims(allowExpired = false) {
  const stored = readAuthSession()
  return stored ? parseClaims(stored.session, allowExpired) : null
}

export function getCurrentClaims() {
  const stored = readAuthSession()
  if (!stored) return null
  const claims = parseClaims(stored.session)
  if (!claims && !stored.session.deviceSession) clearAuthSession()
  return claims
}

export function getCurrentIdentity(): AuthenticatedIdentity | null {
  const claims = getCurrentClaims()
  if (claims) return { userId: claims.userId, schoolId: claims.schoolId, role: claims.role, source: 'jwt' }
  return cachedSessionIdentity
}
