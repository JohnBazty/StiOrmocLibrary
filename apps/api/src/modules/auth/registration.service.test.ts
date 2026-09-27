import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { createRegistrationService } from './registration.service.ts'

const application = {
  role: 'Staff', school_id: 'STAFF-123', school_email: 'staff.123@ormoc.sti.edu.ph',
  first_name: 'Library', last_name: 'Worker', password: 'GoodPassword123', confirm_password: 'GoodPassword123',
}

function fakeDatabase() {
  const state: { request: Record<string, unknown> | null; writes: string[]; committed: number; rolledBack: number } = {
    request: null, writes: [], committed: 0, rolledBack: 0,
  }
  const execute = async (sql: string, values: unknown[] = []) => {
    state.writes.push(sql)
    if (sql.startsWith('SELECT account_id FROM accounts') || sql.startsWith('SELECT user_id FROM users')) return [[]]
    if (sql.startsWith('SELECT request_id FROM registration_requests')) return [[]]
    if (sql.startsWith('INSERT INTO registration_requests')) {
      state.request = { request_id: 5, school_id: values[0], email: values[1], first_name: values[2], last_name: values[3],
        program_strand: values[4], year_grade_level: values[5], requested_role: values[6],
        password_hash: values[7], status: 'PendingEmail', code_attempts: 0, code_hash: null, code_expires_at: null }
      return [{ insertId: 5 }]
    }
    if (sql.startsWith('UPDATE registration_requests SET code_hash')) {
      Object.assign(state.request!, { code_hash: values[0], code_expires_at: values[1], code_attempts: 0 })
      return [{}]
    }
    if (sql.startsWith('SELECT * FROM registration_requests')) return [state.request ? [state.request] : []]
    if (sql.startsWith('UPDATE registration_requests SET code_attempts')) { state.request!.code_attempts = Number(state.request!.code_attempts) + 1; return [{}] }
    if (sql.startsWith("UPDATE registration_requests SET status='PendingApproval'")) { state.request!.status = 'PendingApproval'; state.request!.code_hash = null; return [{}] }
    if (sql.startsWith('UPDATE registration_requests SET status=')) { state.request!.status = values[0]; state.request!.code_hash = null; return [{}] }
    if (sql.startsWith('DELETE FROM registration_requests')) { state.request = null; return [{}] }
    if (sql.startsWith('SELECT role_id FROM roles')) return [[{ role_id: 6 }]]
    if (sql.startsWith('INSERT INTO accounts')) return [{ insertId: 12 }]
    if (sql.startsWith('INSERT INTO users')) return [{ insertId: 17 }]
    return [{}]
  }
  const connection = { execute, beginTransaction: async () => undefined, commit: async () => { state.committed++ },
    rollback: async () => { state.rolledBack++ }, release: () => undefined }
  return { state, database: { execute, getConnection: async () => connection } as never }
}

test('Staff registration verifies email before Admin approval creates an account', async () => {
  const { state, database } = fakeDatabase()
  let delivered = ''
  const service = createRegistrationService(database, async (_email, code) => { delivered = code }, { hash: async () => 'secure-hash' } as never, 'postgres')
  const requested = await service.register(application)
  assert.equal(requested.status, 'PendingEmail')
  assert.equal(state.request!.password_hash, 'secure-hash')
  assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO accounts')), false)
  assert.equal(state.writes.some(sql => sql.includes('GoodPassword123')), false)
  await assert.rejects(service.verify({ school_id: application.school_id, code: '000000' === delivered ? '999999' : '000000' }),
    (error: unknown) => error instanceof HttpError && error.code === 'CODE_INVALID')
  assert.equal(state.request!.code_attempts, 1)
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  const verified = await service.verify({ school_id: application.school_id, code: delivered })
  assert.equal(verified.status, 'PendingApproval')
  assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO accounts')), false)
  await assert.rejects(service.verify({ school_id: application.school_id, code: delivered }),
    (error: unknown) => error instanceof HttpError && error.code === 'REGISTRATION_NOT_READY')
  await service.review(5, 1, 'approve')
  assert.equal(state.request!.status, 'Completed')
  assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO accounts')), true)
  assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO users')), true)
})

test('Student and Faculty registrations also wait for Admin approval after email verification', async () => {
  for (const role of ['Student', 'Faculty'] as const) {
    const { state, database } = fakeDatabase()
    let delivered = ''
    const service = createRegistrationService(database, async (_email, code) => { delivered = code }, { hash: async () => 'secure-hash' } as never, 'postgres')
    const details = role === 'Student' ? { program_strand: 'Bachelor of Science in Information Technology', year_grade_level: '4th Year' } : {}
    await service.register({ ...application, ...details, role })
    const verified = await service.verify({ school_id: application.school_id, code: delivered })
    assert.equal(verified.status, 'PendingApproval')
    assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO accounts')), false)
    await service.review(5, 1, 'approve')
    assert.equal(state.request?.status, 'Completed')
    assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO accounts')), true)
  }
})

test('rejecting a verified registration creates no account and stores the Admin decision', async () => {
  const { state, database } = fakeDatabase()
  let delivered = ''
  const service = createRegistrationService(database, async (_email, code) => { delivered = code }, { hash: async () => 'secure-hash' } as never, 'postgres')
  await service.register(application)
  await service.verify({ school_id: application.school_id, code: delivered })
  await service.review(5, 1, 'reject')
  assert.equal(state.request?.status, 'Rejected')
  assert.equal(state.writes.some(sql => sql.startsWith('INSERT INTO accounts')), false)
})

test('email delivery failure removes the unusable pending request', async () => {
  const { state, database } = fakeDatabase()
  const service = createRegistrationService(database, async () => { throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Email unavailable') },
    { hash: async () => 'secure-hash' } as never, 'postgres')
  await assert.rejects(service.register(application), (error: unknown) => error instanceof HttpError && error.code === 'EMAIL_DELIVERY_UNAVAILABLE')
  assert.equal(state.request, null)
})

test('registration refuses MySQL even when a sender is available', async () => {
  const { database } = fakeDatabase()
  const service = createRegistrationService(database, async () => undefined, { hash: async () => 'secure-hash' } as never, 'mysql')
  await assert.rejects(service.register(application), (error: unknown) => error instanceof HttpError && error.code === 'SUPABASE_REQUIRED')
})
