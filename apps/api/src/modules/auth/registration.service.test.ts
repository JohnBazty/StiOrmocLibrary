import assert from 'node:assert/strict'
import test from 'node:test'
import { createStaffAccount } from './registration.service.ts'

const staff = {
  school_id: 'QA-STAFF', school_email: 'staff-fixture@ormoc.sti.edu.ph',
  first_name: 'Library', last_name: 'Worker',
}

function fixture(role = 'Librarian') {
  const writes: { sql: string; args: unknown[] }[] = []
  const connection = {
    async execute(sql: string, args: unknown[] = []) {
      if (sql.startsWith('SELECT a.role')) return [[{ role, account_status: 'Active' }]]
      if (sql.startsWith('SELECT role_id')) return [[{ role_id: 6 }]]
      if (sql.startsWith('SELECT')) return [[]]
      writes.push({ sql, args })
      return [{ insertId: 12 }]
    },
    beginTransaction: async () => undefined, commit: async () => undefined,
    rollback: async () => undefined, release: () => undefined,
  }
  return { writes, database: { getConnection: async () => connection } as never }
}

test('Librarian creates a Staff account with a private random password and a setup audit record', async () => {
  const { writes, database } = fixture()
  assert.deepEqual(await createStaffAccount(1, { ...staff, password: 'ClientSuppliedPassword' }, database),
    { accountId: 12, schoolId: 'QA-STAFF' })
  const account = writes.find(write => write.sql.startsWith('INSERT INTO accounts'))
  assert.equal(account?.args[2], 'Staff')
  assert.match(String(account?.args[1]), /^\$2[aby]\$12\$/)
  assert.doesNotMatch(JSON.stringify(writes), /ClientSuppliedPassword/)
  assert.ok(writes.some(write => write.sql.includes('StaffAccountCreated') && write.args[1] === 1))
})

test('Staff setup rejects unauthorized actors, elevated roles and non-school email', async () => {
  const { writes, database } = fixture('Staff')
  await assert.rejects(createStaffAccount(1, staff, database), { status: 403 })
  await assert.rejects(createStaffAccount(1, { ...staff, role: 'Librarian' }, database), { code: 'STAFF_ROLE_REQUIRED' })
  await assert.rejects(createStaffAccount(1, { ...staff, school_email: 'test@example.invalid' }, database), { status: 422 })
  assert.deepEqual(writes, [])
})
