import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { parseActiveUserFilters, UsersRepository } from './users.repository.ts'
test('active user filters are normalized and paginated safely',()=>{const result=parseActiveUserFilters({q:'  John  ',page:'2',limit:'999',role:'Student'});assert.equal(result.q,'John');assert.equal(result.page,2);assert.equal(result.limit,100);assert.equal(result.role,'Student')})

function accountDatabase(reservationCount = 0) {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  let committed = false
  let rolledBack = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values })
      if (sql.includes('FROM accounts WHERE account_id')) return [[{ account_id: 9, user_id: 19, role: 'Student', account_status: 'Active', contact_number: '09170000000' }]]
      if (sql.includes('FROM borrow_transactions')) return [[{ active_count: 0 }]]
      if (sql.includes('FROM reservations')) return [[{ active_count: reservationCount }]]
      if (sql.includes('FROM users WHERE user_id')) return [[{ full_name: 'Old Name', email: 'old@example.test', course_or_strand: 'BSIT' }]]
      if (sql.includes('FROM student_profiles')) return [[{ first_name: 'Old', last_name: 'Name', program_strand: 'BSIT', year_grade_level: '1st Year' }]]
      return [{ affectedRows: 1 }]
    },
    commit: async () => { committed = true }, rollback: async () => { rolledBack = true }, release: () => undefined,
  }
  return { pool: { getConnection: async () => connection } as never, writes, state: () => ({ committed, rolledBack }) }
}

test('deactivation synchronizes both identities and records the actor and reason', async () => {
  const fixture = accountDatabase()
  const result = await new UsersRepository(fixture.pool).changeStatus(9, 2, { status: 'Deactivated', reason: 'Student requested suspension' })
  assert.equal(result.account_status, 'Deactivated')
  assert.equal(fixture.state().committed, true)
  assert.equal(fixture.writes.filter(row => row.sql.startsWith('UPDATE')).length, 2)
  assert.ok(fixture.writes.some(row => row.sql.includes('auth_version=auth_version+1')))
  assert.ok(fixture.writes.some(row => row.sql.includes('account_management_events') && row.values.includes(2) && row.values.includes('Student requested suspension')))
})

test('archiving an account with an active reservation rolls back without changing status', async () => {
  const fixture = accountDatabase(1)
  await assert.rejects(new UsersRepository(fixture.pool).changeStatus(9, 2, { status: 'Archived', reason: 'End of enrollment' }),
    (error: unknown) => error instanceof HttpError && error.code === 'USER_HAS_OPEN_ACTIVITY')
  assert.equal(fixture.state().rolledBack, true)
  assert.equal(fixture.writes.some(row => row.sql.startsWith('UPDATE')), false)
})

test('profile editing keeps the school ID and role unchanged and audits changed fields', async () => {
  const fixture = accountDatabase()
  const result = await new UsersRepository(fixture.pool).editProfile(9, 2, {
    first_name: 'New', last_name: 'Name', email: 'new@example.test', contact_number: '09170000000',
    program_strand: 'BSIT', year_grade_level: '2nd Year', reason: 'Corrected enrollment record',
  })
  assert.deepEqual(result.changed_fields, ['first_name', 'email', 'year_grade_level'])
  assert.ok(fixture.writes.every(row => !row.sql.includes('SET school_id') && !row.sql.includes('SET role')))
  assert.ok(fixture.writes.some(row => row.sql.includes('ProfileEdited') && row.values.includes('Corrected enrollment record')))
})
