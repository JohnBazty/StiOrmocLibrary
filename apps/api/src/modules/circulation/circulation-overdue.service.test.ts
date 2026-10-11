import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { escalateOverdueTransactions, overdueCharge } from './circulation-overdue.service.ts'

test('overdue fee uses PHP 2 per hour on cutoff day and PHP 10 per day afterward', () => {
  assert.deepEqual(overdueCharge(new Date(2026, 7, 24, 8, 59), new Date(2026, 7, 24, 10, 1)), { amount: 4, units: 2, rate: 2, basis: 'Hourly' })
  assert.deepEqual(overdueCharge(new Date(2026, 7, 24, 8, 59), new Date(2026, 7, 25, 9, 0)), { amount: 10, units: 1, rate: 10, basis: 'Daily' })
})

test('overdue escalation atomically updates loan, fine, notification, and clearance', async () => {
  const state = { committed: 0, rolledBack: 0, overdue: 0, fine: 0, notification: 0, clearance: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.committed += 1 }, async rollback() { state.rolledBack += 1 }, release() {},
    async execute(sql: string) {
      if (sql.includes('borrowing_policy_versions bp')) return [[]]
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('FOR UPDATE')) {
        return [[{ transaction_id: 8, user_id: 4, due_at: new Date(2026, 7, 24, 8, 59), physical_copy_id: 3, borrowing_policy_version_id: 1, title: 'Networks' }]]
      }
      if (sql.includes('FROM fine_policy_versions')) return [[{ hourly_rate: 2, daily_rate: 10, maximum_penalty: 500 }]]
      if (sql.includes('FROM library_operating_schedule')) return [[1,2,3,4,5,6].map((day_of_week)=>({day_of_week,is_open:1}))]
      if (sql.includes('FROM library_closed_days')) return [[]]
      if (sql.startsWith('UPDATE borrow_transactions')) { state.overdue += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO admin_notifications')) { state.notification += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO fines')) { state.fine += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO clearance_statuses')) { state.clearance += 1; return [{ affectedRows: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const result = await escalateOverdueTransactions({ getConnection: async () => connection } as unknown as Pool, new Date(2026, 7, 24, 10, 0))
  assert.equal(result.evaluatedCount, 1)
  assert.equal(result.newlyOverdue, 1)
  assert.equal(result.longOverdueCasesOpened, 0)
  assert.equal(result.nextCursor, null)
  assert.deepEqual(state, { committed: 1, rolledBack: 0, overdue: 1, fine: 1, notification: 1, clearance: 1 })
})

test('overdue escalation advances cursor when the batch is full', async () => {
  const dueAt = new Date(2026, 7, 24, 8, 59)
  const loans = Array.from({ length: 100 }, (_, index) => ({
    transaction_id: index + 1,
    user_id: 4,
    due_at: dueAt,
    physical_copy_id: 3,
    borrowing_policy_version_id: 1,
    title: 'Networks',
  }))
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql: string) {
      if (sql.includes('borrowing_policy_versions bp')) return [[]]
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('FOR UPDATE')) return [loans]
      if (sql.includes('FROM fine_policy_versions')) return [[{ hourly_rate: 2, daily_rate: 10, maximum_penalty: 500 }]]
      if (sql.includes('FROM library_operating_schedule')) return [[1, 2, 3, 4, 5, 6].map((day_of_week) => ({ day_of_week, is_open: 1 }))]
      if (sql.includes('FROM library_closed_days')) return [[]]
      if (sql.startsWith('UPDATE borrow_transactions')) return [{ affectedRows: 0 }]
      if (sql.includes('INSERT INTO admin_notifications')) return [{ affectedRows: 1 }]
      if (sql.includes('INSERT INTO fines')) return [{ affectedRows: 1 }]
      if (sql.includes('INSERT INTO clearance_statuses')) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const result = await escalateOverdueTransactions({ getConnection: async () => connection } as unknown as Pool, new Date(2026, 7, 24, 10, 0), 100)
  assert.equal(result.evaluatedCount, 100)
  assert.ok(result.nextCursor)
  assert.equal(result.nextCursor?.transactionId, 100)
})

test('long-overdue scan opens one case when operating-day threshold is met', async () => {
  const state = { cases: 0, events: 0, adminAlerts: 0, userNotes: 0 }
  // Monday 08:59 Asia/Manila -> Wednesday evaluation yields 2 operating days.
  const dueAt = new Date('2026-08-03T00:59:00.000Z')
  const now = new Date('2026-08-05T02:00:00.000Z')
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql: string, params?: unknown[]) {
      if (sql.includes('borrowing_policy_versions bp')) {
        return [[{
          transaction_id: 11, user_id: 4, due_at: dueAt, physical_copy_id: 9,
          borrowing_policy_version_id: 2, long_overdue_after_days: 2, title: 'Networks',
        }]]
      }
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('FOR UPDATE')) return [[]]
      if (sql.includes('FROM fine_policy_versions')) return [[{ hourly_rate: 2, daily_rate: 10, maximum_penalty: 500 }]]
      if (sql.includes('FROM library_operating_schedule')) return [[1, 2, 3, 4, 5, 6].map((day_of_week) => ({ day_of_week, is_open: 1 }))]
      if (sql.includes('FROM library_closed_days')) return [[]]
      if (sql.includes('FROM circulation_cases WHERE transaction_id')) return [[]]
      if (sql.includes('INSERT INTO circulation_cases')) { state.cases += 1; return [{ insertId: 77, affectedRows: 1 }] }
      if (sql.includes('INSERT INTO circulation_case_events')) { state.events += 1; return [{ insertId: 1, affectedRows: 1 }] }
      if (sql.includes("VALUES ('long_overdue_case_opened'")) { state.adminAlerts += 1; return [{ insertId: 1, affectedRows: 1 }] }
      if (sql.includes('INSERT INTO notifications') || sql.includes('INSERT IGNORE INTO notifications')) {
        state.userNotes += 1
        return [{ insertId: 1, affectedRows: 1 }]
      }
      if (sql.includes('FROM circulation_cases WHERE case_id')) {
        return [[{
          case_id: 77, case_type: 'Long Overdue', transaction_id: 11, physical_copy_id: 9, borrower_user_id: 4,
          status: 'Open', assigned_to_user_id: null, summary: 'threshold', opened_at: now, updated_at: now,
          resolved_at: null, opened_by_user_id: null, resolved_by_user_id: null, policy_version_id: 2,
          threshold_days_snapshot: 2, threshold_reached_at: now, baseline_condition_status: null,
          observed_condition_status: null, lost_book_report_id: null,
        }]]
      }
      throw new Error(`Unexpected SQL: ${sql} :: ${JSON.stringify(params)}`)
    },
  }
  const result = await escalateOverdueTransactions({ getConnection: async () => connection } as unknown as Pool, now)
  assert.equal(result.longOverdueCasesOpened, 1)
  assert.deepEqual(state, { cases: 1, events: 1, adminAlerts: 1, userNotes: 1 })
})
