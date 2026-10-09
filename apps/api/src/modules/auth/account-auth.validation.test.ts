import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAccountRegistration, validateRoleLogin } from './account-auth.validation.ts'

test('registration validator trims identity fields and accepts the mobile form contract', () => {
  const result = validateAccountRegistration({
    school_id: ' sti-2026-1234 ', first_name: '  Juan  ', last_name: '  Dela   Cruz ',
    contact_number: '0917 123 4567', program_strand: ' BSIT ', year_grade_level: ' 2nd Year ',
    password: 'LibraryPass9', confirm_password: 'LibraryPass9',
  })
  assert.equal(result.isValid, true)
  assert.equal(result.schoolId, 'STI-2026-1234')
  assert.equal(result.firstName, 'Juan')
  assert.equal(result.lastName, 'Dela Cruz')
  assert.equal(result.role, 'Student')
})

test('registration validator returns field errors for missing data and mismatched confirmation', () => {
  const result = validateAccountRegistration({
    school_id: ' ', first_name: '', last_name: '', contact_number: '',
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

test('login validator accepts portal without login_as', () => {
  const user = validateRoleLogin({ portal: 'user', school_id: 'STI-2026-0001', password: 'LibraryPass9' })
  const staff = validateRoleLogin({ portal: 'staff', school_id: 'ADMIN-001', password: 'LibraryPass9' })
  assert.equal(user.isValid, true)
  assert.equal(user.portal, 'user')
  assert.equal(staff.isValid, true)
  assert.equal(staff.portal, 'staff')
})
