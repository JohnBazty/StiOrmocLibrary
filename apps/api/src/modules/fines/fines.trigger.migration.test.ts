import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('fine triggers preserve explicit users for standalone infractions', async () => {
  const sql = await readFile(new URL('../../../../../database/migrations/20260902_032_infraction_fine_trigger_compatibility.sql', import.meta.url), 'utf8')
  assert.match(sql, /NEW\.`transaction_id` IS NULL[\s\S]*NEW\.`user_id`/)
  assert.match(sql, /SELECT `user_id` FROM `borrow_transactions` WHERE `transaction_id` = NEW\.`transaction_id`/)
  assert.match(sql, /CREATE TRIGGER `trg_fine_before_insert`/)
  assert.match(sql, /CREATE TRIGGER `trg_fine_before_update`/)
})
