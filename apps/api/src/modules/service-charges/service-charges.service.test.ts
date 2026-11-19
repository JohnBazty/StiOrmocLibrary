import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { createServiceChargesService } from './service-charges.service.ts'

async function fixture() {
  const pg = new PGlite()
  try { await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE users(user_id bigint PRIMARY KEY,school_id text,full_name text,user_role text,account_status text);
    CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint REFERENCES users,role text,account_status text);
    CREATE TABLE print_requests(request_id bigint PRIMARY KEY);
    CREATE TABLE print_cash_payments(print_cash_payment_id bigint PRIMARY KEY,request_id bigint UNIQUE,received_at timestamp);
    CREATE TABLE print_payment_receipts(print_receipt_id bigint PRIMARY KEY,request_id bigint UNIQUE,receipt_status text,amount_received numeric(10,2));
    INSERT INTO users VALUES(1,'QA-001','User One','Student','Active'),(2,'QA-002','Library User','Librarian','Active'),
      (3,'QA-003','User Three','Student','Active'),(4,'QA-004','Desk User','Staff','Active');
    INSERT INTO accounts VALUES(1,1,'Student','Active'),(2,2,'Librarian','Active'),(3,3,'Student','Active'),(4,4,'Staff','Active');`)
  await pg.exec(await readFile(new URL('../../../../../database/supabase/055_printing_receivables_and_payment_review.sql', import.meta.url), 'utf8'))
  } catch(cause) { await pg.close(); throw cause }
  const execute = async (sql: string, values: readonly unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), [...values])
    return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
      ? [{ insertId: Number(Object.values(result.rows[0] ?? {})[0] ?? 0), rows: result.rows, affectedRows: result.affectedRows ?? 0 }, result]
      : [result.rows, result]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
  const pool = { execute, getConnection: async () => connection } as unknown as Pool
  return { pg, service: createServiceChargesService(pool) }
}

test('Other charges retain one assessment, partial cash receipts, exact balances and safe retries', async t => {
  const { pg, service } = await fixture(); t.after(() => pg.close())
  const staff = { accountId: 2 }, desk = { accountId: 4 }, owner = { accountId: 1 }
  const creation = { school_id: 'QA-001', description: 'Binding service', amount: '100.00', request_key: randomUUID() }
  const charge = await service.create(staff, creation)
  assert.equal(charge.balance, 100)
  assert.equal(charge.status, 'Unpaid')
  assert.equal((await service.create(staff, creation)).chargeId, charge.chargeId)
  await assert.rejects(service.create(staff, { ...creation, amount: '120.00' }), { code: 'SERVICE_CHARGE_RETRY_CHANGED' })
  await assert.rejects(service.create(owner, { ...creation, request_key: randomUUID() }), { status: 403 })
  await assert.rejects(service.create(desk, { ...creation, request_key: randomUUID() }), { status: 403 })
  const first = { amount_paid: '40', request_key: randomUUID() }
  const receipt = await service.recordCash(desk, charge.chargeId, first)
  assert.equal(receipt.amountPaid, 40)
  assert.equal(receipt.balanceBefore, 100)
  assert.equal(receipt.balanceAfter, 60)
  assert.equal((await service.recordCash(desk, charge.chargeId, first)).receiptNumber, receipt.receiptNumber)
  await assert.rejects(service.recordCash(desk, charge.chargeId, { ...first, amount_paid: '50' }), { code: 'SERVICE_CHARGE_RETRY_CHANGED' })
  await assert.rejects(service.recordCash(owner, charge.chargeId, { amount_paid: '60', request_key: randomUUID() }), { status: 403 })
  await assert.rejects(service.recordCash(desk, charge.chargeId, { amount_paid: '60.01', request_key: randomUUID() }), { code: 'SERVICE_CHARGE_OVERPAYMENT' })
  await assert.rejects(service.recordCash(desk, charge.chargeId, { amount_paid: '0', request_key: randomUUID() }), { status: 422 })
  await assert.rejects(service.cancel(staff, charge.chargeId, { version: 2, reason: 'Requested cancellation' }), { code: 'SERVICE_CHARGE_HAS_PAYMENTS' })
  const own = await service.own(owner)
  assert.equal(own.rows[0].status, 'Partially paid')
  assert.equal(own.rows[0].paid, 40)
  assert.equal(own.rows[0].balance, 60)
  assert.equal(own.rows[0].receipts.length, 1)
  assert.deepEqual((await service.own({ accountId: 3 })).rows, [])
  await assert.rejects(service.receipt({ accountId: 3 }, receipt.servicePaymentId), { status: 404 })
  assert.equal((await service.receipt(owner, receipt.servicePaymentId)).amountPaid, 40)
  const second = await service.recordCash(desk, charge.chargeId, { amount_paid: '60', request_key: randomUUID() })
  assert.equal(second.balanceAfter, 0)
  const final = (await service.own(owner)).rows[0]
  assert.equal(final.status, 'Paid'); assert.equal(final.paid, 100); assert.equal(final.balance, 0)
  assert.equal(final.receipts.length, 2)
  await assert.rejects(service.recordCash(desk, charge.chargeId, { amount_paid: '1', request_key: randomUUID() }), { code: 'SERVICE_CHARGE_OVERPAYMENT' })
  const sums = await pg.query<{ amount: string }>(`SELECT sum(amount_paid)::text amount FROM library_service_cash_payments WHERE receipt_status='Issued'`)
  assert.equal(sums.rows[0].amount, '100.00')
})

test('Other charge cancellation is versioned, reasoned and never accepts payment afterwards', async t => {
  const { pg, service } = await fixture(); t.after(() => pg.close())
  const staff = { accountId: 2 }
  const charge = await service.create(staff, { school_id: 'QA-001', description: 'Document binding', amount: '1234567.89', request_key: randomUUID() })
  assert.equal(charge.balance, 1234567.89, 'No invented account balance cap')
  await assert.rejects(service.cancel(staff, charge.chargeId, { version: 2, reason: 'Incorrect assessment' }), { code: 'SERVICE_CHARGE_CHANGED' })
  await assert.rejects(service.cancel(staff, charge.chargeId, { version: 1, reason: '' }), { status: 422 })
  const cancelled = await service.cancel(staff, charge.chargeId, { version: 1, reason: 'Incorrect assessment' })
  assert.equal(cancelled.status, 'Cancelled'); assert.equal(cancelled.balance, 0)
  await assert.rejects(service.recordCash(staff, charge.chargeId, { amount_paid: '1', request_key: randomUUID() }), { code: 'SERVICE_CHARGE_CANCELLED' })
  const audit = await pg.query(`SELECT cancelled_by_user_id,cancellation_reason,version FROM library_service_charges`)
  assert.deepEqual(audit.rows, [{ cancelled_by_user_id: 2, cancellation_reason: 'Incorrect assessment', version: 2 }])
})
