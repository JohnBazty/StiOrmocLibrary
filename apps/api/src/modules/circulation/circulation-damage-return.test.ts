import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createDeskCirculationService } from './desk-circulation.service.ts'

/** Fake desk connection for a take-home return of BOOK-20 (loan 8, borrower 7, desk staff account 3 / user 2). */
function deskDatabase(failCaseInsert = false) {
  const state = { commits: 0, rollbacks: 0, caseInserts: [] as unknown[][], allocations: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('SELECT cc.* FROM circulation_cases cc')) return [[]]
      if (sql.includes('library_profile_settings')) return [[{ settings_id: 1 }]]
      if (sql.includes('SELECT account_id FROM accounts')) return [[{ account_id: 3 }]]
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 2 }]]
      if (sql.includes('FROM circulation_scan_receipts')) return [[]]
      if (sql.includes('SELECT pc.*,t.title')) return [[{ physical_copy_id: 20, material_id: 30, title_id: 10, barcode: 'BOOK-20', condition_status: 'Good', availability_status: 'Borrowed', title: 'Clean Code' }]]
      if (sql.includes('FROM in_library_uses')) return [[]]
      if (sql.includes('JOIN users u ON u.user_id=bt.user_id')) return [[{ transaction_id: 8, user_id: 7, transaction_status: 'Borrowed', full_name: 'Borrower', school_id: 'STI-7' }]]
      if (sql.includes('FROM borrow_transactions bt')) return [[{ transaction_id: 8, user_id: 7, material_id: 30, physical_copy_id: 20, due_at: null, transaction_status: 'Borrowed', title_id: 10, condition_status: 'Damaged', title: 'Clean Code' }]]
      if (sql.includes('SELECT availability_status FROM physical_copies')) return [[{ availability_status: 'Unavailable' }]]
      if (sql.includes('SELECT reservation_id FROM reservations WHERE assigned_physical_copy_id=')) return [[]]
      if (sql.includes('FROM reservations')) { state.allocations += 1; return [[]] }
      if (sql.includes('INSERT INTO circulation_cases')) {
        if (failCaseInsert) throw new Error('database down')
        state.caseInserts.push(values); return [{ insertId: 55, affectedRows: 1 }]
      }
      if (/^\s*(INSERT|UPDATE)/i.test(sql)) return [{ insertId: 1, affectedRows: 1 }]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

const staff = { accountId: 3, role: 'Staff' }
const damagedReturn = { barcode: 'BOOK-20', kind: 'TakeHome', expectedId: 8, requestId: 'req-damage-0000001', condition: 'Damaged', assessmentNote: 'Cover torn off.' }

test('a take-home return marked Damaged opens a damage case in the same transaction and keeps the copy off the queue', async () => {
  const { state, database } = deskDatabase()
  const result = await createDeskCirculationService(database).returnCopy(staff, damagedReturn)
  assert.equal(result.damageCaseId, 55)
  assert.equal(result.assessmentNeeded, true)
  assert.equal(state.caseInserts.length, 1)
  const [transactionId, copyId, borrowerId, description, , actorUserId, baseline, observed] = state.caseInserts[0]
  assert.deepEqual({ transactionId, copyId, borrowerId, description, actorUserId, baseline, observed },
    { transactionId: 8, copyId: 20, borrowerId: 7, description: 'Cover torn off.', actorUserId: 2, baseline: 'Good', observed: 'Damaged' })
  assert.equal(state.allocations, 0, 'a damaged copy is never offered to the waiting queue')
  assert.equal(state.commits, 1); assert.equal(state.rollbacks, 0)
})

test('a take-home return in Worn or unchanged condition opens no case', async () => {
  for (const extra of [{ condition: 'Worn', assessmentNote: 'Some wear' }, { condition: null, assessmentNote: '' }]) {
    const { state, database } = deskDatabase()
    const result = await createDeskCirculationService(database).returnCopy(staff, { ...damagedReturn, ...extra, requestId: 'req-plain-00000001' })
    assert.equal(result.damageCaseId, null)
    assert.equal(state.caseInserts.length, 0)
  }
})

test('if the damage case cannot be opened, the whole return rolls back', async () => {
  const { state, database } = deskDatabase(true)
  await assert.rejects(createDeskCirculationService(database).returnCopy(staff, damagedReturn), /database down/)
  assert.equal(state.commits, 0); assert.equal(state.rollbacks, 1)
})
