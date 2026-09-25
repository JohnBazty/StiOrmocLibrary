const INSTITUTIONAL_EMAIL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?@(?:ormoc\.sti\.edu\.ph|sti\.edu)$/i

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isInstitutionalEmail(value) {
  return INSTITUTIONAL_EMAIL_PATTERN.test(normalizeEmail(value))
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
