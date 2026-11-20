import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { manilaTime } from '../notifications/user-notices.ts'
import { createCirculationService } from './circulation.service.ts'
import { createDeskCirculationService } from './desk-circulation.service.ts'

const CLOCK = new Date('2026-11-19T07:10:00Z') // 15:10 in Manila
const TITLE = 'Introduction to Algorithms'
const RETURNED = `${TITLE} was returned on ${manilaTime(CLOCK)}.`

type Options = {
  role?: string; status?: string; dueAt?: string | null; storedFine?: { fine_amount: string; payment_status: string } | null
  copyCondition?: string; failNotice?: boolean; staffName?: string; borrowerName?: string
}

/** A fake connection that answers only the SQL a return runs; anything else throws, so new SQL is noticed. */
function returnFake(options: Options = {}) {
  const o = { role: 'Student', status: 'Borrowed', dueAt: '2026-11-20 15:00:00', storedFine: null, copyCondition: 'Good', staffName: 'Libby Desk-Librarian', borrowerName: 'Zed Q. Borrower', ...options }
  const state = { commits: 0, rollbacks: 0, notices: [] as unknown[][], commitsAtNotice: [] as number[], fineReads: 0, fineWrites: 0, adminNotices: 0, receipts: [] as unknown[][], allSql: [] as string[] }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string, values: unknown[] = []) {
      state.allSql.push(sql)
      if (sql.includes('SELECT cc.* FROM circulation_cases cc')) return [[]]
      // Model an existing damage review; the live return flow appends its assessment to that case.
      if (sql.includes('INSERT INTO circulation_cases (case_type')) return [{ insertId: 0, affectedRows: 0 }]
      if (sql.includes('SELECT case_id, status FROM circulation_cases')) return [[{ case_id: 99, status: 'Open' }]]
      if (sql.includes('INSERT INTO circulation_case_events')) return [{ insertId: 1, affectedRows: 1 }]
      if (sql.includes('FROM library_profile_settings')) return [[{ settings_id: 1 }]]
      if (sql.includes('SELECT account_id FROM accounts')) return [[{ account_id: 1, full_name: o.staffName }]]
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2, full_name: o.staffName }]]
      if (sql.includes('FROM circulation_scan_receipts')) {
        const stored = state.receipts[0]
        return [stored ? [{ request_id: stored[0], actor_account_id: stored[1], operation: stored[2], payload_digest: stored[3], result: JSON.parse(String(stored[4])) }] : []]
      }
      if (sql.includes('INSERT INTO circulation_scan_receipts')) { state.receipts.push(values); return [{ affectedRows: 1 }] }
      if (sql.includes('WHERE pc.barcode=?')) return [[{ physical_copy_id: 20, material_id: 30, title_id: 10, title: TITLE, barcode: 'BOOK-20', condition_status: o.copyCondition, lifecycle_status: 'Active', availability_status: 'Borrowed', record_type: 'Book' }]]
      if (sql.includes('FROM in_library_uses')) return [[]]
      if (sql.includes('due_iso')) return [[{ transaction_id: 8, user_id: 7, full_name: o.borrowerName, school_id: 'STI-7', due_iso: '2026-11-20T15:00:00+08:00' }]]
      if (sql.includes('FROM borrow_transactions bt')) {
        return [[{ transaction_id: 8, user_id: 7, material_id: 30, physical_copy_id: 20, due_at: o.dueAt, transaction_status: o.status, title_id: 10, accession_number: 'ACC-20', condition_status: o.copyCondition, lifecycle_status: 'Active', title: TITLE, user_role: o.role, full_name: o.borrowerName }]]
      }
      if (sql.startsWith('UPDATE borrow_transactions')) return [{ affectedRows: 1 }]
      if (sql.includes('FROM fine_policy_versions') || sql.includes('FROM library_operating_schedule') || sql.includes('FROM library_closed_days')) return [[]]
      if (sql.includes('INSERT INTO fines')) { state.fineWrites += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('FROM fines WHERE transaction_id')) { state.fineReads += 1; return [o.storedFine ? [o.storedFine] : []] }
      if (sql.startsWith('UPDATE physical_copies') || sql.startsWith('UPDATE materials')) return [{ affectedRows: 1 }]
      if (sql.includes('SELECT pc.*,t.title')) return [[]]
      if (sql.includes('SELECT availability_status FROM physical_copies')) return [[{ availability_status: 'Available' }]]
      if (sql.includes('SELECT reservation_id FROM reservations WHERE assigned_physical_copy_id=')) return [[]]
      if (sql.includes('INSERT INTO notifications')) {
        if (o.failNotice) throw new Error('notice insert failed')
        state.notices.push(values); state.commitsAtNotice.push(state.commits); return [{ affectedRows: 1 }]
      }
      if (sql.includes('INSERT INTO admin_notifications')) { state.adminNotices += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('FROM borrowing_policy_versions')) return [[]] // no returning window set
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const database = { getConnection: async () => connection, execute: connection.execute.bind(connection) } as unknown as Pool
  return { state, database }
}

const bodyOf = (state: { notices: unknown[][] }) => String(state.notices[0][2])

test('an on-time return writes one Book returned notice for the borrower before commit', async () => {
  const { state, database } = returnFake()
  await createCirculationService(database, () => CLOCK).returnBook(1, 8)
  assert.deepEqual(state.notices, [[7, 'Book returned', RETURNED, 'Return', 'Borrow Transaction', 8, '/student/borrowing', 'Normal', 'loan:8:returned']])
  assert.deepEqual(state.commitsAtNotice, [0])
  assert.equal(state.commits, 1); assert.equal(state.rollbacks, 0); assert.equal(state.adminNotices, 1)
})

test('a faculty borrower gets a faculty link', async () => {
  const { state, database } = returnFake({ role: 'Faculty' })
  await createCirculationService(database, () => CLOCK).returnBook(1, 8)
  assert.equal(state.notices[0][6], '/faculty/borrowing')
})

test('a return at the due time has no fine text and runs no fine SQL', async () => {
  const { state, database } = returnFake({ dueAt: '2026-11-19 15:10:00' })
  await createCirculationService(database, () => CLOCK).returnBook(1, 8)
  assert.equal(bodyOf(state), RETURNED); assert.equal(state.fineReads, 0); assert.equal(state.fineWrites, 0)
})

test('a late return shows the stored fine, not the recalculated charge', async () => {
  const { state, database } = returnFake({ dueAt: '2026-11-18 15:00:00', storedFine: { fine_amount: '20.00', payment_status: 'Unpaid' } })
  await createCirculationService(database, () => CLOCK).returnBook(1, 8)
  assert.equal(bodyOf(state), `${RETURNED} Late fine: ₱20.00.`)
})

test('an overdue-status return shows the stored fine without extra rounding', async () => {
  const { state, database } = returnFake({ status: 'Overdue', dueAt: '2026-11-18 15:00:00', storedFine: { fine_amount: '12.50', payment_status: 'Unpaid' } })
  await createCirculationService(database, () => CLOCK).returnBook(1, 8)
  assert.equal(bodyOf(state), `${RETURNED} Late fine: ₱12.50.`)
})

test('a late return whose stored fine is 0.00 has no fine text', async () => {
  const { state, database } = returnFake({ dueAt: '2026-11-18 15:00:00', storedFine: { fine_amount: '0.00', payment_status: 'Unpaid' } })
  await createCirculationService(database, () => CLOCK).returnBook(1, 8)
  assert.equal(bodyOf(state), RETURNED)
})

for (const payment_status of ['Paid', 'Waived', 'Voided']) {
  test(`a stored fine already ${payment_status} is not announced as owed`, async () => {
    const { state, database } = returnFake({ dueAt: '2026-11-18 15:00:00', storedFine: { fine_amount: '20.00', payment_status } })
    await createCirculationService(database, () => CLOCK).returnBook(1, 8)
    assert.equal(bodyOf(state), RETURNED)
  })
}

test('a Damaged condition is recorded after the fine sentence', async () => {
  const early = returnFake()
  await createCirculationService(early.database, () => CLOCK).returnBook(1, 8, { condition: 'Damaged' })
  assert.equal(bodyOf(early.state), `${RETURNED} Condition recorded: Damaged.`)
  const late = returnFake({ dueAt: '2026-11-18 15:00:00', storedFine: { fine_amount: '20.00', payment_status: 'Unpaid' } })
  await createCirculationService(late.database, () => CLOCK).returnBook(1, 8, { condition: 'Damaged' })
  assert.equal(bodyOf(late.state), `${RETURNED} Late fine: ₱20.00. Condition recorded: Damaged.`)
})

test('Good, or no recorded condition on a Worn copy, adds no condition text', async () => {
  const good = returnFake()
  await createCirculationService(good.database, () => CLOCK).returnBook(1, 8, { condition: 'Good' })
  assert.equal(bodyOf(good.state), RETURNED)
  const worn = returnFake({ copyCondition: 'Worn' })
  await createCirculationService(worn.database, () => CLOCK).returnBook(1, 8)
  assert.equal(bodyOf(worn.state), RETURNED)
})

test('a failed notice insert rolls the return back without committing', async () => {
  const { state, database } = returnFake({ failNotice: true })
  await assert.rejects(createCirculationService(database, () => CLOCK).returnBook(1, 8), /notice insert failed/)
  assert.equal(state.commits, 0); assert.equal(state.rollbacks, 1)
})

const deskBody = (over: Record<string, unknown> = {}) => ({ barcode: 'book-20', kind: 'TakeHome', expectedId: 8, requestId: 'req-0123456789abcdef', ...over })
const librarian = { accountId: 1, role: 'Librarian' }

test('a desk take-home return writes one notice carrying the recorded condition', async () => {
  const { state, database } = returnFake({ copyCondition: 'Damaged' })
  const result = await createDeskCirculationService(database, () => CLOCK).returnCopy(librarian, deskBody({ condition: 'Damaged', assessmentNote: 'Torn cover' }))
  assert.equal(result.status, 'Returned')
  assert.equal(state.notices.length, 1)
  assert.equal(state.notices[0][8], 'loan:8:returned'); assert.equal(bodyOf(state), `${RETURNED} Condition recorded: Damaged.`)
  assert.equal(state.commits, 1)
})

test('a replayed desk request adds no second notice', async () => {
  const { state, database } = returnFake()
  const desk = createDeskCirculationService(database, () => CLOCK)
  await desk.returnCopy(librarian, deskBody())
  const again = await desk.returnCopy(librarian, deskBody())
  assert.equal(again.replayed, true); assert.equal(state.notices.length, 1)
})

test('a desk return recorded as Lost is rejected before any notice', async () => {
  const { state, database } = returnFake()
  await assert.rejects(createDeskCirculationService(database, () => CLOCK).returnCopy(librarian, deskBody({ condition: 'Lost', assessmentNote: 'Missing' })), { code: 'DESK_LOST_INCIDENT' })
  assert.equal(state.notices.length, 0)
})

test('a failed notice insert leaves the desk return without a scan receipt', async () => {
  const { state, database } = returnFake({ failNotice: true })
  await assert.rejects(createDeskCirculationService(database, () => CLOCK).returnCopy(librarian, deskBody()), /notice insert failed/)
  assert.equal(state.rollbacks, 1); assert.equal(state.commits, 0); assert.equal(state.receipts.length, 0)
})

test('no notice parameter names the borrower or the desk librarian', async () => {
  const { state, database } = returnFake({ copyCondition: 'Damaged' })
  await createDeskCirculationService(database, () => CLOCK).returnCopy(librarian, deskBody({ condition: 'Damaged', assessmentNote: 'Torn cover' }))
  const text = JSON.stringify(state.notices)
  assert.ok(!text.includes('Zed Q. Borrower')); assert.ok(!text.includes('Libby Desk-Librarian')); assert.ok(!text.includes('Torn cover'))
})
