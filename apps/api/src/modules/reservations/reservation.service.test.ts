import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createReservationService } from './reservation.service.ts'

function reservationPool(role: 'Student' | 'Faculty', activeCount: number, materialType = 'Book', activeBorrowStatus: string | null = null) {
  const state = { commits: 0, rollbacks: 0, releases: 0, inserted: false, activeCountQueried: false }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() { state.releases += 1 },
    async execute(sql: string) {
      if (sql.includes('FROM users u')) return [[{ user_id: 4, account_status: 'Active', role_name: role }]]
      if (sql.includes('FROM materials m LEFT JOIN physical_copies')) return [[{ material_id: 17, title_id: 9, title: 'Clean Code', isbn: '9780132350884', material_type: materialType }]]
      if (sql.includes('FROM physical_copies pc') && sql.includes("pc.lifecycle_status = 'Active'")) return [[
        { physical_copy_id: 31, material_id: 17, availability_status: 'Borrowed' },
        { physical_copy_id: 32, material_id: 18, availability_status: 'Reserved' },
      ]]
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('borrowed_material')) return [activeBorrowStatus ? [{ transaction_id: 71, transaction_status: activeBorrowStatus }] : []]
      if (sql.includes('SELECT r.reservation_id')) return [[]]
      if (sql.includes('COUNT(DISTINCT COALESCE(active.title_id')) { state.activeCountQueried = true; return [[{ active_count: activeCount }]] }
      if (sql.includes('MAX(r.queue_position)')) return [[{ next_position: 3 }]]
      if (sql.includes('INSERT INTO reservations')) { state.inserted = true; return [{ insertId: 501, affectedRows: 1 }] }
      if (sql.includes('INSERT INTO admin_notifications')) return [{ insertId: 900, affectedRows: 1 }]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

test('Student with two active books receives 422 and no third reservation insert', async () => {
  const { state, database } = reservationPool('Student', 2)
  await assert.rejects(createReservationService(database).create(4, { materialId: 17 }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'STUDENT_BORROW_LIMIT_REACHED')
    assert.equal(error.message, 'Transaction Blocked: Students cannot exceed 2 books')
    return true
  })
  assert.equal(state.inserted, false)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})

test('Faculty with ten or more active books bypasses the cap and creates a reservation', async () => {
  const { state, database } = reservationPool('Faculty', 12)
  const result = await createReservationService(database).create(4, { materialId: 17 })
  assert.equal(result.reservationId, 501)
  assert.equal(result.status, 'pending')
  assert.equal(state.activeCountQueried, false)
  assert.equal(state.inserted, true)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
})

test('borrower cannot reserve the same title already held in a pending or active transaction', async () => {
  for (const status of ['Pending', 'Borrowed', 'Overdue']) {
    const { state, database } = reservationPool('Student', 1, 'Book', status)
    await assert.rejects(createReservationService(database).create(4, { materialId: 17 }), (error: unknown) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.status, 422)
      assert.equal(error.code, 'BOOK_ALREADY_IN_ACCOUNT')
      assert.match(error.message, status === 'Pending' ? /already checked out/i : /already borrowed/i)
      return true
    })
    assert.equal(state.inserted, false)
    assert.equal(state.commits, 0)
    assert.equal(state.rollbacks, 1)
  }
})

test('administrator cannot approve a legacy queue row when the user already has the same book', async () => {
  const state = { commits: 0, rollbacks: 0, statusUpdates: 0 }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string) {
      if (sql.includes('SELECT r.*, m.title')) return [[{
        reservation_id: 501, user_id: 4, reservation_status: 'pending', resolved_title_id: 9,
        title: 'Clean Code', isbn: '9780132350884', material_type: 'Book', queue_position: 1,
      }]]
      if (sql.includes('FROM borrow_transactions bt') && sql.includes('borrowed_material')) {
        return [[{ transaction_id: 71, transaction_status: 'Borrowed' }]]
      }
      if (sql.startsWith('UPDATE reservations')) { state.statusUpdates += 1; return [{ affectedRows: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  await assert.rejects(
    createReservationService({ getConnection: async () => connection } as unknown as Pool)
      .adjustStatus(1, 501, { status: 'approved' }),
    (error: unknown) => error instanceof HttpError && error.status === 422 && error.code === 'BOOK_ALREADY_IN_ACCOUNT',
  )
  assert.equal(state.statusUpdates, 0)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})

test('research and thesis compatibility materials are rejected as view only', async () => {
  const { state, database } = reservationPool('Faculty', 0, 'Thesis/Manuscript')
  await assert.rejects(createReservationService(database).create(4, { materialId: 17 }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'RESEARCH_VIEW_ONLY')
    return true
  })
  assert.equal(state.inserted, false)
  assert.equal(state.rollbacks, 1)
})

test('student reservation listing exposes the normalized title cover path', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 4 }]]
      if (sql.includes('FROM reservations r INNER JOIN materials')) return [[{
        reservation_id: 501, title: 'Clean Code', cover_image_path: '/api/assets/covers/clean-code.png',
        queue_position: 1, reservation_status: 'approved', reserved_at: new Date('2026-08-24T08:00:00+08:00'),
        pickup_deadline: null, accession_number: null, barcode: null, condition_status: 'Damaged',
      }]]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  } as unknown as Pool

  const result = await createReservationService(database).listForAccount(1)
  assert.equal(result[0].coverImagePath, '/api/assets/covers/clean-code.png')
  assert.equal(result[0].conditionStatus, 'Damaged')
})
