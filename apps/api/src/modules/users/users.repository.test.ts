import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { parseActiveUserFilters, parseUserFilters, UsersRepository } from './users.repository.ts'
test('active user filters are normalized and paginated safely',()=>{const result=parseActiveUserFilters({q:'  John  ',page:'2',limit:'999',role:'Student'});assert.equal(result.q,'John');assert.equal(result.page,2);assert.equal(result.limit,100);assert.equal(result.role,'Student')})
test('inactive filter includes deactivated and historically archived accounts',()=>{assert.equal(parseUserFilters({status:'Inactive'}).status,'Inactive')})

function accountDatabase(reservationCount = 0, role = 'Student') {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  let committed = false
  let rolledBack = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values })
      if (sql.includes('SELECT a.role,a.account_status')) return [[{role:'Librarian',account_status:'Active'}]]
      if (sql.includes('FROM accounts WHERE account_id')) return [[{ account_id: 9, user_id: 19, role, account_status: 'Active' }]]
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

test('Admin can deactivate a Staff account but cannot deactivate an Admin account', async () => {
  const staff = accountDatabase(0, 'Staff')
  assert.equal((await new UsersRepository(staff.pool).changeStatus(9, 2, { status: 'Deactivated', reason: 'Access withdrawn' })).account_status, 'Deactivated')
  const admin = accountDatabase(0, 'Admin')
  await assert.rejects(new UsersRepository(admin.pool).changeStatus(9, 2, { status: 'Deactivated', reason: 'Access withdrawn' }),
    (error: unknown) => error instanceof HttpError && error.code === 'USER_STATUS_PROTECTED')
})

test('manual archiving is no longer an account action', async () => {
  const fixture = accountDatabase(1)
  await assert.rejects(new UsersRepository(fixture.pool).changeStatus(9, 2, { status: 'Archived', reason: 'End of enrollment' }),
    (error: unknown) => error instanceof HttpError && error.code === 'USER_STATUS_INVALID')
  assert.equal(fixture.writes.some(row => row.sql.startsWith('UPDATE')), false)
})

test('only the owner can edit a profile', async () => {
  const fixture = accountDatabase()
  await assert.rejects(new UsersRepository(fixture.pool).editProfile(9, 2, { first_name: 'New', last_name: 'Name', program_strand: 'BSIT', year_grade_level: '2nd Year' }),
    (error: unknown) => error instanceof HttpError && error.code === 'USER_PROFILE_OWNER_REQUIRED')
  assert.equal(fixture.writes.length, 0)
})

test('self profile editing keeps the school email, school ID and role fixed and audits changed fields', async () => {
  const fixture = accountDatabase()
  const result = await new UsersRepository(fixture.pool).editProfile(9, 9, {
    first_name: 'New', last_name: 'Name',
    program_strand: 'BSIT', year_grade_level: '2nd Year',
  })
  assert.deepEqual(result.changed_fields, ['first_name', 'year_grade_level'])
  assert.ok(fixture.writes.every(row => !row.sql.includes('SET school_id') && !row.sql.includes('SET role') && !row.sql.includes('SET full_name=?,email=')))
  assert.ok(fixture.writes.every(row => !row.sql.includes('contact_number')))
  assert.ok(fixture.writes.some(row => row.sql.includes('ProfileEdited') && row.values.includes('Updated by account owner')))
})

test('school email cannot be changed through the self-profile API', async () => {
  const fixture = accountDatabase()
  await assert.rejects(new UsersRepository(fixture.pool).editProfile(9, 9, {
    first_name: 'Old', last_name: 'Name', email: 'new@example.test', program_strand: 'BSIT', year_grade_level: '1st Year',
  }), (error: unknown) => error instanceof HttpError && error.code === 'USER_EMAIL_FIXED')
  assert.equal(fixture.state().rolledBack, true)
  assert.equal(fixture.writes.some(row => row.sql.startsWith('UPDATE')), false)
})

function signInDatabase(role = 'Faculty', locked = true, accountId = 9, actorRole = 'Librarian') {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  let committed = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values })
      if (sql.includes('SELECT a.role,a.account_status')) return [[{ role: actorRole, account_status: 'Active' }]]
      if (sql.includes('FROM accounts WHERE account_id')) return [[{ account_id: accountId, user_id: 19, role, account_status: 'Active' }]]
      if (sql.includes('SELECT locked_until FROM login_attempt_windows')) return [[{ locked_until: locked ? new Date(Date.now() + 60_000) : null }]]
      return [{ affectedRows: 1 }]
    },
    commit: async () => { committed = true }, rollback: async () => undefined, release: () => undefined,
  }
  const hasher = { hash: async (value: string) => `hashed:${value}` }
  return { repository: new UsersRepository({ getConnection: async () => connection } as never, hasher as never), writes, committed: () => committed }
}
const code = (expected: string) => (error: unknown) => error instanceof HttpError && error.code === expected

test('unlock clears the account lock and records the actor and reason', async () => {
  const fixture = signInDatabase()
  assert.deepEqual(await fixture.repository.unlockSignIn(9, 2, { reason: 'Faculty forgot the password' }), { id: 9, unlocked: true })
  assert.equal(fixture.committed(), true)
  assert.ok(fixture.writes.some(row => row.sql.startsWith('DELETE FROM login_attempt_windows')))
  assert.ok(fixture.writes.some(row => row.sql.includes('account_management_events') && row.values.includes('SignInUnlocked') && row.values.includes(2) && row.values.includes('Faculty forgot the password')))
})

test('Admin sign-in actions lock the attempt row before the account, as sign-in does', async () => {
  const fixture = signInDatabase()
  await fixture.repository.unlockSignIn(9, 2, { reason: 'Faculty forgot the password' })
  const order = fixture.writes.map(row => row.sql)
  const attempt = order.findIndex(sql => sql.startsWith('SELECT locked_until FROM login_attempt_windows') && sql.includes('FOR UPDATE'))
  const account = order.findIndex(sql => sql.includes('FROM accounts WHERE account_id') && sql.includes('FOR UPDATE'))
  assert.ok(attempt >= 0 && attempt < account)
})

test('unlock needs a reason, a locked account and an unprotected target', async () => {
  await assert.rejects(signInDatabase().repository.unlockSignIn(9, 2, { reason: 'x' }), code('USER_REASON_REQUIRED'))
  await assert.rejects(signInDatabase('Faculty', false).repository.unlockSignIn(9, 2, { reason: 'Not locked at all' }), code('USER_NOT_LOCKED'))
  await assert.rejects(signInDatabase('Admin').repository.unlockSignIn(9, 2, { reason: 'Admin account' }), code('USER_STATUS_PROTECTED'))
  await assert.rejects(signInDatabase('Librarian', true, 2).repository.unlockSignIn(2, 2, { reason: 'My own account' }), code('USER_STATUS_PROTECTED'))
})

test('a Librarian cannot act on another Librarian; an Admin can, and may unlock but not reset another Admin', async () => {
  await assert.rejects(signInDatabase('Librarian').repository.setTemporaryPassword(9, 2, { reason: 'Peer reset' }), code('USER_STATUS_PROTECTED'))
  await assert.rejects(signInDatabase('Librarian').repository.unlockSignIn(9, 2, { reason: 'Peer unlock' }), code('USER_STATUS_PROTECTED'))
  assert.equal((await signInDatabase('Librarian', false, 9, 'Admin').repository.setTemporaryPassword(9, 2, { reason: 'Librarian forgot it' })).id, 9)
  assert.equal((await signInDatabase('Admin', true, 9, 'Admin').repository.unlockSignIn(9, 2, { reason: 'Admin locked out by guesses' })).unlocked, true)
  await assert.rejects(signInDatabase('Admin', false, 9, 'Admin').repository.setTemporaryPassword(9, 2, { reason: 'Admin reset' }), code('USER_STATUS_PROTECTED'))
})

test('a temporary password is returned once, forces a change, ends sessions and is never audited', async () => {
  const fixture = signInDatabase('Faculty', false)
  const result = await fixture.repository.setTemporaryPassword(9, 2, { reason: 'No working school email' })
  assert.match(result.temporary_password, /^[A-Za-z0-9]{16}$/)
  const update = fixture.writes.find(row => row.sql.startsWith('UPDATE accounts'))!
  assert.match(update.sql, /must_change_password=TRUE/)
  assert.match(update.sql, /auth_version=auth_version\+1/)
  assert.ok(update.values.includes(`hashed:${result.temporary_password}`))
  assert.ok(fixture.writes.some(row => row.sql.startsWith('UPDATE users') && row.sql.includes('auth_version=auth_version+1')))
  assert.ok(fixture.writes.some(row => row.sql.startsWith('UPDATE library_login_sessions SET revoked_at')))
  assert.ok(fixture.writes.some(row => row.sql.startsWith('DELETE FROM login_attempt_windows')))
  const audit = fixture.writes.find(row => row.sql.includes('account_management_events'))!
  assert.ok(audit.values.includes('TemporaryPasswordSet') && audit.values.includes('No working school email'))
  assert.ok(fixture.writes.every(row => !row.values.includes(result.temporary_password)))
  await assert.rejects(signInDatabase('Admin').repository.setTemporaryPassword(9, 2, { reason: 'Admin account' }), code('USER_STATUS_PROTECTED'))
})
