import { login } from '../auth/auth-api'
import { clearAccessToken, getAccessToken, getCurrentClaims, saveAccessToken, setSessionIdentity } from '../auth/auth-storage'
import { STRINGS, type Lang } from './i18n'

// Roles allowed to operate the desk/attendance endpoints the kiosk calls.
const DESK_ROLES = ['Staff', 'Librarian'] as const

/** True when a valid, non-expired desk session token is stored. */
export function hasKioskSession(): boolean {
  const claims = getCurrentClaims()
  return !!claims && (DESK_ROLES as readonly string[]).includes(claims.role)
}

/** Sign the kiosk in as a desk account. Rejects a non-desk account. */
export async function kioskLogin(schoolId: string, password: string): Promise<void> {
  const result = await login(schoolId, password, 'staff')
  if (!(DESK_ROLES as readonly string[]).includes(result.user.role)) {
    clearAccessToken()
    setSessionIdentity(null)
    throw new Error('This kiosk requires a library desk account.')
  }
  saveAccessToken(result.token)
}

export function kioskLogout(): void {
  clearAccessToken()
  setSessionIdentity(null)
}

/** True when the credentials belong to a desk account. Never disturbs the kiosk's own session. */
export async function verifyDeskStaff(schoolId: string, password: string): Promise<boolean> {
  const kioskToken = getAccessToken()
  try {
    const result = await login(schoolId, password, 'staff')
    return (DESK_ROLES as readonly string[]).includes(result.user.role)
  } catch {
    return false
  } finally {
    // login() clears the stored token before checking; put the kiosk's session back either way.
    if (kioskToken) saveAccessToken(kioskToken)
  }
}

/**
 * Message to show the student when a kiosk request fails. A service/network
 * fault becomes the "see a librarian" block; a specific message is passed
 * through so sign-in can show "wrong password" etc.
 */
export function blockMessageFor(error: unknown, lang: Lang = 'en'): string {
  const unavailable = STRINGS[lang].serviceUnavailable
  if (error instanceof TypeError) return unavailable // network failure
  const code = (error as { code?: string })?.code
  if (code === 'NON_JSON_RESPONSE') return unavailable
  const message = error instanceof Error ? error.message : ''
  return message || unavailable
}
