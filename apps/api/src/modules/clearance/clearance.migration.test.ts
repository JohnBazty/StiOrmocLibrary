import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../../../../../database/migrations/20260902_030_clearance_notifications_announcements.sql', import.meta.url)

test('clearance and notification migration preserves authoritative audit ledgers', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `clearance_overrides`/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `lost_book_reports`/)
  assert.match(sql, /ADD COLUMN `purchase_price` DECIMAL\(10,2\)/)
  assert.match(sql, /UNIQUE KEY `uq_notification_user_dedupe`/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `announcements`/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `announcement_revisions`/)
})
