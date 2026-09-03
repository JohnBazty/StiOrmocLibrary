import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createCirculationService } from './circulation.service.ts'

function cartPool(role: 'Student' | 'Faculty', activeCount: number, firstCondition = 'Good', waitingReservation = false) {
  const state = { commits: 0, rollbacks: 0, inserts: 0, copiesReserved: 0, materialsReserved: 0, adminAlerts: 0 }
  const copies = [
    { title_id: 10, title: 'Database Systems', physical_copy_id: 100, material_id: 200, accession_number: 'ACC-100', barcode: 'BC-100', condition_status: firstCondition, availability_status: 'Available', lifecycle_status: 'Active', material_type: 'Book' },
    { title_id: 11, title: 'Computer Networks', physical_copy_id: 101, material_id: 201, accession_number: 'ACC-101', barcode: 'BC-101', condition_status: 'Fair', availability_status: 'Available', lifecycle_status: 'Active', material_type: 'Book' },
  ]
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string) {
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 7 }]]
      if (sql.includes('FROM users u INNER JOIN roles')) return [[{ user_id: 7, full_name: 'Library User', institutional_id: 'STI-7', school_id: 'STI-7', role_name: role, account_status: 'Active' }]]
      if (sql.includes('COUNT(DISTINCT activity.title_id)')) return [[{ active_count: activeCount, requested_active_count: 0 }]]
      if (sql.includes('FROM titles t') && sql.includes('FOR UPDATE')) return [copies]
      if (sql.includes('FROM reservations r INNER JOIN titles t')) return [waitingReservation ? [{
        reservation_id: 88, book_title_id: 10, user_id: 99, queue_position: 1,
        reservation_status: 'approved', title: 'Database Systems',
      }] : []]
      if (sql.includes('assigned_physical_copy_id IN')) return [[]]
      if (sql.includes('INSERT INTO borrow_transactions')) { state.inserts += 1; return [{ insertId: 500 + state.inserts, affectedRows: 1 }] }
      if (sql.includes('UPDATE physical_copies')) { state.copiesReserved += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE materials')) { state.materialsReserved += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO admin_notifications')) { state.adminAlerts += 1; return [{ insertId: 1, affectedRows: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

test('student with one active commitment cannot submit two additional cart items', async () => {
  const { state, database } = cartPool('Student', 1)
  await assert.rejects(
    createCirculationService(database).submitBorrowRequest(9, { title_ids: [10, 11] }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.status, 422)
      assert.equal(error.code, 'STUDENT_BORROW_LIMIT_REACHED')
      assert.deepEqual(error.details, { activeCount: 1, incomingCount: 2, projectedCount: 3, limit: 2 })
      return true
    },
  )
  assert.equal(state.inserts, 0)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})

test('faculty with three active commitments can submit two more books atomically', async () => {
  const { state, database } = cartPool('Faculty', 3)
  const result = await createCirculationService(database).submitBorrowRequest(9, { title_ids: [10, 11] })
  assert.equal(result.status, 'pending_claim')
  assert.equal(result.items.length, 2)
  assert.match(result.requestGroupId, /^[0-9a-f-]{36}$/)
  assert.equal(state.inserts, 2)
  assert.equal(state.copiesReserved, 2)
  assert.equal(state.materialsReserved, 2)
  assert.equal(state.adminAlerts, 1)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
})

test('an available damaged copy can still be added to a borrow request', async () => {
  const { state, database } = cartPool('Student', 0, 'Damaged')
  const result = await createCirculationService(database).submitBorrowRequest(9, { title_ids: [10] })
  assert.equal(result.status, 'pending_claim')
  assert.equal(result.items.length, 1)
  assert.equal(state.inserts, 1)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
})

test('an active title waitlist blocks a later online cart before a pending claim is inserted', async () => {
  const { state, database } = cartPool('Student', 0, 'Good', true)
  await assert.rejects(
    createCirculationService(database).submitBorrowRequest(9, { title_ids: [10] }),
    (error: unknown) => error instanceof HttpError
      && error.status === 422
      && error.code === 'CART_TITLE_RESERVED_FOR_QUEUE'
      && /Database Systems/.test(error.message),
  )
  assert.equal(state.inserts, 0)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})
