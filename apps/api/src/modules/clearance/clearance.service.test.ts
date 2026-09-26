import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
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
