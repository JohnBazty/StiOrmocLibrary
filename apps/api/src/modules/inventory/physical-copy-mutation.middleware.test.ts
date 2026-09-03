import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import {
  createPhysicalCopyMutationGuard,
  getPhysicalCopyMutationTransaction,
  rollbackPhysicalCopyMutation,
} from './physical-copy-mutation.middleware.ts'

function fakeResponse() {
  const response = new EventEmitter() as EventEmitter & { locals: Record<string, unknown> }
  response.locals = {}
  return response
}

function fakeDatabase(activeLoan: Record<string, unknown> | null, activeReservation: Record<string, unknown> | null = null) {
  const state = { began: 0, rolledBack: 0, released: 0, queryCount: 0 }
  const connection = {
    async beginTransaction() { state.began += 1 },
    async rollback() { state.rolledBack += 1 },
    release() { state.released += 1 },
    async execute() {
      state.queryCount += 1
      if (state.queryCount === 1) {
        return [[{
          physical_copy_id: 7,
          material_id: 42,
          accession_number: 'ACC-00042',
          barcode: 'BC-00042',
          circulation_material_id: 42,
          lifecycle_status: 'Active',
          availability_status: 'Available',
          title: 'Database Systems',
        }]]
      }
      if (state.queryCount === 2) return [activeLoan ? [activeLoan] : []]
      return [activeReservation ? [activeReservation] : []]
    },
  }
  return {
    state,
    database: { async getConnection() { return connection } } as unknown as Pool,
  }
}

test('blocks archive with descriptive 422 when a copy is borrowed', async () => {
  const { database, state } = fakeDatabase({
    transaction_id: 1048,
    transaction_status: 'Borrowed',
    borrowed_at: new Date('2026-08-15T08:00:00+08:00'),
    due_at: new Date('2026-08-16T08:59:00+08:00'),
  })
  const guard = createPhysicalCopyMutationGuard(database)('archive')
  const response = fakeResponse()
  let receivedError: unknown

  await guard(
    { params: { copyId: '7' } } as never,
    response as never,
    (error?: unknown) => { receivedError = error },
  )

  assert.ok(receivedError instanceof HttpError)
  assert.equal(receivedError.status, 422)
  assert.equal(receivedError.code, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN')
  assert.match(receivedError.message, /currently borrowed/i)
  assert.equal(receivedError.details?.transactionId, 1048)
  assert.equal(state.began, 1)
  assert.equal(state.rolledBack, 1)
  assert.equal(state.released, 1)
  assert.equal(state.queryCount, 2, 'the protected mutation must stop before reservation or mutation statements')
})

test('blocks delete when the active borrowing record is overdue', async () => {
  const { database } = fakeDatabase({
    transaction_id: 1047,
    transaction_status: 'Overdue',
    borrowed_at: new Date('2026-08-13T08:00:00+08:00'),
    due_at: new Date('2026-08-14T08:59:00+08:00'),
  })
  const guard = createPhysicalCopyMutationGuard(database)('delete')
  const response = fakeResponse()
  let receivedError: unknown

  await guard(
    { params: { copyId: '7' } } as never,
    response as never,
    (error?: unknown) => { receivedError = error },
  )

  assert.ok(receivedError instanceof HttpError)
  assert.equal(receivedError.status, 422)
  assert.match(receivedError.message, /currently overdue/i)
})

test('keeps the transaction open for an eligible downstream mutation', async () => {
  const { database, state } = fakeDatabase(null)
  const guard = createPhysicalCopyMutationGuard(database)('archive')
  const response = fakeResponse()
  let nextCalled = false

  await guard(
    { params: { copyId: '7' } } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error
      nextCalled = true
    },
  )

  assert.equal(nextCalled, true)
  const transaction = getPhysicalCopyMutationTransaction(response as never)
  assert.equal(transaction.copy.physical_copy_id, 7)
  assert.equal(state.rolledBack, 0)
  assert.equal(state.queryCount, 3, 'eligible mutations lock both active loans and reservations')

  await rollbackPhysicalCopyMutation(transaction)
  assert.equal(state.rolledBack, 1)
  assert.equal(state.released, 1)
})

test('blocks delete when the copy has an active reservation', async () => {
  const { database, state } = fakeDatabase(null, {
    reservation_id: 55,
    reservation_status: 'ready_for_pickup',
  })
  const guard = createPhysicalCopyMutationGuard(database)('delete')
  const response = fakeResponse()
  let receivedError: unknown

  await guard(
    { params: { copyId: '7' } } as never,
    response as never,
    (error?: unknown) => { receivedError = error },
  )

  assert.ok(receivedError instanceof HttpError)
  assert.equal(receivedError.status, 422)
  assert.equal(receivedError.code, 'PHYSICAL_COPY_HAS_ACTIVE_RESERVATION')
  assert.equal(receivedError.details?.reservationId, 55)
  assert.equal(state.rolledBack, 1)
  assert.equal(state.queryCount, 3)
})
