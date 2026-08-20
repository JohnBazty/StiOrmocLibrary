export const ROLES = Object.freeze({
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  LIBRARIAN: 'Librarian',
  STUDENT: 'Student',
  FACULTY: 'Faculty',
})

export const ALL_ROLES = Object.freeze(Object.values(ROLES))
export const STAFF_ROLES = Object.freeze([ROLES.SYSTEM_ADMINISTRATOR, ROLES.LIBRARIAN])
export const USER_ROLES = Object.freeze([ROLES.STUDENT, ROLES.FACULTY])

export function dashboardForRole(role) {
  if (STAFF_ROLES.includes(role)) return '/admin/dashboard'
  if (USER_ROLES.includes(role)) return '/user/dashboard'
  return '/login'
}

// Canonical React portal destinations. Keep this mapping distinct from the
// legacy server route aliases above so every role receives its own workspace.
export function webDashboardForRole(role) {
  if (role === ROLES.SYSTEM_ADMINISTRATOR) return '/admin/dashboard'
  if (role === ROLES.LIBRARIAN) return '/librarian/dashboard'
  if (role === ROLES.FACULTY) return '/faculty/dashboard'
  if (role === ROLES.STUDENT) return '/student/dashboard'
  return '/login'
}
