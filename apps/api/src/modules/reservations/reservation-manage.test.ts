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

type QueueRow = { id: number; pos: number; status?: string; copy?: number | null }
function queuePool(rows: QueueRow[], targetId: number) {
  const pool = fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) { const r = rows.find((x) => x.id === targetId)!; return [{ ...held, reservation_id: r.id, reservation_status: r.status ?? 'pending', assigned_physical_copy_id: r.copy ?? null, queue_position: r.pos }] }
    if (sql.includes('SELECT reservation_id,queue_position')) return rows.map((r) => ({ reservation_id: r.id, queue_position: r.pos, reservation_status: r.status ?? 'pending', assigned_physical_copy_id: r.copy ?? null }))
    return undefined
  })
  const positions = () => Object.fromEntries(pool.calls.filter((c) => c.sql.includes('SET queue_position=?')).map((c) => [c.params[1], c.params[0]]))
  return { pool, positions }
}
const move = (pool: ReturnType<typeof fakePool>, id: number, body: unknown) => createReservationService(pool.database).moveInQueue(1, id, body)
const three = [{ id: 1, pos: 1 }, { id: 2, pos: 2 }, { id: 3, pos: 3 }]

test('move up swaps with the request above and renumbers 1..n with an audit reason', async () => {
  const { pool, positions } = queuePool(three, 2)
  await move(pool, 2, { direction: 'up', reason: '  Faculty urgent need  ' })
  assert.deepEqual(positions(), { 2: 1, 1: 2 })
  const audit = pool.calls.find((c) => c.sql.includes('INSERT INTO reservation_audit_events'))!
  assert.deepEqual(audit.params, [2, 2, 1, 'Faculty urgent need', 1])
  assert.ok(audit.params.includes('Faculty urgent need'))
})
test('move down swaps with the request below', async () => {
  const { pool, positions } = queuePool(three, 2)
  await move(pool, 2, { direction: 'down', reason: 'Requested by the dean' })
  assert.deepEqual(positions(), { 2: 3, 3: 2 })
})
test('positions with gaps are renumbered to 1..n', async () => {
  const { pool, positions } = queuePool([{ id: 1, pos: 1 }, { id: 2, pos: 4 }, { id: 3, pos: 9 }], 3)
  await move(pool, 3, { direction: 'up', reason: 'Fix the order please' })
  assert.deepEqual(positions(), { 3: 2, 2: 3 })
})
test('the top request cannot move up', async () => {
  const { pool } = queuePool(three, 1)
  await rejects(move(pool, 1, { direction: 'up', reason: 'No change possible' }), 422, 'QUEUE_MOVE_NOOP')
})
test('the last request cannot move down', async () => {
  const { pool } = queuePool(three, 3)
  await rejects(move(pool, 3, { direction: 'down', reason: 'No change possible' }), 422, 'QUEUE_MOVE_NOOP')
})
test('a request cannot move above one that already has a copy', async () => {
  const { pool } = queuePool([{ id: 1, pos: 1, status: 'approved', copy: 31 }, { id: 2, pos: 2 }], 2)
  await rejects(move(pool, 2, { direction: 'up', reason: 'Jump the line' }), 422, 'QUEUE_MOVE_ABOVE_ASSIGNED')
})
test('only pending requests can move', async () => {
  const { pool } = queuePool([{ id: 1, pos: 1, status: 'approved', copy: 31 }, { id: 2, pos: 2 }], 1)
  await rejects(move(pool, 1, { direction: 'down', reason: 'Move the held one' }), 422, 'QUEUE_MOVE_NOT_PENDING')
})
test('a short or oversized reason is rejected before any write', async () => {
  const { pool, positions } = queuePool(three, 2)
  await rejects(move(pool, 2, { direction: 'up', reason: ' ab ' }), 422)
  await rejects(move(pool, 2, { direction: 'up', reason: 'x'.repeat(501) }), 422)
  await rejects(move(pool, 2, { direction: 'sideways', reason: 'valid reason' }), 422)
  assert.deepEqual(positions(), {})
})

function app(role: string) {
  const service = createReservationService(swapPool().database)
  const a = express(); a.use(express.json())
  a.use((req, _res, next) => { Object.defineProperty(req, 'session', { configurable: true, value: { user: { id: 7, role } } }); next() })
  a.use('/api/reservations', createReservationsRouter(createReservationController(service as never)))
  a.use((e: unknown, _q: express.Request, res: express.Response, _n: express.NextFunction) => res.status(e instanceof HttpError ? e.status : 500).json({ code: (e as HttpError).code }))
  return a
}
test('students and faculty get 403 on swap, move and swap candidates', async () => {
  for (const role of ['Student', 'Faculty']) {
    assert.equal((await request(app(role)).post('/api/reservations/501/swap-copy').send({ physicalCopyId: 32 })).status, 403)
    assert.equal((await request(app(role)).post('/api/reservations/501/move').send({ direction: 'up', reason: 'valid reason' })).status, 403)
    assert.equal((await request(app(role)).get('/api/reservations/501/swap-candidates')).status, 403)
  }
})
test('a librarian can swap through the route', async () => {
  const res = await request(app('Librarian')).post('/api/reservations/501/swap-copy').send({ physicalCopyId: 32 })
  assert.equal(res.status, 200)
})
