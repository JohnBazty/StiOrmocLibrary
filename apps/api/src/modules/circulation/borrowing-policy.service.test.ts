import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createBorrowingPolicyService, manilaCampusDate } from './borrowing-policy.service.ts'
import { calculateOperatingDueDate, formatDueCutoffLabel } from './due-date.ts'
import { validatePublishBorrowingPolicy } from './borrowing-policy.validation.ts'

const legacyPolicyRow = {
  borrowing_policy_version_id: 1, effective_on: '2000-01-01', student_max_active_books: 2, faculty_max_active_books: null,
  borrowing_days: 1, due_time_cutoff: '08:59:00', max_renewals: 1, renewal_extension_days: 1,
  student_max_active_reservations: 2, faculty_max_active_reservations: null,
  block_renewal_if_overdue: 1, block_renewal_if_unpaid_fines: 1, block_renewal_if_reserved: 1,
  long_overdue_after_days: null, change_reason: 'Legacy baseline reflecting behavior before configurable borrowing policies.',
  created_by_user_id: null, created_at: '2000-01-01T00:00:00.000Z',
}

test('manilaCampusDate returns YYYY-MM-DD', () => {
  assert.match(manilaCampusDate(new Date('2026-10-09T16:00:00Z')), /^\d{4}-\d{2}-\d{2}$/)
})

test('calculateOperatingDueDate skips Sunday and closures', () => {
  const due = calculateOperatingDueDate(new Date(2026, 7, 22, 14, 0), 1, '08:59:00', new Set())
  assert.equal(due.getDay(), 1)
  assert.equal(due.getHours(), 8)
  assert.equal(due.getMinutes(), 59)
})

test('formatDueCutoffLabel renders AM/PM', () => {
  assert.equal(formatDueCutoffLabel('08:59:00'), '8:59 AM')
  assert.equal(formatDueCutoffLabel('17:00:00'), '5:00 PM')
})

test('publish validation rejects backdated-looking short reasons and thesis enablement', () => {
  assert.throws(() => validatePublishBorrowingPolicy({
    effectiveOn: '2026-10-09', studentMaxActiveBooks: 2, facultyMaxActiveBooks: null, borrowingDays: 1,
    dueTimeCutoff: '08:59', maxRenewals: 1, renewalExtensionDays: 1, studentMaxActiveReservations: 2,
    facultyMaxActiveReservations: null, blockRenewalIfOverdue: true, blockRenewalIfUnpaidFines: true,
    blockRenewalIfReserved: true, longOverdueAfterDays: 14, changeReason: 'short',
    materialRules: [{ materialType: 'Book', isBorrowable: true }, { materialType: 'Thesis/Manuscript', isBorrowable: false }],
  }), (error: unknown) => error instanceof HttpError && error.code === 'BORROWING_POLICY_VALIDATION_FAILED')

  assert.throws(() => validatePublishBorrowingPolicy({
    effectiveOn: '2026-10-09', studentMaxActiveBooks: 2, facultyMaxActiveBooks: null, borrowingDays: 1,
    dueTimeCutoff: '08:59', maxRenewals: 1, renewalExtensionDays: 1, studentMaxActiveReservations: 2,
    facultyMaxActiveReservations: null, blockRenewalIfOverdue: true, blockRenewalIfUnpaidFines: true,
    blockRenewalIfReserved: true, longOverdueAfterDays: 14, changeReason: 'Enable thesis circulation incorrectly.',
    materialRules: [{ materialType: 'Book', isBorrowable: true }, { materialType: 'Thesis/Manuscript', isBorrowable: true }],
  }), (error: unknown) => error instanceof HttpError && error.code === 'BORROWING_POLICY_VALIDATION_FAILED')
})

test('resolver returns the seeded legacy policy', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('FROM borrowing_policy_versions')) return [[legacyPolicyRow]]
      if (sql.includes('FROM borrowing_policy_material_rules')) {
        return [[{ borrowing_policy_version_id: 1, material_type: 'Book', is_borrowable: 1 }, { borrowing_policy_version_id: 1, material_type: 'Thesis/Manuscript', is_borrowable: 0 }]]
      }
      throw new Error(sql)
    },
    async getConnection() { throw new Error('unused') },
  } as unknown as Pool
  const policy = await createBorrowingPolicyService(database, () => new Date('2026-10-09T00:00:00+08:00')).resolveActive(database)
  assert.equal(policy.versionId, 1)
  assert.equal(policy.studentMaxActiveBooks, 2)
  assert.equal(policy.facultyMaxActiveBooks, null)
  assert.equal(policy.borrowingDays, 1)
})

test('resolver fails closed when no policy exists', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('FROM borrowing_policy_versions')) return [[]]
      throw new Error(sql)
    },
    async getConnection() { throw new Error('unused') },
  } as unknown as Pool
  await assert.rejects(
    createBorrowingPolicyService(database).resolveActive(database),
    (error: unknown) => error instanceof HttpError && error.code === 'BORROWING_POLICY_NOT_CONFIGURED',
  )
})
