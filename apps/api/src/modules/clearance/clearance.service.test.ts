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

function lostDecisionDatabase(report: { title_price: string | null; current_quotation_id: number | null; current_quotation_amount: string | null }) {
  const state = { reportUpdate: null as unknown[] | null, messages: [] as string[], commits: 0, rollbacks: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2 }]]
      if (sql.includes('FROM lost_book_reports l INNER JOIN borrow_transactions')) return [[{
        lost_book_report_id: 3, transaction_id: 900, user_id: 7, report_status: 'Pending', material_id: 100, physical_copy_id: 50, title: 'Clean Code', ...report,
      }]]
      if (sql.startsWith('UPDATE lost_book_reports')) { state.reportUpdate = values; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO')) { state.messages.push(String(values.find((value) => typeof value === 'string' && value.includes('Clean Code')) ?? '')); return [{ affectedRows: 1, insertId: 1 }] }
      return [{ affectedRows: 1 }]
    },
  }
  return { state, database: { getConnection: async () => connection, execute: connection.execute.bind(connection) } as unknown as Pool }
}

test('confirming a lost book charges the book price with no extra fee, even when a quotation exists', async () => {
  const { state, database } = lostDecisionDatabase({ title_price: '450.00', current_quotation_id: 8, current_quotation_amount: '700.00' })
  await createClearanceService(database).decideLost({ role: 'Librarian', accountId: 20 }, 3, { status: 'Confirmed' })
  const [quotationId, purchasePriceSnapshot, charge, resolution] = state.reportUpdate ?? []
  assert.deepEqual({ quotationId, purchasePriceSnapshot, charge, resolution }, { quotationId: null, purchasePriceSnapshot: 450, charge: 450, resolution: 'Book Price' })
  assert.ok(state.messages.every((message) => message.includes('PHP 450.00')))
  assert.equal(state.commits, 1)
})

test('confirming a lost book with no book price falls back to the supplier quotation, then to awaiting quotation', async () => {
  const quoted = lostDecisionDatabase({ title_price: null, current_quotation_id: 8, current_quotation_amount: '700.00' })
  await createClearanceService(quoted.database).decideLost({ role: 'Librarian', accountId: 20 }, 3, { status: 'Confirmed' })
  assert.deepEqual(quoted.state.reportUpdate?.slice(0, 4), [8, null, 700, 'Quoted'])
  const none = lostDecisionDatabase({ title_price: '0.00', current_quotation_id: null, current_quotation_amount: null })
  await createClearanceService(none.database).decideLost({ role: 'Librarian', accountId: 20 }, 3, { status: 'Confirmed' })
  assert.deepEqual(none.state.reportUpdate?.slice(0, 4), [null, null, 0, 'Awaiting Quotation'])
})

test('a staff-sent charge that differs from the book price is rejected before any write', async () => {
  const { state, database } = lostDecisionDatabase({ title_price: '450.00', current_quotation_id: null, current_quotation_amount: null })
  await assert.rejects(
    createClearanceService(database).decideLost({ role: 'Librarian', accountId: 20 }, 3, { status: 'Confirmed', replacement_charge: 999 }),
    (error: { code?: string }) => error.code === 'LOST_BOOK_CHARGE_MISMATCH',
  )
  assert.equal(state.reportUpdate, null)
  assert.equal(state.rollbacks, 1)
})

test('the clearance detail exposes the book price for a pending lost-book report', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('FROM users u WHERE u.user_id = ?')) return [[{ user_id: 7, school_id: 'STI-7', full_name: 'Borrower', account_status: 'Active' }]]
      if (sql.includes('FROM lost_book_reports l INNER JOIN borrow_transactions')) {
        assert.match(sql, /COALESCE\(pc\.cost_php,\s*t\.purchase_price\) AS title_price/)
        return [[{ lost_book_report_id: 3, transaction_id: 900, report_status: 'Pending', replacement_charge: '0.00', charge_resolution: 'Awaiting Review', payment_status: 'Unpaid', title: 'Clean Code', title_price: '450.00' }]]
      }
      return [[]]
    },
  } as unknown as Pool
  const result = await createClearanceService(database).compute(7, false)
  assert.equal(result.lostBooks[0].titlePrice, 450)
})

function resolutionDatabase(report: { charge_resolution: string; payment_status: string }) {
  const state = { updates: [] as string[], commits: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() {}, release() {},
    async execute(sql: string) {
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2 }]]
      if (sql.includes('FROM lost_book_reports l JOIN borrow_transactions')) return [[{
        lost_book_report_id: 3, transaction_id: 900, user_id: 7, report_status: 'Confirmed', title_id: 10, title: 'Clean Code',
        current_quotation_id: 8, current_quotation_amount: '700.00', replacement_charge: '450.00', ...report,
      }]]
      if (sql.startsWith('UPDATE lost_book_reports')) { state.updates.push(sql); return [{ affectedRows: 1 }] }
      return [{ affectedRows: 1, insertId: 1 }]
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

test('a wrong unpaid book-price charge can be waived with a documented reason, but not re-charged from a quotation', async () => {
  const waivable = resolutionDatabase({ charge_resolution: 'Book Price', payment_status: 'Unpaid' })
  const result = await createClearanceService(waivable.database).resolveLost({ role: 'Librarian', accountId: 20 }, 3, { action: 'Waive', reason: 'Book found undamaged in the return bin.' })
  assert.equal(result.chargeResolution, 'Waived')
  assert.match(waivable.state.updates[0], /charge_resolution='Waived'/)
  assert.match(waivable.state.updates[0], /replacement_charge=0/, 'desk, fines and dashboard totals read replacement_charge, so a waiver must zero it')
  for (const [report, body] of [
    [{ charge_resolution: 'Book Price', payment_status: 'Unpaid' }, { action: 'Charge' }],
    [{ charge_resolution: 'Book Price', payment_status: 'Paid' }, { action: 'Waive', reason: 'Too late to waive this one.' }],
  ] as const) {
    const blocked = resolutionDatabase(report)
    await assert.rejects(createClearanceService(blocked.database).resolveLost({ role: 'Librarian', accountId: 20 }, 3, body),
      (error: { code?: string }) => error.code === 'LOST_BOOK_ALREADY_RESOLVED')
    assert.equal(blocked.state.updates.length, 0)
  }
})
