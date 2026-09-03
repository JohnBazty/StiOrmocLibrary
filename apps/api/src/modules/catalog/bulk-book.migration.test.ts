import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../../../../../database/migrations/20260823_018_bulk_copy_labels.sql', import.meta.url)

test('bulk label migration adds QR storage, exact unique indexes, and a locked sequence ledger', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /ADD COLUMN `qr_code_data` LONGTEXT/i)
  assert.match(sql, /UNIQUE INDEX `idx_unique_barcode` \(`barcode`\)/i)
  assert.match(sql, /UNIQUE INDEX `idx_unique_accession` \(`accession_number`\)/i)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `barcode_sequences`/i)
  assert.match(sql, /PRIMARY KEY \(`sequence_year`\)/i)
})

test('research asset migration persists an administrative QR image payload', async () => {
  const sql = await readFile(new URL('../../../../../database/migrations/20260824_023_research_asset_qr.sql', import.meta.url), 'utf8')
  assert.match(sql, /research_inventory.*qr_code_data/is)
  assert.match(sql, /LONGTEXT/)
  assert.match(sql, /information_schema\.COLUMNS/)
})
