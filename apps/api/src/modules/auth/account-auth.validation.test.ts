import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAccountRegistration, validateRoleLogin } from './account-auth.validation.ts'

test('registration validator trims identity fields and accepts the mobile form contract', () => {
  const result = validateAccountRegistration({
    school_id: ' sti-2026-1234 ', first_name: '  Juan  ', last_name: '  Dela   Cruz ',
    school_email: ' Juan.1234@ormoc.sti.edu.ph ', program_strand: ' Bachelor of Science in Information Technology ', year_grade_level: ' 2nd Year ',
    password: 'LibraryPass9', confirm_password: 'LibraryPass9',
  })
  assert.equal(result.isValid, true)
  assert.equal(result.schoolId, 'STI-2026-1234')
  assert.equal(result.firstName, 'Juan')
  assert.equal(result.lastName, 'Dela Cruz')
  assert.equal(result.role, 'Student')
  assert.equal(result.schoolEmail, 'juan.1234@ormoc.sti.edu.ph')
})

test('nonstudent registration accepts optional academic fields but requires school email', () => {
  const result = validateAccountRegistration({
    role: 'Staff', school_id: 'STAFF-104', school_email: 'staff.104@ormoc.sti.edu.ph',
    first_name: 'Library', last_name: 'Assistant', password: 'LibraryPass9', confirm_password: 'LibraryPass9',
  })
  assert.equal(result.isValid, true)
  assert.equal(result.role, 'Staff')
  assert.equal(validateAccountRegistration({ ...result, role: 'Admin' }).isValid, false)
})

test('registration validator returns field errors for missing data and mismatched confirmation', () => {
  const result = validateAccountRegistration({
    school_id: ' ', first_name: '', last_name: '',
    program_strand: '', year_grade_level: '', password: 'Password9', confirm_password: 'Different9',
  })
  assert.equal(result.isValid, false)
  assert.equal(result.errors.school_id, 'School ID is required.')
  assert.equal(result.errors.first_name, 'First name is required.')
  assert.equal(result.errors.last_name, 'Last name is required.')
  assert.equal(result.errors.confirm_password, 'Password confirmation does not match.')
})

test('login validator requires an explicit supported role, school ID, and password', () => {
  const invalid = validateRoleLogin({ login_as: 'Visitor', school_id: '', password: '' })
  assert.equal(invalid.isValid, false)
  assert.ok(invalid.errors.login_as)
  assert.ok(invalid.errors.school_id)
  assert.ok(invalid.errors.password)
})

test('login validator accepts a user or staff portal without a selected role', () => {
  for (const portal of ['user', 'staff']) {
    const result = validateRoleLogin({ portal, school_id: 'STI-2026-1234', password: 'LibraryPass9' })
    assert.equal(result.isValid, true)
    assert.equal(result.portal, portal)
    assert.equal(result.role, '')
  }
})
