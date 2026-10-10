import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { createCirculationCaseService } from './circulation-case.service.ts'

test('open damage case is idempotent for the same transaction', async () => {
  const state = { inserts: 0, events: 0 }
  const existing = {
    case_id: 5, case_type: 'Damage', transaction_id: 12, physical_copy_id: 3, borrower_user_id: 4,
    status: 'Open', assigned_to_user_id: null, summary: 'Torn cover', opened_at: new Date(), updated_at: new Date(),
    resolved_at: null, opened_by_user_id: 1, resolved_by_user_id: null, policy_version_id: null,
    threshold_days_snapshot: null, threshold_reached_at: null, baseline_condition_status: 'Good',
    observed_condition_status: 'Damaged', lost_book_report_id: null,
  }
  let firstLookup = true
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql: string) {
      if (sql.includes('FROM accounts')) return [[{ user_id: 1 }]]
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('FOR UPDATE')) {
        return [[{ transaction_id: 12, user_id: 4, physical_copy_id: 3, transaction_status: 'Borrowed', condition_status: 'Good' }]]
      }
      if (sql.includes('FROM circulation_cases WHERE transaction_id')) {
        if (firstLookup) { firstLookup = false; return [[]] }
        return [[existing]]
      }
      if (sql.includes('INSERT INTO circulation_cases')) { state.inserts += 1; return [{ insertId: 5, affectedRows: 1 }] }
      if (sql.includes('INSERT INTO circulation_case_events')) { state.events += 1; return [{ insertId: 1, affectedRows: 1 }] }
      if (sql.includes('UPDATE circulation_cases')) return [{ affectedRows: 1 }]
      if (sql.includes('INSERT INTO admin_notifications')) return [{ insertId: 1, affectedRows: 1 }]
      if (sql.includes('INSERT INTO notifications') || sql.includes('INSERT IGNORE INTO notifications')) return [{ insertId: 1, affectedRows: 1 }]
      if (sql.includes('FROM circulation_cases WHERE case_id')) return [[existing]]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const service = createCirculationCaseService({ getConnection: async () => connection } as unknown as Pool)
  const first = await service.openDamageCase(9, { transactionId: 12, description: 'Torn cover', observedCondition: 'Damaged' })
  assert.equal(first.caseId, 5)
  assert.equal(state.inserts, 1)
  const second = await service.openDamageCase(9, { transactionId: 12, description: 'Still torn', observedCondition: 'Damaged' })
  assert.equal(second.caseId, 5)
  assert.equal(state.inserts, 1)
  assert.ok(state.events >= 2)
})

test('resolve requires a reason', async () => {
  const service = createCirculationCaseService({
    getConnection: async () => ({
      async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
      async execute() { return [[]] },
    }),
  } as unknown as Pool)
  await assert.rejects(
    () => service.resolveCase(1, 5, {}),
    /reason/i,
  )
})
