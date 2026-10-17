import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { PrintingRepository } from './printing.repository.ts'

test('current-stock export uses the same unopened quantities and low-stock flags as the supplies page', async () => {
  const pool = { async execute(sql: string) {
    if (sql.includes('FROM ink_repository i')) return [[{ ink_id: 4, cartridge_type: 'Dye', color_variation: 'Black', available_bottles: 2, low_stock_threshold_bottles: 2, is_low: 1 }]]
    if (sql.includes('FROM bond_paper_stocks ORDER BY')) return [[{ paper_stock_id: 6, paper_size_dimension: 'A4', unopened_reams: 7, low_stock_threshold_reams: 3, is_low: 0 }]]
    return [[{ low_ink_items: 1, low_paper_items: 0, monthly_expense: 0 }]]
  } } as unknown as Pool
  const repository = new PrintingRepository(pool)
  const visible = await repository.supplies()
  const exported = []
  for await (const row of repository.supplyReportRows()) exported.push(row)
  assert.equal(exported[0].available, `${visible.ink[0].available_bottles} unopened bottles`)
  assert.equal(exported[0].threshold, `${visible.ink[0].low_stock_threshold_bottles} bottles`)
  assert.equal(exported[0].status, 'Low stock')
  assert.equal(exported[1].available, `${visible.paper[0].unopened_reams} unopened reams`)
  assert.equal(exported[1].status, 'In stock')
})
