/**
 * Canonical application roles after Admin/Librarian consolidation.
 * Legacy staff values are accepted only at trusted authentication boundaries
 * during the compatibility window; they must not be issued on new tokens.
 */
export type CanonicalRole = 'Admin' | 'Student' | 'Faculty'

const CANONICAL_ROLES = new Set<CanonicalRole>(['Admin', 'Student', 'Faculty'])

/** Legacy staff aliases still present in DB/session/token during rollout. */
const LEGACY_ADMIN_ALIASES = new Set(['Librarian', 'System Administrator'])

export function isCanonicalRole(value: unknown): value is CanonicalRole {
  return typeof value === 'string' && CANONICAL_ROLES.has(value as CanonicalRole)
}

/**
 * Map trusted identity values to the effective authorization role.
 * Returns null for unrecognized values (never grant Admin from unknown input).
 */
export function toCanonicalRole(value: unknown): CanonicalRole | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (CANONICAL_ROLES.has(trimmed as CanonicalRole)) return trimmed as CanonicalRole
  if (LEGACY_ADMIN_ALIASES.has(trimmed)) return 'Admin'
  return null
}

/** True when the stored DB role may satisfy an Admin login during compatibility. */
export function isLegacyOrCanonicalAdminRole(value: unknown): boolean {
  return toCanonicalRole(value) === 'Admin'
}
