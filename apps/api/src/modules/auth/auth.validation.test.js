import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardForRole, ROLES, webDashboardForRole } from './auth.constants.js'
import { isInstitutionalEmail, normalizeEmail, validateLoginInput, validateRegistrationInput } from './auth.validation.js'

test('normalizes institutional email before database lookup', () => {
  assert.equal(normalizeEmail('  Student.123@ORMOC.STI.EDU.PH '), 'student.123@ormoc.sti.edu.ph')
})

test('accepts only the STI Ormoc institutional domain', () => {
  assert.equal(isInstitutionalEmail('student.123456@ormoc.sti.edu.ph'), true)
  assert.equal(isInstitutionalEmail('faculty.name@ormoc.sti.edu.ph'), true)
  assert.equal(isInstitutionalEmail('faculty.name@sti.edu'), true)
  assert.equal(isInstitutionalEmail('student@gmail.com'), false)
  assert.equal(isInstitutionalEmail('user@ormoc.sti.edu.ph.attacker.com'), false)
})

test('validates all registration fields and the six-character password minimum', () => {
  const valid = validateRegistrationInput({
    fullName: '  Maria   Santos  ',
    email: 'maria.santos@sti.edu',
    role: 'Faculty',
    password: 'sixsix',
  })
  assert.equal(valid.isValid, true)
  assert.equal(valid.fullName, 'Maria Santos')

  const invalid = validateRegistrationInput({ fullName: '', email: 'user@yahoo.com', role: 'Administrator', password: '12345' })
  assert.equal(invalid.isValid, false)
  assert.ok(invalid.errors.fullName)
  assert.ok(invalid.errors.email)
  assert.ok(invalid.errors.role)
  assert.ok(invalid.errors.password)
})

test('rejects missing fields and bcrypt-truncated passwords', () => {
  const missing = validateLoginInput({ email: '', password: '' })
  assert.equal(missing.isValid, false)
  assert.equal(missing.errors.email, 'School email address is required.')
  assert.equal(missing.errors.password, 'Password is required.')

  const longPassword = validateLoginInput({
    email: 'student.123456@ormoc.sti.edu.ph',
    password: 'x'.repeat(73),
  })
  assert.equal(longPassword.isValid, false)
})

test('routes staff and library users to their permitted dashboards', () => {
  assert.equal(dashboardForRole(ROLES.SYSTEM_ADMINISTRATOR), '/admin/dashboard')
  assert.equal(dashboardForRole(ROLES.LIBRARIAN), '/admin/dashboard')
  assert.equal(dashboardForRole(ROLES.STUDENT), '/user/dashboard')
  assert.equal(dashboardForRole(ROLES.FACULTY), '/user/dashboard')
  assert.equal(dashboardForRole('Unknown'), '/login')
})

test('routes each authenticated role to its canonical React workspace', () => {
  assert.equal(webDashboardForRole(ROLES.SYSTEM_ADMINISTRATOR), '/admin/dashboard')
  assert.equal(webDashboardForRole(ROLES.LIBRARIAN), '/librarian/dashboard')
  assert.equal(webDashboardForRole(ROLES.FACULTY), '/faculty/dashboard')
  assert.equal(webDashboardForRole(ROLES.STUDENT), '/student/dashboard')
})
