import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createClearanceService } from './clearance.service.ts'

const SECRET = 'ZZ-secret-reason-ZZ'
const LIBRARIAN = 'Libby Override-Librarian'
const USER_NAME = 'Zed Q. Student'
const actor = { accountId: 5, role: 'Librarian' }

type Options = {
  role?: string; revokeAffected?: number; active?: Record<string, unknown> | null
  loans?: Record<string, unknown>[]; noUserRow?: boolean; failNotice?: boolean
}

const clearedOverride = { clearance_override_id: 41, override_status: 'Cleared', reason: SECRET, applied_at: '2026-11-19T01:00:00Z', expires_at: null, applied_by: LIBRARIAN }
const loan = { transaction_id: 3, transaction_status: 'Borrowed', borrowed_at: '2026-11-18', due_at: '2026-11-25', title: 'Algorithms', accession_number: 'ACC-1', overdue_hours: 0, current_fine: 0 }

/** A fake transaction that answers only the SQL an override runs; anything else throws, so new SQL is noticed. */
function overrideFake(options: Options = {}) {
  const o = { role: 'Student', revokeAffected: 1, active: clearedOverride as Record<string, unknown> | null, loans: [] as Record<string, unknown>[], ...options }
  const state = { commits: 0, rollbacks: 0, notices: [] as unknown[][], commitsAtNotice: [] as number[], connectionSql: [] as string[], poolSql: [] as string[], inFlight: 0, maxInFlight: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string, values: unknown[] = []) {
      state.connectionSql.push(sql)
      state.inFlight += 1; state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      await Promise.resolve()
      state.inFlight -= 1
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2 }]]
      if (sql.includes('INSERT INTO clearance_overrides')) return [{ insertId: 41, affectedRows: 1 }]
      if (sql.startsWith('UPDATE clearance_overrides')) return [{ affectedRows: o.revokeAffected }]
      if (sql.includes('WHERE u.user_id')) return [o.noUserRow ? [] : [{ user_id: 7, school_id: 'STI-7', full_name: USER_NAME, course_or_strand: 'BSIT', section: 'A', account_status: 'Active' }]]
      if (sql.includes('FROM borrow_transactions bt')) return [o.loans]
      if (sql.includes('SELECT calculated.*')) return [[]]
      if (sql.includes('FROM lost_book_reports l')) return [[]]
      if (sql.includes('FROM clearance_overrides o') && sql.includes('revocation_reason')) return [o.active ? [{ ...o.active, revoked_at: null, revocation_reason: null, revoked_by: LIBRARIAN }] : []]
      if (sql.includes('FROM clearance_overrides o')) return [o.active ? [o.active] : []]
      if (sql.includes('FROM in_library_uses')) return [[]]
      if (sql.includes('INSERT INTO clearance_statuses')) return [{ affectedRows: 1 }]
      if (sql.includes('SELECT user_role FROM users')) return [[{ user_role: o.role }]]
      if (sql.includes('INSERT INTO notifications')) {
        if (o.failNotice) throw new Error('notice insert failed')
        state.notices.push(values); state.commitsAtNotice.push(state.commits); return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const pool = {
    getConnection: async () => connection,
    async execute(sql: string) {
      state.poolSql.push(sql)
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2 }]]
      throw new Error(`Unexpected pool SQL: ${sql}`)
    },
  } as unknown as Pool
  return { state, service: createClearanceService(pool) }
}

function assertNoLeak(state: { notices: unknown[][] }) {
  const text = JSON.stringify(state.notices)
  for (const secret of [SECRET, LIBRARIAN, USER_NAME]) assert.equal(text.includes(secret), false, `${secret} leaked into a notice`)
}

test('granting an override writes one Clearance updated notice for the Student, before commit, on the transaction', async () => {
  const { state, service } = overrideFake()
  const result = await service.applyOverride(actor, 7, { status: 'Cleared', reason: SECRET })
  assert.equal(result.overrideId, 41)
  assert.equal(result.clearance.status, 'Cleared')
  assert.deepEqual(state.notices, [[7, 'Clearance updated', 'Your clearance status is now Cleared.', 'Clearance', 'Clearance Override', 41, '/student/clearance', 'Important', 'clearance-override:41:granted']])
  assert.deepEqual(state.commitsAtNotice, [0])
  assert.equal(state.commits, 1); assert.equal(state.rollbacks, 0)
  assert.ok(state.connectionSql.some((sql) => sql.includes('INSERT INTO clearance_overrides')))
  assert.deepEqual(state.poolSql.filter((sql) => !sql.includes('SELECT user_id FROM accounts')), [])
  assertNoLeak(state)
})

test('a Faculty user is sent to the faculty clearance page', async () => {
  const { state, service } = overrideFake({ role: 'Faculty' })
  await service.applyOverride(actor, 7, { status: 'Cleared', reason: SECRET })
  assert.equal(state.notices[0][6], '/faculty/clearance')
})

test('on the transaction connection the compute reads run one at a time', async () => {
  const { state, service } = overrideFake()
  await service.applyOverride(actor, 7, { status: 'Cleared', reason: SECRET })
  assert.equal(state.maxInFlight, 1)
})
