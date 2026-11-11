/** Preserve the revision permission model when reading legacy role names. */
export type CanonicalRole = 'Admin' | 'Librarian' | 'Staff' | 'Student' | 'Faculty'
export const CANONICAL_ROLES: readonly CanonicalRole[] = ['Admin', 'Librarian', 'Staff', 'Student', 'Faculty']
export function toCanonicalRole(value: unknown): CanonicalRole | null {
  if (typeof value !== 'string') return null
  if (CANONICAL_ROLES.includes(value as CanonicalRole)) return value as CanonicalRole
  if (value === 'System Administrator') return 'Admin'
  if (value === 'Library Staff') return 'Staff'
  return null
}
export function isLegacyOrCanonicalAdminRole(value: unknown): boolean {
  return toCanonicalRole(value) === 'Admin'
}
