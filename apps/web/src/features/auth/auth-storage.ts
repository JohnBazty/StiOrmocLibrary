export type AuthRole = 'Admin' | 'Librarian' | 'Faculty' | 'Student'

export type AccessTokenClaims = {
  userId: number
  schoolId: string
  role: AuthRole
  exp: number
}

export type AuthenticatedIdentity = {
  userId: number
  schoolId: string
  fullName?: string
  role: AuthRole
  source: 'jwt' | 'session'
}

const TOKEN_KEY = 'smartlib_access_token'
const ROLES = new Set<AuthRole>(['Admin', 'Librarian', 'Faculty', 'Student'])
let cachedSessionIdentity: AuthenticatedIdentity | null = null

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
}

export function decodeAccessToken(token: string): AccessTokenClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Partial<AccessTokenClaims>
    if (!Number.isSafeInteger(payload.userId) || Number(payload.userId) < 1) return null
    if (typeof payload.schoolId !== 'string' || !payload.schoolId) return null
    if (!ROLES.has(payload.role as AuthRole)) return null
    if (!Number.isFinite(payload.exp) || Number(payload.exp) * 1000 <= Date.now()) return null
    return payload as AccessTokenClaims
  } catch {
    return null
  }
}

export function dashboardForRole(role: AuthRole) {
  return ({
    Admin: '/admin/dashboard',
    Librarian: '/librarian/dashboard',
    Faculty: '/faculty/dashboard',
    Student: '/student/dashboard',
  })[role]
}

export function saveAccessToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearAccessToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export function setSessionIdentity(identity: AuthenticatedIdentity | null) {
  cachedSessionIdentity = identity
}

export function getSessionIdentity() {
  return cachedSessionIdentity
}

export function getCurrentClaims() {
  const token = getAccessToken()
  if (!token) return null
  const claims = decodeAccessToken(token)
  if (!claims) clearAccessToken()
  return claims
}

export function getCurrentIdentity(): AuthenticatedIdentity | null {
  const claims = getCurrentClaims()
  if (claims) return { userId: claims.userId, schoolId: claims.schoolId, role: claims.role, source: 'jwt' }
  return cachedSessionIdentity
}
