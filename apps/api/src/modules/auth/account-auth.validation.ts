import type { JwtRole } from './jwt-auth.service.ts'
import { toCanonicalRole } from './role-normalization.ts'

export type FieldErrors = Record<string, string>
export type LoginPortal = 'user' | 'staff'

const LOGIN_ROLES = new Set<JwtRole>(['Admin', 'Student', 'Faculty'])
const SCHOOL_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,49}$/
const CONTACT_PATTERN = /^\+?[0-9 ()-]{7,30}$/

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function normalizeSchoolId(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

/** Normalize client login_as / registration role. Legacy staff names are not accepted from clients. */
export function normalizeRole(value: unknown): JwtRole | '' {
  if (typeof value !== 'string') return ''
  const candidate = value.trim().toLowerCase()
  const match = [...LOGIN_ROLES].find((role) => role.toLowerCase() === candidate)
  return match ?? ''
}

export function normalizePortal(value: unknown): LoginPortal | '' {
  if (typeof value !== 'string') return ''
  const candidate = value.trim().toLowerCase()
  return candidate === 'user' || candidate === 'staff' ? candidate : ''
}

export function validateAccountRegistration(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const schoolId = normalizeSchoolId(input.school_id)
  const firstName = cleanText(input.first_name)
  const lastName = cleanText(input.last_name)
  const contactNumber = cleanText(input.contact_number)
  const programStrand = cleanText(input.program_strand)
  const yearGradeLevel = cleanText(input.year_grade_level)
  const password = typeof input.password === 'string' ? input.password : ''
  const confirmPassword = typeof input.confirm_password === 'string' ? input.confirm_password : ''
  const requestedRole = input.role === undefined ? 'Student' : normalizeRole(input.role)
  const errors: FieldErrors = {}

  if (!schoolId) errors.school_id = 'School ID is required.'
  else if (!SCHOOL_ID_PATTERN.test(schoolId)) errors.school_id = 'School ID must contain 3 to 50 letters, numbers, dots, underscores, or hyphens.'

  if (!firstName) errors.first_name = 'First name is required.'
  else if (firstName.length > 100) errors.first_name = 'First name must not exceed 100 characters.'
  if (!lastName) errors.last_name = 'Last name is required.'
  else if (lastName.length > 100) errors.last_name = 'Last name must not exceed 100 characters.'

  if (!contactNumber) errors.contact_number = 'Contact number is required.'
  else if (!CONTACT_PATTERN.test(contactNumber)) errors.contact_number = 'Enter a valid contact number.'
  if (!programStrand) errors.program_strand = 'Program or strand is required.'
  else if (programStrand.length > 150) errors.program_strand = 'Program or strand must not exceed 150 characters.'
  if (!yearGradeLevel) errors.year_grade_level = 'Year or grade level is required.'
  else if (yearGradeLevel.length > 100) errors.year_grade_level = 'Year or grade level must not exceed 100 characters.'

  if (!requestedRole) errors.role = 'The selected role is invalid.'
  else if (requestedRole !== 'Student') errors.role = 'Public registration is available only for Student accounts.'

  if (!password) errors.password = 'Password is required.'
  else if (password.length < 8) errors.password = 'Password must contain at least 8 characters.'
  else if (password.length > 72) errors.password = 'Password must not exceed 72 characters.'
  if (!confirmPassword) errors.confirm_password = 'Password confirmation is required.'
  else if (password !== confirmPassword) errors.confirm_password = 'Password confirmation does not match.'

  return {
    schoolId, firstName, lastName, contactNumber, programStrand, yearGradeLevel,
    password, confirmPassword, role: requestedRole,
    errors, isValid: Object.keys(errors).length === 0,
  }
}

export function validateRoleLogin(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const schoolId = normalizeSchoolId(input.school_id)
  const portal = normalizePortal(input.portal)
  const rawLoginAs = typeof input.login_as === 'string' ? input.login_as.trim() : ''
  // Reject client-supplied legacy staff role names; only Admin is a valid staff login_as.
  const legacyStaffRequested = toCanonicalRole(rawLoginAs) === 'Admin' && !LOGIN_ROLES.has(rawLoginAs as JwtRole)
  const role = legacyStaffRequested ? '' : normalizeRole(input.login_as)
  const password = typeof input.password === 'string' ? input.password : ''
  const errors: FieldErrors = {}

  // portal=user|staff: role is detected from the account after password check.
  // login_as remains supported for older clients and the staff page.
  if (input.portal !== undefined && !portal) errors.portal = 'Select a valid login portal.'
  else if (!portal && !role) errors.login_as = 'Select a valid login role.'
  if (portal === 'staff' && role && role !== 'Admin') errors.login_as = 'Select a valid login role.'
  if (!schoolId) errors.school_id = 'School ID is required.'
  else if (!SCHOOL_ID_PATTERN.test(schoolId)) errors.school_id = 'Enter a valid school ID.'
  if (!password) errors.password = 'Password is required.'
  else if (password.length > 72) errors.password = 'Password must not exceed 72 characters.'

  return { schoolId, portal, role, password, errors, isValid: Object.keys(errors).length === 0 }
}
