export const ROLES = Object.freeze({
  ADMIN: 'Admin',
  STUDENT: 'Student',
  FACULTY: 'Faculty',
  /** @deprecated Compatibility alias — normalize to Admin; do not issue. */
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  /** @deprecated Compatibility alias — normalize to Admin; do not issue. */
  LIBRARIAN: 'Librarian',
})

export const ALL_ROLES = Object.freeze([ROLES.ADMIN, ROLES.STUDENT, ROLES.FACULTY])
export const STAFF_ROLES = Object.freeze([ROLES.ADMIN])
export const USER_ROLES = Object.freeze([ROLES.STUDENT, ROLES.FACULTY])

/** Compatibility: map legacy staff names to Admin before authorization checks. */
export function toEffectiveRole(role) {
  if (role === ROLES.LIBRARIAN || role === ROLES.SYSTEM_ADMINISTRATOR || role === ROLES.ADMIN) return ROLES.ADMIN
  return role
}

export function dashboardForRole(role) {
  const effective = toEffectiveRole(role)
  if (STAFF_ROLES.includes(effective)) return '/admin/dashboard'
  if (USER_ROLES.includes(effective)) return '/user/dashboard'
  return '/login'
}

export function webDashboardForRole(role) {
  const effective = toEffectiveRole(role)
  if (effective === ROLES.ADMIN) return '/admin/dashboard'
  if (effective === ROLES.FACULTY) return '/faculty/dashboard'
  if (effective === ROLES.STUDENT) return '/student/dashboard'
  return '/login'
}
