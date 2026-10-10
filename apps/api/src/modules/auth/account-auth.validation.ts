import type { JwtRole } from './jwt-auth.service.ts'

export type FieldErrors = Record<string, string>
export type LoginPortal = 'user' | 'staff'

const ROLES = new Set<JwtRole>(['Admin', 'Librarian', 'Student', 'Faculty', 'Staff'])
const SCHOOL_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,49}$/
const SCHOOL_EMAIL_PATTERN = /^[^\s@]+@ormoc\.sti\.edu\.ph$/i
const COLLEGE_PROGRAMS = new Set([
  'Bachelor of Science in Information Technology',
  'Bachelor of Science in Tourism Management',
  'Bachelor of Science in Hospitality Management',
])
const SENIOR_HIGH_PROGRAMS = new Set([
  'STEM', 'ABM', 'HUMSS', 'General Academic',
  'IT in Mobile App and Web Development', 'Computer and Communications Technology',
  'Tourism Operations', 'Culinary Arts',
])

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function normalizeSchoolId(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function normalizeRole(value: unknown): JwtRole | '' {
  if (typeof value !== 'string') return ''
  const candidate = value.trim().toLowerCase()
  return ([...ROLES].find((role) => role.toLowerCase() === candidate) ?? '') as JwtRole | ''
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
  const schoolEmail = typeof input.school_email === 'string' ? input.school_email.trim().toLowerCase() : ''
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

  if (!schoolEmail) errors.school_email = 'School email is required.'
  else if (schoolEmail.length > 191 || !SCHOOL_EMAIL_PATTERN.test(schoolEmail)) errors.school_email = 'Use your @ormoc.sti.edu.ph school email.'
  if (requestedRole === 'Student') {
    if (!programStrand) errors.program_strand = 'Program or strand is required.'
    else if (!(COLLEGE_PROGRAMS.has(programStrand) || SENIOR_HIGH_PROGRAMS.has(programStrand))) errors.program_strand = 'Select an offered Ormoc program or pathway.'
    if (!yearGradeLevel) errors.year_grade_level = 'Year or grade level is required.'
    else if (!['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'].includes(yearGradeLevel)) errors.year_grade_level = 'Select a valid year or grade level.'
    else if (yearGradeLevel.startsWith('Grade') !== SENIOR_HIGH_PROGRAMS.has(programStrand)) errors.program_strand = 'Select a program that matches your year or grade level.'
  } else {
    if (programStrand.length > 150) errors.program_strand = 'Program or strand must not exceed 150 characters.'
    if (yearGradeLevel.length > 100) errors.year_grade_level = 'Year or grade level must not exceed 100 characters.'
  }

  if (!requestedRole) errors.role = 'The selected role is invalid.'
  else if (requestedRole === 'Admin') errors.role = 'Administrator accounts cannot be registered publicly.'

  if (!password) errors.password = 'Password is required.'
  else if (password.length < 8) errors.password = 'Password must contain at least 8 characters.'
  else if (password.length > 72) errors.password = 'Password must not exceed 72 characters.'
  if (!confirmPassword) errors.confirm_password = 'Password confirmation is required.'
  else if (password !== confirmPassword) errors.confirm_password = 'Password confirmation does not match.'

  return {
    schoolId, firstName, lastName, schoolEmail, programStrand, yearGradeLevel,
    password, confirmPassword, role: requestedRole,
    errors, isValid: Object.keys(errors).length === 0,
  }
}

export function validateRoleLogin(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const schoolId = normalizeSchoolId(input.school_id)
  const role = normalizeRole(input.login_as)
  const portal = normalizePortal(input.portal)
  const password = typeof input.password === 'string' ? input.password : ''
  const errors: FieldErrors = {}

  if (input.portal !== undefined && !portal) errors.portal = 'Select a valid login portal.'
  else if (!portal && !role) errors.login_as = 'Select a valid login role.'
  if (!schoolId) errors.school_id = 'School ID is required.'
  else if (!SCHOOL_ID_PATTERN.test(schoolId)) errors.school_id = 'Enter a valid school ID.'
  if (!password) errors.password = 'Password is required.'
  else if (password.length > 72) errors.password = 'Password must not exceed 72 characters.'

  return { schoolId, role, portal, password, errors, isValid: Object.keys(errors).length === 0 }
}
