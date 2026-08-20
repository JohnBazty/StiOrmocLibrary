const INSTITUTIONAL_EMAIL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?@(?:ormoc\.sti\.edu\.ph|sti\.edu)$/i
const REGISTRATION_ROLES = new Set(['Student', 'Faculty', 'Librarian'])

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isInstitutionalEmail(value) {
  return INSTITUTIONAL_EMAIL_PATTERN.test(normalizeEmail(value))
}

export function normalizeFullName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function validateLoginInput(body) {
  const email = normalizeEmail(body?.email)
  const password = typeof body?.password === 'string' ? body.password : ''
  const errors = {}

  if (!email) errors.email = 'School email address is required.'
  else if (!isInstitutionalEmail(email)) errors.email = 'Use your official @ormoc.sti.edu.ph or @sti.edu email.'

  if (!password) errors.password = 'Password is required.'
  else if (password.length > 72) errors.password = 'Password must not exceed 72 characters.'

  return { email, password, errors, isValid: Object.keys(errors).length === 0 }
}

export function validateRegistrationInput(body) {
  const fullName = normalizeFullName(body?.fullName)
  const email = normalizeEmail(body?.email)
  const role = typeof body?.role === 'string' ? body.role.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const errors = {}

  if (!fullName) errors.fullName = 'Full name is required.'
  else if (fullName.length < 2 || fullName.length > 150) errors.fullName = 'Full name must contain 2 to 150 characters.'

  if (!email) errors.email = 'School email address is required.'
  else if (!isInstitutionalEmail(email)) errors.email = 'Use your official @ormoc.sti.edu.ph or @sti.edu email.'

  if (!role) errors.role = 'Select an account role.'
  else if (!REGISTRATION_ROLES.has(role)) errors.role = 'The selected account role is invalid.'

  if (!password) errors.password = 'Password is required.'
  else if (password.length < 6) errors.password = 'Password must contain at least 6 characters.'
  else if (password.length > 72) errors.password = 'Password must not exceed 72 characters.'

  return { fullName, email, role, password, errors, isValid: Object.keys(errors).length === 0 }
}
