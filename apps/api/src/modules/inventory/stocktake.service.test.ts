import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import {
  cancelStocktakeSession,
  closeStocktakeSession,
  createStocktakeSession,
  recordStocktakeScan,
  resolveStocktakeDiscrepancy,
  reviewStocktakeSession,
} from './stocktake.service.ts'

const actor = { userId: 9, label: 'Admin Tester', role: 'Admin' as const }

interface FixtureState {
  status: string
  commits: number
  rollbacks: number
  scans: number
  discrepancies: number
  resolutionEvents: number
  requestKeys: Set<string>
  expectedItems: Array<Record<string, unknown>>
}

function stocktakePool(options: {
  status?: string
  expectedItems?: Array<Record<string, unknown>>
  openFindings?: number
  discrepancy?: Record<string, unknown> | null
} = {}) {
  const state: FixtureState = {
    status: options.status ?? 'in_progress',
    commits: 0,
    rollbacks: 0,
    scans: 0,
    discrepancies: 0,
    resolutionEvents: 0,
    requestKeys: new Set(),
    expectedItems: options.expectedItems ?? [],
  }

  function sessionRow() {
    return {
      stocktake_session_id: 11,
      session_name: 'Shelf A count',
      scope_kind: 'shelf',
      scope_id: '5',
      scope_label: 'Shelf A',
      asset_kind: 'book',
      status: state.status,
      started_at: new Date(),
      started_by_label: actor.label,
      closed_at: state.status === 'closed' || state.status === 'reviewed' ? new Date() : null,
      closed_by_label: state.status === 'closed' || state.status === 'reviewed' ? actor.label : null,
      reviewed_at: state.status === 'reviewed' ? new Date() : null,
      reviewed_by_label: state.status === 'reviewed' ? actor.label : null,
      cancelled_at: state.status === 'cancelled' ? new Date() : null,
      cancel_reason: state.status === 'cancelled' ? 'Wrong shelf selected' : null,
      row_version: 1,
      expected_count: state.expectedItems.length,
      present_count: 0,
      missing_count: state.discrepancies,
      exception_count: 0,
      open_discrepancy_count: options.openFindings ?? 0,
    }
  }

  const connection = {
    async beginTransaction() {},
    async commit() { state.commits += 1 },
    async rollback() { state.rollbacks += 1 },
    release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('FROM floor_plan_shelves')) {
        return [[{ id: 5, label: 'Shelf A', column_count: 4, row_count: 5 }]]
      }
      if (sql.includes('INSERT INTO stocktake_sessions')) {
        return [{ insertId: 11, affectedRows: 1 }]
      }
      if (sql.includes('INSERT INTO stocktake_expected_items')) {
        return [{ affectedRows: Math.max(1, state.expectedItems.length) }]
      }
      if (sql.includes('FROM stocktake_sessions') && sql.includes('stocktake_session_id')) {
        return [[sessionRow()]]
      }
      if (sql.includes('FROM stocktake_scans') && sql.includes('request_key')) {
        if (state.requestKeys.has(String(values[1]))) {
          return [[{ stocktake_scan_id: 77, entered_barcode: 'UNKNOWN-1', request_key: values[1] }]]
        }
        return [[]]
      }
      if (sql.includes('WHERE pc.barcode') || sql.includes('WHERE ri.barcode')) {
        return [[]]
      }
      if (sql.includes('COUNT(*) AS total FROM stocktake_scans') && sql.includes('resolved_source_item_id')) {
        return [[{ total: 0 }]]
      }
      if (sql.includes('FROM stocktake_expected_items') && sql.includes('asset_kind = ?') && sql.includes('source_item_id')) {
        return [[]]
      }
      if (sql.includes('INSERT INTO stocktake_scans')) {
        state.scans += 1
        state.requestKeys.add(String(values[1]))
        return [{ insertId: 70 + state.scans, affectedRows: 1 }]
      }
      if (sql.includes('stocktake_discrepancies') && (sql.includes('INSERT') || sql.includes('ON DUPLICATE') || sql.includes('ON CONFLICT'))) {
        state.discrepancies += 1
        return [{ insertId: 90 + state.discrepancies, affectedRows: 1 }]
      }
      if (sql.includes('SELECT * FROM stocktake_expected_items WHERE stocktake_session_id')) {
        return [state.expectedItems]
      }
      if (sql.includes('GROUP BY resolved_asset_kind')) {
        return [[]]
      }
      if (sql.includes('FROM physical_copies') && sql.includes('WHERE pc.physical_copy_id = ?')) {
        return [[{
          lifecycle_status: 'Active',
          row_version: 1,
          condition_status: 'Good',
          material_id: 501,
          shelf_location: 'Shelf A',
          shelf_column: 1,
          shelf_row: 1,
        }]]
      }
      if (sql.includes('FROM physical_copies pc') && sql.includes('JOIN titles')) {
        return [[]]
      }
      if (sql.includes('FROM borrow_transactions')) {
        return [[]]
      }
      if (sql.includes("SET status = 'closed'")) {
        state.status = 'closed'
        return [{ affectedRows: 1 }]
      }
      if (sql.includes("SET status = 'cancelled'")) {
        state.status = 'cancelled'
        return [{ affectedRows: 1 }]
      }
      if (sql.includes("SET status = 'reviewed'")) {
        state.status = 'reviewed'
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('COUNT(*) AS total FROM stocktake_discrepancies') && sql.includes("status IN ('open', 'blocked')")) {
        return [[{ total: options.openFindings ?? 0 }]]
      }
      if (sql.includes('FROM stocktake_discrepancies d') && sql.includes('stocktake_discrepancy_id')) {
        return [[options.discrepancy ? [options.discrepancy] : []][0]]
      }
      if (sql.includes('UPDATE stocktake_discrepancies')) {
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('INSERT INTO stocktake_resolution_events')) {
        state.resolutionEvents += 1
        return [{ insertId: 55, affectedRows: 1 }]
      }
      if (sql.includes('UPDATE stocktake_expected_items')) {
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('FROM physical_copies') || sql.includes('FROM research_inventory') || sql.includes('FROM materials')) {
        return [[]]
      }
      if (sql.trimStart().toUpperCase().startsWith('SELECT')) return [[]]
      if (sql.trimStart().toUpperCase().startsWith('UPDATE') || sql.trimStart().toUpperCase().startsWith('INSERT')) {
        return [{ insertId: 1, affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL: ${sql.slice(0, 180)}`)
    },
  }

  return {
    state,
    database: {
      getConnection: async () => connection,
      execute: connection.execute.bind(connection),
    } as unknown as Pool,
  }
}

test('createStocktakeSession snapshots an empty shelf and commits once', async () => {
  const { state, database } = stocktakePool()
  const session = await createStocktakeSession({
    name: 'Shelf A count',
    scopeKind: 'shelf',
    scopeId: '5',
    assetKind: 'book',
  }, actor, database)
  assert.equal(session.stocktake_session_id, 11)
  assert.equal(session.expected_count, 0)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
})

test('unknown barcode records a scan finding without verifying inventory', async () => {
  const { state, database } = stocktakePool()
  const result = await recordStocktakeScan(11, {
    requestKey: 'scan-unknown-1',
    barcode: 'UNKNOWN-1',
    observedShelfId: 5,
    observedColumn: null,
    observedRow: null,
    source: 'manual',
  }, actor, database)
  assert.equal(result.classification, 'unknown')
  assert.equal(state.scans, 1)
  assert.equal(state.discrepancies, 1)
  assert.equal(state.commits, 1)
})

test('repeated request key returns the stored scan without another insert', async () => {
  const { state, database } = stocktakePool()
  await recordStocktakeScan(11, {
    requestKey: 'scan-idempotent',
    barcode: 'UNKNOWN-2',
    observedShelfId: 5,
    observedColumn: null,
    observedRow: null,
    source: 'scanner',
  }, actor, database)
  const replay = await recordStocktakeScan(11, {
    requestKey: 'scan-idempotent',
    barcode: 'UNKNOWN-2',
    observedShelfId: 5,
    observedColumn: null,
    observedRow: null,
    source: 'scanner',
  }, actor, database)
  assert.equal(replay.duplicate_request, true)
  assert.equal(state.scans, 1)
})

test('close freezes missing findings for unscanned expected items', async () => {
  const expectedItems = [{
    stocktake_expected_item_id: 21,
    asset_kind: 'book',
    source_item_id: 101,
    barcode: 'BOOK-101',
    lifecycle_snapshot: 'Active',
    loan_state_snapshot: 'none',
    row_version_snapshot: 1,
    condition_snapshot: 'Good',
    availability_snapshot: 'Available',
    home_shelf_label: 'Shelf A',
    home_shelf_column: 1,
    home_shelf_row: 1,
  }]
  const { state, database } = stocktakePool({ expectedItems })
  const closed = await closeStocktakeSession(11, actor, database)
  assert.equal(state.status, 'closed')
  assert.equal(state.discrepancies, 1)
  assert.equal(closed?.status, 'closed')
})

test('scan is rejected after the session is closed', async () => {
  const { database } = stocktakePool({ status: 'closed' })
  await assert.rejects(
    recordStocktakeScan(11, {
      requestKey: 'after-close',
      barcode: 'BOOK-1',
      observedShelfId: 5,
      observedColumn: null,
      observedRow: null,
      source: 'manual',
    }, actor, database),
    (error: unknown) => error instanceof HttpError && error.code === 'STOCKTAKE_NOT_OPEN',
  )
})

test('cancel marks an in-progress session cancelled', async () => {
  const { state, database } = stocktakePool()
  await cancelStocktakeSession(11, 'Wrong shelf selected', actor, database)
  assert.equal(state.status, 'cancelled')
})

test('review is blocked while open findings remain', async () => {
  const { database } = stocktakePool({ status: 'closed', openFindings: 2 })
  await assert.rejects(
    reviewStocktakeSession(11, actor, database),
    (error: unknown) => error instanceof HttpError && error.code === 'STOCKTAKE_OPEN_FINDINGS',
  )
})

test('dismiss records a resolution event without inventory mutation', async () => {
  const { state, database } = stocktakePool({
    status: 'closed',
    discrepancy: {
      stocktake_discrepancy_id: 33,
      stocktake_session_id: 11,
      status: 'open',
      finding_code: 'missing',
      row_version: 1,
      evidence_snapshot: '{}',
      asset_kind: 'book',
      source_item_id: 101,
      home_shelf_label: 'Shelf A',
      home_shelf_column: 1,
      home_shelf_row: 1,
    },
  })
  await resolveStocktakeDiscrepancy(11, 33, {
    expectedRowVersion: 1,
    action: 'dismiss',
    reason: 'Item located after close.',
    condition: null,
    availability: null,
  }, actor, database)
  assert.equal(state.resolutionEvents, 1)
  assert.equal(state.commits, 1)
})
