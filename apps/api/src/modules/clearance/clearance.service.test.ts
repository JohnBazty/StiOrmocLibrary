import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createClearanceService } from './clearance.service.ts'

test('admin clearance list exposes pending lost-book reports for review', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes("WHERE l.report_status='Pending'")) return [[{
        lost_book_report_id: 12, user_id: 7, school_id: '02000871654',
        full_name: 'Test Borrower', user_role: 'Student', title: 'Emma',
        reported_at: '2026-09-26T01:00:00.000Z',
      }]]
      return [[]]
    },
  } as unknown as Pool

  const result = await createClearanceService(database).list({ role: 'Admin' }, {})
  assert.deepEqual(result.pendingLostReports, [{
    lostBookReportId: 12, userId: 7, schoolId: '02000871654',
    borrowerName: 'Test Borrower', role: 'Student', title: 'Emma',
    reportedAt: '2026-09-26T01:00:00.000Z',
  }])
})

test('a lost-book charge taken from the book price blocks clearance like a quoted charge', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('FROM users u WHERE u.user_id = ?')) return [[{ user_id: 7, school_id: 'STI-7', full_name: 'Borrower', account_status: 'Active' }]]
      if (sql.includes('FROM lost_book_reports l INNER JOIN borrow_transactions')) return [[{
        lost_book_report_id: 3, transaction_id: 900, report_status: 'Confirmed', replacement_charge: '450.00',
        charge_resolution: 'Book Price', payment_status: 'Unpaid', title: 'Clean Code',
      }]]
      return [[]]
    },
  } as unknown as Pool
  const result = await createClearanceService(database).compute(7, false)
  assert.equal(result.status, 'Not Cleared')
  assert.equal(result.summary.unpaidReplacementCharges, 450)
  assert.equal(result.summary.blockCount, 1)
})

test('clearance totals and lost-charge payment accept book-price charges', async () => {
  const seen: string[] = []
  const database = { async execute(sql: string) { seen.push(sql); return [[]] } } as unknown as Pool
  await createClearanceService(database).exportRows({ role: 'Librarian' } as never)
  await assert.rejects(createClearanceService(database).settleLostCharge({ role: 'Librarian', accountId: 1 } as never, 3))
  const lostSql = seen.filter((sql) => sql.includes('lost_book_reports'))
  assert.equal(lostSql.length, 2)
  for (const sql of lostSql) assert.match(sql, /charge_resolution IN \('Quoted','Book Price'\)/)
})
