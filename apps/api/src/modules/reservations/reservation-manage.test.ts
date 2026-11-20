import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createReservationService } from './reservation.service.ts'
import { createReservationController } from './reservation.controller.ts'
import { createReservationsRouter } from './reservations.routes.ts'
import { fakePool } from './book-request.test-helpers.ts'

const staff = [{ user_id: 1, role: 'Librarian', account_status: 'Active' }]
const held = { reservation_id: 501, user_id: 4, material_id: 17, book_title_id: 9, reservation_status: 'approved', request_kind: 'Reservation', queue_position: 1, assigned_physical_copy_id: 31, accession_id: 17, pickup_deadline: null }

function swapPool(over: { reservation?: object; target?: object; heldBy?: object[]; spare?: boolean } = {}) {
  return fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) return [{ ...held, ...over.reservation }]
    if (sql.includes('SELECT physical_copy_id,title_id,material_id FROM physical_copies')) return [{ physical_copy_id: 32, title_id: 9, material_id: 18, ...over.target }]
    if (sql.includes('assigned_physical_copy_id=? AND reservation_status IN')) return over.heldBy ?? []
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return over.spare === false ? [] : [{ physical_copy_id: 32, material_id: 18 }]
    return undefined
  })
}
const swap = (pool: ReturnType<typeof swapPool>, body: unknown = { physicalCopyId: 32 }) => createReservationService(pool.database).swapCopy(1, 501, body)
const rejects = (p: Promise<unknown>, status: number, code?: string) => assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code))

test('swap moves the hold to another copy, keeps the deadline and writes an audit row', async () => {
  const pool = swapPool()
  await swap(pool)
  const update = pool.calls.find((c) => c.sql.includes('UPDATE reservations SET accession_id=?'))!
  assert.deepEqual(update.params, [18, 32, 501])
  assert.doesNotMatch(update.sql, /pickup_deadline/)
  assert.ok(pool.calls.some((c) => c.sql.includes("UPDATE physical_copies SET availability_status='Reserved'") && c.params[0] === 32))
  assert.ok(pool.calls.some((c) => c.sql.includes('UPDATE physical_copies SET availability_status=CASE') && c.params[0] === 31))
  const audit = pool.calls.find((c) => c.sql.includes('INSERT INTO reservation_audit_events'))!
  assert.deepEqual(audit.params, [501, 31, 32, 1])
  assert.equal(pool.state.commits, 1)
})
test('swap rejects a copy of another title with 422', async () => {
  const pool = swapPool({ target: { title_id: 10 } })
  await rejects(swap(pool), 422, 'SWAP_COPY_WRONG_TITLE')
  assert.equal(pool.state.rollbacks, 1)
})
test('swap rejects a copy someone else holds with 409', async () => {
  await rejects(swap(swapPool({ heldBy: [{ reservation_id: 600 }] })), 409, 'SWAP_COPY_HELD')
})
test('swap rejects a copy that is not available with 422', async () => {
  await rejects(swap(swapPool({ spare: false })), 422, 'SWAP_COPY_UNAVAILABLE')
})
test('swap rejects a pending reservation with 422', async () => {
  await rejects(swap(swapPool({ reservation: { reservation_status: 'pending', assigned_physical_copy_id: null } })), 422, 'SWAP_NOT_ALLOWED')
})
test('swap rejects an invalid copy id', async () => {
  await rejects(swap(swapPool(), {}), 422)
})


function app(role: string) {
  const service = createReservationService(swapPool().database)
  const a = express(); a.use(express.json())
  a.use((req, _res, next) => { Object.defineProperty(req, 'session', { configurable: true, value: { user: { id: 7, role } } }); next() })
  a.use('/api/reservations', createReservationsRouter(createReservationController(service as never)))
  a.use((e: unknown, _q: express.Request, res: express.Response, _n: express.NextFunction) => res.status(e instanceof HttpError ? e.status : 500).json({ code: (e as HttpError).code }))
  return a
}
test('students and faculty get 403 on swap and swap candidates', async () => {
  for (const role of ['Student', 'Faculty']) {
    assert.equal((await request(app(role)).post('/api/reservations/501/swap-copy').send({ physicalCopyId: 32 })).status, 403)
    assert.equal((await request(app(role)).get('/api/reservations/501/swap-candidates')).status, 403)
  }
})
test('the queue is first come, first served: there is no move route and no move service', async () => {
  const res = await request(app('Librarian')).post('/api/reservations/501/move').send({ direction: 'up', reason: 'valid reason' })
  assert.equal(res.status, 404)
  assert.equal('moveInQueue' in createReservationService(fakePool(() => undefined).database), false)
})
test('a librarian can swap through the route', async () => {
  const res = await request(app('Librarian')).post('/api/reservations/501/swap-copy').send({ physicalCopyId: 32 })
  assert.equal(res.status, 200)
})
