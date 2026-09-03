import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('cross-portal migration preserves legacy keys and adds normalized queue/copy links', async () => {
  const migration = await readFile(new URL('../../../../../database/migrations/20260823_015_cross_portal_circulation_sync.sql', import.meta.url), 'utf8')
  assert.match(migration, /ADD COLUMN `book_title_id` BIGINT UNSIGNED DEFAULT NULL/)
  assert.match(migration, /ADD COLUMN `assigned_physical_copy_id` BIGINT UNSIGNED DEFAULT NULL/)
  assert.match(migration, /ADD COLUMN `physical_copy_id` BIGINT UNSIGNED DEFAULT NULL/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `admin_notifications`/)
  assert.match(migration, /CREATE OR REPLACE ALGORITHM=MERGE VIEW `borrow_records`/)
  assert.match(migration, /ON DELETE RESTRICT/)
})

test('book cart migration adds grouped pending-claim compatibility and lookup indexes', async () => {
  const migration = await readFile(new URL('../../../../../database/migrations/20260823_016_book_cart_checkout.sql', import.meta.url), 'utf8')
  assert.match(migration, /ADD COLUMN `request_group_id` CHAR\(36\)/)
  assert.match(migration, /idx_borrow_request_group/)
  assert.match(migration, /idx_borrow_user_queue/)
  assert.match(migration, /borrow_request_submitted/)
  assert.match(migration, /WHEN 'Pending' THEN 'pending_claim'/)
})

test('book material bridge migration backfills normalized physical copies safely', async () => {
  const migration = await readFile(new URL('../../../../../database/migrations/20260823_017_book_circulation_material_bridge.sql', import.meta.url), 'utf8')
  assert.match(migration, /INSERT INTO `materials`/)
  assert.match(migration, /WHERE pc\.`material_id` IS NULL/)
  assert.match(migration, /m\.`barcode` = pc\.`barcode`/)
  assert.match(migration, /CREATE TEMPORARY TABLE `tmp_book_material_bridge`/)
  assert.match(migration, /SET pc\.`material_id` = bridge\.`material_id`/)
})

test('cancellation migration adds terminal state, audit fields, and compatibility mapping', async () => {
  const migration = await readFile(new URL('../../../../../database/migrations/20260824_020_borrow_request_cancellation.sql', import.meta.url), 'utf8')
  assert.match(migration, /ENUM\('Pending','Borrowed','Returned','Overdue','Cancelled'\)/)
  assert.match(migration, /ADD COLUMN `cancelled_at` DATETIME/)
  assert.match(migration, /ADD COLUMN `cancelled_by_user_id` BIGINT UNSIGNED/)
  assert.match(migration, /borrow_request_cancelled/)
  assert.match(migration, /WHEN 'Cancelled' THEN 'cancelled'/)
})

test('desk-fulfillment migration links exactly one pending claim to a reservation', async () => {
  const migration = await readFile(new URL('../../../../../database/migrations/20260824_021_reservation_desk_fulfillment.sql', import.meta.url), 'utf8')
  assert.match(migration, /ADD COLUMN `reservation_id` BIGINT UNSIGNED/)
  assert.match(migration, /UNIQUE KEY `uq_borrow_reservation`/)
  assert.match(migration, /CONSTRAINT `fk_borrow_reservation`/)
  assert.match(migration, /WHEN 'Pending' THEN 'pending_claim'/)
})

test('legacy reconciliation releases only stale borrowed flags', async () => {
  const migration = await readFile(new URL('../../../../../database/migrations/20260824_022_reconcile_stale_borrowed_copies.sql', import.meta.url), 'utf8')
  assert.match(migration, /transaction_status` IN \('Pending','Borrowed','Overdue'\)/)
  assert.match(migration, /reservation_status` = 'ready_for_pickup'/)
  assert.match(migration, /bt\.`transaction_id` IS NULL/)
  assert.match(migration, /r\.`reservation_id` IS NULL/)
})
