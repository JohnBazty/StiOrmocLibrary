import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
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
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('FOR UPDATE')) return [[{ transaction_id: 8, user_id: 4, due_at: new Date(2026, 7, 24, 8, 59), title: 'Networks' }]]
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
  assert.deepEqual(result, { evaluatedCount: 1, newlyOverdue: 1, nextCursor: null })
  assert.deepEqual(state, { committed: 1, rolledBack: 0, overdue: 1, fine: 1, notification: 1, clearance: 1 })
})

function scanConnection(rows: Array<Record<string, unknown>>, seen: Array<{ sql: string; values: unknown[] }>) {
  return {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('FOR UPDATE')) { seen.push({ sql, values }); return [rows] }
      if (sql.includes('FROM fine_policy_versions')) return [[{ hourly_rate: 2, daily_rate: 10, maximum_penalty: 500 }]]
      if (sql.includes('FROM library_operating_schedule')) return [[1, 2, 3, 4, 5, 6].map((day_of_week) => ({ day_of_week, is_open: 1 }))]
      if (sql.includes('FROM library_closed_days')) return [[]]
      return [{ affectedRows: 0 }]
    },
  }
}

test('D5: the overdue scan continues after the cursor and returns the next one when the batch is full', async () => {
  const seen: Array<{ sql: string; values: unknown[] }> = []
  const rows = [1, 2].map((id) => ({ transaction_id: id, user_id: 4, due_at: new Date(2026, 7, 24, 8, 59), due_at_key: `2026-08-24 08:59:0${id}`, title: 'Networks' }))
  const pool = { getConnection: async () => scanConnection(rows, seen) } as unknown as Pool
  const full = await escalateOverdueTransactions(pool, new Date(2026, 7, 24, 10, 0), 2, { dueAt: '2026-08-24 08:00:00', transactionId: 9 })
  assert.deepEqual(full.nextCursor, { dueAt: '2026-08-24 08:59:02', transactionId: 2 })
  assert.match(seen[0].sql, /\(bt\.due_at, bt\.transaction_id\) > \(\?::timestamp, \?::bigint\)/)
  assert.match(seen[0].sql, /ORDER BY bt\.due_at ASC, bt\.transaction_id ASC LIMIT 2/)
  assert.deepEqual(seen[0].values.slice(1), ['2026-08-24 08:00:00', 9])
  const short = await escalateOverdueTransactions(pool, new Date(2026, 7, 24, 10, 0), 3, full.nextCursor)
  assert.equal(short.nextCursor, null, 'a short batch ends the pass, so the next run starts from the oldest loan')
  const first = await escalateOverdueTransactions(pool, new Date(2026, 7, 24, 10, 0), 2)
  assert.doesNotMatch(seen[2].sql, /::bigint/, 'no cursor scans from the oldest loan')
  assert.equal(seen[2].values.length, 1)
  assert.equal(first.evaluatedCount, 2)
})
