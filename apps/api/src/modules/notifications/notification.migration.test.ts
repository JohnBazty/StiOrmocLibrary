import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('notification deletion is implemented as a backward-safe soft delete', async () => {
  const sql = await readFile(new URL('../../../../../database/migrations/20260905_034_user_notification_soft_delete.sql', import.meta.url), 'utf8')
  assert.match(sql, /ADD COLUMN `deleted_at`/)
  assert.match(sql, /idx_notification_user_deleted/)
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)/i)
})
