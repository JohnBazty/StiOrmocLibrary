import assert from 'node:assert/strict'
import type { Pool } from 'mysql2/promise'
import { db, dbDriver } from '../src/config/db.js'
import { extendedPrintingReports } from '../src/modules/printing/printing-extended-reports.ts'
import { revenueSnapshot } from '../src/modules/printing/printing-revenue.ts'
import { parseFinanceFilters } from '../src/modules/printing/printing.validation.ts'

// Only connection-private temporary tables receive synthetic rows. Rollback removes
// every fixture; no migration or school record is changed.
assert.equal(dbDriver,'postgres','Requires configured PostgreSQL')
const connection = await db.getConnection()
try {
  await connection.beginTransaction()
  await connection.execute("SET LOCAL statement_timeout='15s'")
  const definitions = [
    'users(user_id int,full_name text,school_id text)',
    'print_requests(request_id int,user_id int,file_name text,print_type text,paper_size text,page_count int,number_of_copies int,total_sheets int)',
    'print_cash_payments(print_cash_payment_id int,request_id int,amount_paid numeric,received_at timestamp,received_by_user_id int)',
    'print_payment_receipts(print_receipt_id int,request_id int,print_cash_payment_id int,receipt_status text,student_name_snapshot text,school_id_snapshot text,file_name_snapshot text,print_type_snapshot text,paper_size_snapshot text,page_count_snapshot int,copies_snapshot int,total_sheets_snapshot int,amount_received numeric,received_at timestamp,received_by_name_snapshot text,payment_method text)',
    'historical_print_entries(entry_id int,user_id int,customer_name text,description text,print_type text,paper_size text,pages int,copies int,amount_paid numeric,received_at timestamptz,payment_method text,state text,payment_state text)',
  ]
  for (const definition of definitions) await connection.execute(`CREATE TEMP TABLE ${definition} ON COMMIT DROP`)
  await connection.execute("INSERT INTO users VALUES (1,'Fixture payer','QA'),(2,'Fixture librarian','QA-STAFF')")
  await connection.execute("INSERT INTO print_requests SELECT n,1,'fixture.pdf','Monochrome','A4',2,1,2 FROM generate_series(1,4) n")
  await connection.execute("INSERT INTO print_cash_payments VALUES (1,1,20,'2026-11-18 08:00',2),(2,2,30,'2026-11-18 09:00',2),(3,3,40,'2026-11-18 10:00',2)")
  await connection.execute(`INSERT INTO print_payment_receipts VALUES
    (1,1,1,'Issued','Cash payer','QA','cash.pdf','Monochrome','A4',2,1,2,20,'2026-11-18 08:00','Librarian','Cash'),
    (2,3,3,'Reversed','Reversed payer','QA','reversed.pdf','Monochrome','A4',2,1,2,40,'2026-11-18 10:00','Librarian','Cash')`)
  await connection.execute(`INSERT INTO historical_print_entries VALUES
    (1,NULL,'Past payer','history','Monochrome','A4',NULL,NULL,5,'2026-11-18 00:00+08','Cash','Active','Confirmed'),
    (2,NULL,'Unpaid','unpaid','Monochrome','A4',2,1,0,NULL,NULL,'Active','Unpaid'),
    (3,NULL,'Voided','void','Monochrome','A4',2,1,100,'2026-11-18 12:00+08','Cash','Voided','Confirmed'),
    (4,NULL,'Next day','next','Monochrome','A4',2,1,100,'2026-11-19 00:00+08','Cash','Active','Confirmed')`)
  const reports = extendedPrintingReports(connection as unknown as Pool)
  const filters = parseFinanceFilters({period:'daily',date:'2026-11-18'})
  const before = await reports.revenueSummary(filters)
  assert.equal(before.total_revenue,55,'Cash receipt plus legacy cash plus confirmed history, without duplicates/reversals')
  assert.equal(before.paid_requests,3)
  // Simulate the receipt written by verified gateway settlement, not a browser return.
  await connection.execute(`INSERT INTO print_payment_receipts VALUES
    (3,4,NULL,'Issued','Online payer','QA','online.pdf','Monochrome','A4',2,1,2,60,'2026-11-18 23:59:59','Xendit','GCASH')`)
  await connection.execute('ALTER TABLE pg_temp.print_payment_receipts ADD COLUMN total_received numeric, ADD COLUMN transaction_fee_centavos bigint')
  await connection.execute('UPDATE pg_temp.print_payment_receipts SET total_received=67,transaction_fee_centavos=700 WHERE print_receipt_id=3')
  const entries = await reports.revenue(filters)
  const after = revenueSnapshot(entries,filters)
  const summary = await reports.revenueSummary(filters)
  assert.equal(after.summary.total_revenue,115)
  assert.equal(after.summary.total_revenue,summary.total_revenue)
  assert.equal(after.summary.paid_requests,4)
  assert.equal(after.summary.total_sheets,6)
  assert.equal(entries.filter(row=>row.payment_method==='GCASH').length,1)
  assert.equal(entries.some(row=>row.file_name==='reversed.pdf'),false)
  assert.equal(entries.find(row=>row.file_name==='history')?.total_sheets,null)
  console.log('PASS: cash, online receipt, legacy/historical payments, exact-once totals, reversed/unpaid/void exclusion, Manila date boundaries and matching details.')
} finally {
  await connection.rollback()
  connection.release()
  await db.end()
}
