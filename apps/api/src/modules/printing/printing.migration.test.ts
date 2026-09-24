import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('printing migration is cash-only and records ink by bottle',async()=>{const sql=await readFile(new URL('../../../../../database/migrations/20260828_025_printing_service_and_bottle_supplies.sql',import.meta.url),'utf8');assert.match(sql,/available_bottles/);assert.match(sql,/print_cash_payments/);assert.match(sql,/ink_stock_movements/);assert.doesNotMatch(sql,/gcash/i);assert.doesNotMatch(sql,/payment gateway/i)})

test('manual printing migration enables requests independently and audits file downloads',async()=>{const sql=await readFile(new URL('../../../../../database/migrations/20260828_027_manual_printing_workflow.sql',import.meta.url),'utf8');assert.match(sql,/printing_service_settings/);assert.match(sql,/accepting_requests/);assert.match(sql,/print_file_download_audit/);assert.match(sql,/VALUES \(1, 1, NULL\)/);assert.doesNotMatch(sql,/DROP (TABLE|COLUMN)/i)})

test('financial overview migration preserves required unit costs and reporting indexes',async()=>{const sql=await readFile(new URL('../../../../../database/migrations/20260828_028_printing_financial_overview.sql',import.meta.url),'utf8');assert.match(sql,/unit_cost_per_bottle/);assert.match(sql,/unit_cost_per_ream/);assert.match(sql,/idx_print_cash_received_at/);assert.match(sql,/idx_ink_movement_type_date/);assert.match(sql,/idx_paper_movement_type_date/);assert.doesNotMatch(sql,/DROP (TABLE|COLUMN)/i)})

test('stock audit separation migration preserves legacy balances and adds manual usage audit fields',async()=>{const sql=await readFile(new URL('../../../../../database/migrations/20260828_029_printing_stock_audit_separation.sql',import.meta.url),'utf8');assert.match(sql,/unopened_reams/);assert.match(sql,/activity_code/);assert.match(sql,/balance_before/);assert.match(sql,/balance_after/);assert.match(sql,/LoadedIntoPrinter|OpenedReam/);assert.doesNotMatch(sql,/DROP (TABLE|COLUMN)/i)})

test('printing receipts are permanent printing records and never use the fine receipt ledger',async()=>{const sql=await readFile(new URL('../../../../../database/migrations/20260923_040_printing_digital_receipts.sql',import.meta.url),'utf8');assert.match(sql,/CREATE TABLE IF NOT EXISTS `print_payment_receipts`/);assert.match(sql,/receipt_number/);assert.match(sql,/verification_code/);assert.match(sql,/print_cash_payment_id/);assert.doesNotMatch(sql,/REFERENCES `fine_payment_receipts`/);assert.doesNotMatch(sql,/DROP (TABLE|COLUMN)/i)})
