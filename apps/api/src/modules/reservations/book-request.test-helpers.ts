import type { Pool } from '../../config/db.js'
import { borrowerEligibilityRows } from '../attendance/attendance-test-fixtures.ts'

export const policyRow = {
  borrowing_policy_version_id: 1, effective_on: '2000-01-01', student_max_active_books: 5, faculty_max_active_books: null,
  borrowing_days: 1, due_time_cutoff: '08:59:00', max_renewals: 1, renewal_extension_days: 1,
  student_max_active_reservations: 5, faculty_max_active_reservations: null,
  block_renewal_if_overdue: 1, block_renewal_if_reserved: 1, block_renewal_if_unpaid_fines: 1,
  long_overdue_after_days: null, change_reason: 'test', created_by_user_id: null, created_at: '2000-01-01',
}
export const weekdayHours = [1, 2, 3, 4, 5, 6].map((day_of_week) => ({ day_of_week, is_open: 1, opens_at: '08:00:00', closes_at: '17:00:00' }))

export type Call = { sql: string; params: unknown[] }
/** Fake pool. `handler` answers first; unanswered SQL falls back to borrower eligibility, policy and writes. */
export function fakePool(handler: (sql: string, params: unknown[]) => unknown, role = 'Student') {
  const calls: Call[] = []
  const state = { commits: 0, rollbacks: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits++ }, async rollback() { state.rollbacks++ }, release() {},
    async execute(sql: string, params: unknown[] = []) {
      calls.push({ sql, params })
      const own = handler(sql, params)
      if (own !== undefined) return [own]
      if (sql.includes('FROM library_operating_schedule') && sql.includes('opens_at')) return [weekdayHours]
      if (sql.includes('FROM borrowing_policy_versions')) return [[policyRow]]
      if (sql.includes('FROM borrowing_policy_material_rules')) return [[{ borrowing_policy_version_id: 1, material_type: 'Book', is_borrowable: 1 }]]
      const eligible = borrowerEligibilityRows(sql, role, 4)
      if (eligible) return [eligible]
      if (sql.startsWith('SELECT') || sql.includes('RETURNING')) return [[]]
      return [{ affectedRows: 1, insertId: 1 }]
    },
  }
  const database = { getConnection: async () => connection, execute: connection.execute.bind(connection) } as unknown as Pool
  return { database, calls, state }
}
