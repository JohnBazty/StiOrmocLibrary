import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { createTransactionsService, transactionFilters } from './transactions.service.ts'

test('transactions combine onsite receipts, filter and paginate without exposing another borrower', async t => {
  const pg = new PGlite(); t.after(() => pg.close())
  await pg.exec(`CREATE TABLE users(user_id bigint,account_status text);
    CREATE TABLE accounts(account_id bigint,user_id bigint,role text,account_status text);
    CREATE TABLE fine_payment_receipts(fine_payment_receipt_id bigint,user_id bigint,receipt_number text,payment_method text,receipt_status text,received_at timestamp,amount_received numeric);
    CREATE TABLE print_payment_receipts(print_receipt_id bigint,user_id bigint,receipt_number text,payment_method text,receipt_status text,received_at timestamp,amount_received numeric);
    INSERT INTO users VALUES(1,'Active'),(2,'Active');
    INSERT INTO accounts VALUES(7,1,'Student','Active'),(8,2,'Student','Active');
    INSERT INTO fine_payment_receipts VALUES(11,1,'FINE-11','Cash','Issued','2026-11-11 08:00',40),(99,2,'PRIVATE-99','Cash','Issued','2026-11-11 09:00',999);
    INSERT INTO print_payment_receipts VALUES(12,1,'PRINT-12','Cash','Issued','2026-11-11 10:00',50);`)
  const database = { execute: async (sql: string, values: unknown[] = []) => [(await pg.query(toPgPlaceholders(sql), values)).rows] } as never
  const service = createTransactionsService(database), actor = { accountId: 7, role: 'Student' }
  const result = await service.list(actor, { limit: 1 })
  assert.equal(result.pagination.total, 2); assert.equal(result.items[0].reference, 'PRINT-12')
  assert.equal(result.items[0].amountCentavos, 5000)
  assert.equal((await service.list(actor, { page: 2, limit: 1 })).items[0].reference, 'FINE-11')
  assert.equal((await service.list(actor, { channel: 'Online' })).items.length, 0)
  assert.equal((await service.list(actor, { search: 'FINE-11' })).pagination.total, 1)
  await assert.rejects(service.list({ accountId: 7, role: 'Staff' }, {}))
  for (const query of [{ page: 0 }, { channel: ['Online'] }, { search: ['x'] }, { limit: 500 }]) assert.throws(() => transactionFilters(query))
  await pg.exec(`ALTER TABLE fine_payment_receipts ADD COLUMN confirmation_source text, ADD COLUMN online_payment_attempt_id uuid;
    ALTER TABLE print_payment_receipts ADD COLUMN confirmation_source text, ADD COLUMN online_payment_attempt_id uuid;
    CREATE TABLE online_payment_attempts(payment_id uuid,account_id bigint,user_id bigint,print_request_id bigint,fine_id bigint,lost_book_report_id bigint,
      channel_code text,state text,created_at timestamptz,total_centavos bigint,principal_centavos bigint,fee_centavos bigint,balance_before_centavos bigint);
    INSERT INTO online_payment_attempts VALUES
      ('00000000-0000-4000-8000-000000000001',7,1,null,1,null,'GCASH','Succeeded','2026-11-12 08:00Z',4140,4000,140,10000),
      ('00000000-0000-4000-8000-000000000002',8,2,null,2,null,'GCASH','Active','2026-11-12 09:00Z',99900,99000,900,99000),
      ('00000000-0000-4000-8000-000000000003',7,2,null,2,null,'GCASH','Active','2026-11-12 09:00Z',99900,99000,900,99000);
    INSERT INTO fine_payment_receipts VALUES(13,1,'ONLINE-13','GCash','Issued','2026-11-12 08:01',40,'Xendit','00000000-0000-4000-8000-000000000001');`)
  const online = await service.list(actor, { channel: 'Online' })
  assert.equal(online.pagination.total, 1, 'Both account and linked borrower must own an online attempt')
  assert.equal(online.items[0].reference, 'ONLINE-13'); assert.equal(online.items[0].receiptId, 13)
  assert.equal(online.items[0].payment?.principalCentavos, 4000)
  assert.equal((await service.list(actor, {})).pagination.total, 3, 'Xendit receipt is not counted again as onsite')
  const preview = [{ id: 'Test:one', channel: 'Online', kind: 'Printing', description: 'Test checkout — bill remains unpaid', reference: 'Test ONE', method: 'QRPH', status: 'Cancelled', occurred_at: '2026-11-12T10:00:00Z', amount_centavos: 5150, principal_centavos: 5000, fee_centavos: 150, receipt_id: null, payment: { localPreview: true, state: 'Cancelled', receiptId: null } }]
  const combined = await service.list(actor, {}, preview)
  assert.equal(combined.pagination.total, 4); assert.equal(combined.items[0].payment?.localPreview, true)
  await pg.exec("UPDATE accounts SET account_status='Deactivated' WHERE account_id=7")
  await assert.rejects(service.list(actor, {}))
})
