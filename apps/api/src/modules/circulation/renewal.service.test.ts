import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createRenewalService } from './renewal.service.ts'

const activePolicy = {
  borrowing_policy_version_id: 4,
  effective_on: '2026-01-01',
  student_max_active_books: 2,
  faculty_max_active_books: null,
  borrowing_days: 1,
  due_time_cutoff: '08:59:00',
  max_renewals: 1,
  renewal_extension_days: 1,
  student_max_active_reservations: 2,
  faculty_max_active_reservations: null,
  block_renewal_if_overdue: 1,
  block_renewal_if_unpaid_fines: 1,
  block_renewal_if_reserved: 1,
  long_overdue_after_days: null,
  change_reason: 'STI renewal policy',
  created_by_user_id: 1,
  created_at: '2026-01-01',
}

interface FixtureOptions {
  actorUserId?: number
  loanUserId?: number
  status?: string
  renewalCount?: number
  approvedCount?: number
  reservation?: boolean
  fine?: boolean
  lostCharge?: boolean
  lostReport?: boolean
  accountStatus?: string
  accountRole?: string
  existingDecision?: Record<string, unknown>
}

function renewalPool(options: FixtureOptions = {}) {
  const state = {
    commits: 0,
    rollbacks: 0,
    decisionInserts: 0,
    loanUpdates: 0,
    notifications: 0,
    decisionValues: [] as unknown[],
  }
  const actorUserId = options.actorUserId ?? 7
  const loanUserId = options.loanUserId ?? 7
  const dueAt = new Date('2026-10-12T08:59:00+08:00')
  const connection = {
    async beginTransaction() {},
    async commit() { state.commits += 1 },
    async rollback() { state.rollbacks += 1 },
    release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('FROM accounts WHERE account_id')) {
        return [[{
          account_id: 2,
          user_id: actorUserId,
          role: options.accountRole ?? 'Student',
          account_status: 'Active',
        }]]
      }
      if (sql.includes('FROM loan_renewal_requests WHERE request_key')) {
        return [options.existingDecision ? [options.existingDecision] : []]
      }
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('bt.initial_due_at')) {
        return [[{
          transaction_id: 31,
          user_id: loanUserId,
          material_id: 41,
          physical_copy_id: 51,
          borrowing_policy_version_id: 4,
          borrowed_at: new Date('2026-10-09T10:00:00+08:00'),
          due_at: dueAt,
          initial_due_at: dueAt,
          renewal_count: options.renewalCount ?? 0,
          transaction_status: options.status ?? 'Borrowed',
          user_account_status: options.accountStatus ?? 'Active',
          normalized_account_status: options.accountStatus ?? 'Active',
          material_type: 'Book',
          title_id: 61,
          title: 'Clean Code',
          condition_status: 'Good',
          copy_lifecycle_status: 'Active',
          title_lifecycle_status: 'Active',
        }]]
      }
      if (sql.includes('FROM borrowing_policy_versions')) return [[activePolicy]]
      if (sql.includes('FROM borrowing_policy_material_rules')) {
        return [[
          { borrowing_policy_version_id: 4, material_type: 'Book', is_borrowable: 1 },
          { borrowing_policy_version_id: 4, material_type: 'Thesis/Manuscript', is_borrowable: 0 },
        ]]
      }
      if (sql.includes('COUNT(*) AS approved_count')) {
        return [[{ approved_count: options.approvedCount ?? options.renewalCount ?? 0 }]]
      }
      if (sql.includes('FROM physical_copies WHERE title_id')) return [[{ physical_copy_id: 51 }]]
      if (sql.includes('FROM reservations')) return [options.reservation ? [{ reservation_id: 90 }] : []]
      if (sql.includes('FROM fines')) return [options.fine ? [{ fine_id: 91 }] : []]
      if (sql.includes('report_status = \'Confirmed\'') && sql.includes('payment_status = \'Unpaid\'')) {
        return [options.lostCharge ? [{ lost_book_report_id: 92 }] : []]
      }
      if (sql.includes("report_status IN ('Pending','Confirmed')")) {
        return [options.lostReport ? [{ lost_book_report_id: 93 }] : []]
      }
      if (sql.includes('FROM library_closed_days')) return [[]]
      if (sql.includes('FROM library_operating_schedule')) {
        return [[
          { day_of_week: 1, is_open: 1 }, { day_of_week: 2, is_open: 1 },
          { day_of_week: 3, is_open: 1 }, { day_of_week: 4, is_open: 1 },
          { day_of_week: 5, is_open: 1 }, { day_of_week: 6, is_open: 1 },
          { day_of_week: 7, is_open: 0 },
        ]]
      }
      if (sql.includes('INSERT INTO loan_renewal_requests')) {
        state.decisionInserts += 1
        state.decisionValues = values
        return [{ insertId: 101, affectedRows: 1 }]
      }
      if (sql.includes('UPDATE borrow_transactions')) {
        state.loanUpdates += 1
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('INTO notifications')) {
        state.notifications += 1
        return [{ insertId: 102, affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return {
    state,
    database: {
      getConnection: async () => connection,
      execute: connection.execute.bind(connection),
    } as unknown as Pool,
  }
}

const borrowerActor = { accountId: 2, role: 'Student' }
const requestBody = { requestKey: 'renewal-request-31' }
const clock = () => new Date('2026-10-10T08:00:00+08:00')

test('eligible borrower renewal records approval and updates the due date once', async () => {
  const { state, database } = renewalPool()
  const result = await createRenewalService(database, clock).submit(31, borrowerActor, requestBody)
  assert.equal(result.status, 'Approved')
  assert.equal(result.renewalNumber, 1)
  assert.equal(new Date(result.newDueAt!).getDate(), 13)
  assert.equal(state.decisionInserts, 1)
  assert.equal(state.loanUpdates, 1)
  assert.equal(state.notifications, 1)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
})

test('waiting reservation rejects safely without changing the loan', async () => {
  const { state, database } = renewalPool({ reservation: true })
  const result = await createRenewalService(database, clock).submit(31, borrowerActor, requestBody)
  assert.equal(result.status, 'Rejected')
  assert.equal(result.decisionCode, 'RENEWAL_RESERVATION_WAITING')
  assert.equal(result.decisionSummary, 'Another borrower is waiting for this title.')
  assert.equal(state.decisionInserts, 1)
  assert.equal(state.loanUpdates, 0)
  assert.equal(state.notifications, 0)
  assert.equal(state.commits, 1)
})

test('same request key returns the stored decision without another update', async () => {
  const existingDecision = {
    renewal_request_id: 101,
    request_key: 'renewal-request-31',
    transaction_id: 31,
    renewal_number: 1,
    requester_account_id: 2,
    requester_user_id: 7,
    decision_source: 'System',
    deciding_staff_account_id: null,
    deciding_staff_user_id: null,
    staff_note: null,
    status: 'Approved',
    decision_code: 'RENEWAL_APPROVED',
    decision_summary: 'The loan was renewed successfully.',
    blocker_codes: '[]',
    previous_due_at: new Date('2026-10-12T08:59:00+08:00'),
    new_due_at: new Date('2026-10-13T08:59:00+08:00'),
    borrowing_policy_version_id: 4,
    requested_at: clock(),
    decided_at: clock(),
  }
  const { state, database } = renewalPool({ existingDecision })
  const result = await createRenewalService(database, clock).submit(31, borrowerActor, requestBody)
  assert.equal(result.status, 'Approved')
  assert.equal(result.idempotent, true)
  assert.equal(state.decisionInserts, 0)
  assert.equal(state.loanUpdates, 0)
  assert.equal(state.commits, 1)
})

test('approved-row mismatch fails safely and rolls back', async () => {
  const { state, database } = renewalPool({ renewalCount: 1, approvedCount: 0 })
  await assert.rejects(
    createRenewalService(database, clock).submit(31, borrowerActor, { requestKey: 'mismatch-31' }),
    (error: unknown) => error instanceof HttpError && error.code === 'RENEWAL_STATE_INCONSISTENT',
  )
  assert.equal(state.decisionInserts, 0)
  assert.equal(state.loanUpdates, 0)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})

test('borrower cannot preflight another user loan', async () => {
  const { database } = renewalPool({ loanUserId: 8 })
  await assert.rejects(
    createRenewalService(database, clock).preflight(31, borrowerActor),
    (error: unknown) => error instanceof HttpError && error.status === 404 && error.code === 'RENEWAL_LOAN_NOT_FOUND',
  )
})

test('staff renewal requires a note before opening a transaction', async () => {
  const { state, database } = renewalPool()
  await assert.rejects(
    createRenewalService(database, clock).submit(31, { accountId: 2, role: 'Admin' }, requestBody),
    (error: unknown) => error instanceof HttpError && error.code === 'RENEWAL_STAFF_NOTE_REQUIRED',
  )
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 0)
})

test('Admin renewal records Staff source and the required note', async () => {
  const { state, database } = renewalPool({ actorUserId: 99, accountRole: 'Admin' })
  const result = await createRenewalService(database, clock).submit(
    31,
    { accountId: 2, role: 'Admin' },
    { requestKey: 'staff-renewal-31', staffNote: 'Borrower requested the extension at the circulation desk.' },
  )
  assert.equal(result.status, 'Approved')
  assert.equal(result.decisionSource, 'Staff')
  assert.equal(result.staffNote, 'Borrower requested the extension at the circulation desk.')
  assert.equal(state.decisionValues[5], 'Staff')
  assert.equal(state.decisionValues[8], 'Borrower requested the extension at the circulation desk.')
})
