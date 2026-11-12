import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
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
  calls: Array<{ sql: string; values: unknown[] }>
  expectedItems: Array<Record<string, unknown>>
}

function stocktakePool(options: {
  status?: string
  expectedItems?: Array<Record<string, unknown>>
  openFindings?: number
  discrepancy?: Record<string, unknown> | null
  // Runs before the default routing; return undefined to fall through.
  handler?: (sql: string, values: unknown[]) => unknown
} = {}) {
  const state: FixtureState = {
    status: options.status ?? 'in_progress',
    commits: 0,
    rollbacks: 0,
    scans: 0,
    discrepancies: 0,
    resolutionEvents: 0,
    requestKeys: new Set(),
    calls: [],
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
      state.calls.push({ sql, values })
      const custom = options.handler?.(sql, values)
      if (custom !== undefined) return custom
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
      if (sql.includes('FROM physical_copies') && sql.includes('ANY(')) {
        return [(values[0] as number[]).map((id) => ({
          physical_copy_id: id, lifecycle_status: 'Active', row_version: 1, condition_status: 'Good', material_id: 500 + id,
        }))]
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

// ---- Spec scenarios S1, S2, S3, S6, E3 ----

const BOOK = {
  source_item_id: 101, asset_kind: 'book', barcode: 'BOOK-101', accession_number: 'A-101', title: 'Algorithms',
  shelf_location: 'Shelf A', shelf_column: 1, shelf_row: 1, condition_state: 'Good', availability_status: 'Available',
  lifecycle_status: 'Active', row_version: 1, material_id: 501, home_shelf_id: 5,
}
const EXPECTED_BOOK = {
  stocktake_expected_item_id: 21, asset_kind: 'book', source_item_id: 101, barcode: 'BOOK-101',
  lifecycle_snapshot: 'Active', loan_state_snapshot: 'none', row_version_snapshot: 1, condition_snapshot: 'Good',
  availability_snapshot: 'Available', home_shelf_label: 'Shelf A', home_shelf_column: 1, home_shelf_row: 1,
}
const scanInput = { requestKey: 'k', barcode: 'BOOK-101', observedShelfId: 5, observedColumn: null, observedRow: null, source: 'scanner' }

function lockedCopy(condition: string, availability: string) {
  return {
    physical_copy_id: 101, material_id: 501, barcode: 'BOOK-101', accession_number: 'A-101', title: 'Algorithms',
    condition_status: condition, availability_status: availability, lifecycle_status: 'Active', circulation_material_id: 501,
  }
}

function scanHandler(book: Record<string, unknown> | null, research: Record<string, unknown> | null = null) {
  return (sql: string) => {
    if (sql.includes('FROM physical_copies pc') && sql.includes('FOR UPDATE')) {
      return [book ? [lockedCopy(String(book.condition_state), String(book.availability_status))] : []]
    }
    if (sql.includes('FROM physical_copies pc') && sql.includes('LEFT JOIN floor_plan_shelves')) return [book ? [book] : []]
    if (sql.includes('FROM research_inventory ri') && sql.includes('LEFT JOIN floor_plan_shelves')) return [research ? [research] : []]
    if (sql.includes('FROM stocktake_expected_items') && sql.includes('source_item_id = ?')) return [[EXPECTED_BOOK]]
    return undefined
  }
}

// Each discrepancy upsert row is 7 bound values; the code is the third.
const findingCodes = (calls: Array<{ sql: string; values: unknown[] }>) => calls
  .filter((call) => call.sql.includes('stocktake_discrepancies') && call.sql.includes('INSERT'))
  .flatMap((call) => call.values.filter((_, index) => index % 7 === 2).map(String))

test('S1 scanning a book in a different compartment records wrong_location', async () => {
  const { state, database } = stocktakePool({ handler: scanHandler(BOOK) })
  const result = await recordStocktakeScan(11, { ...scanInput, observedColumn: 3 }, actor, database)
  assert.deepEqual(result.classifications, ['wrong_location'])
  assert.deepEqual(findingCodes(state.calls), ['wrong_location'])
})

test('S2 a lost book scanned gets lost_but_found and its condition is not changed', async () => {
  const lost = { ...BOOK, condition_state: 'Lost', availability_status: 'Unavailable' }
  const { state, database } = stocktakePool({ handler: scanHandler(lost) })
  const result = await recordStocktakeScan(11, scanInput, actor, database)
  assert.deepEqual(result.classifications, ['lost_but_found'])
  assert.ok(!state.calls.some((call) => call.sql.includes('SET condition_status')))
})

const LOST_FINDING = {
  stocktake_discrepancy_id: 33, status: 'open', finding_code: 'lost_but_found', row_version: 1,
  evidence_snapshot: '{}', asset_kind: 'book', source_item_id: 101, barcode: 'BOOK-101',
}
const lockCopyHandler = (condition: string, availability: string) => (sql: string) => (
  sql.includes('FROM physical_copies pc') && sql.includes('FOR UPDATE') ? [[lockedCopy(condition, availability)]] : undefined
)

test('S2 resolving lost_but_found with apply_condition makes the copy available and writes an inventory audit', async () => {
  const { state, database } = stocktakePool({
    status: 'closed', discrepancy: LOST_FINDING, handler: lockCopyHandler('Lost', 'Unavailable'),
  })
  await resolveStocktakeDiscrepancy(11, 33, {
    expectedRowVersion: 1, action: 'apply_condition', reason: 'Found on shelf.', condition: 'Good', availability: null,
  }, actor, database)
  const update = state.calls.find((call) => call.sql.includes('UPDATE physical_copies') && call.sql.includes('SET condition_status'))
  assert.deepEqual(update?.values, ['Good', 'Available', 101])
  const audit = state.calls.find((call) => call.sql.includes('INSERT INTO inventory_audit_events'))
  assert.equal(audit?.values[2], 'Condition Changed')
  assert.equal(audit?.values[8], actor.label)
  assert.equal(state.resolutionEvents, 1)
  assert.equal(state.commits, 1)
})

test('apply_condition refuses Lost as the new condition', async () => {
  const { database } = stocktakePool({
    status: 'closed', discrepancy: LOST_FINDING, handler: lockCopyHandler('Lost', 'Unavailable'),
  })
  await assert.rejects(
    resolveStocktakeDiscrepancy(11, 33, {
      expectedRowVersion: 1, action: 'apply_condition', reason: 'x', condition: 'Lost', availability: null,
    }, actor, database),
    (error: unknown) => error instanceof HttpError && error.code === 'STOCKTAKE_VALIDATION_FAILED',
  )
})

test('S3 an unscanned book on loan closes as borrowed_out, not missing', async () => {
  const { state, database } = stocktakePool({
    expectedItems: [{ ...EXPECTED_BOOK, source_item_id: 101 }],
    handler: (sql) => (sql.includes('FROM borrow_transactions')
      ? [[{ material_id: 601, transaction_status: 'Borrowed' }]]
      : undefined),
  })
  await closeStocktakeSession(11, actor, database)
  assert.deepEqual(findingCodes(state.calls), ['borrowed_out'])
})

test('S6 scanning a known active book records a Verified inventory audit by the actor', async () => {
  const { state, database } = stocktakePool({ handler: scanHandler(BOOK) })
  const result = await recordStocktakeScan(11, scanInput, actor, database)
  assert.equal(result.classification, 'present')
  const audit = state.calls.find((call) => call.sql.includes('INSERT INTO inventory_audit_events'))
  assert.equal(audit?.values[2], 'Verified')
  assert.equal(audit?.values[8], actor.label)
})

test('E3 a barcode shared by a book and a research copy is unknown and never verified', async () => {
  const { state, database } = stocktakePool({ handler: scanHandler(BOOK, { ...BOOK, asset_kind: 'research' }) })
  const result = await recordStocktakeScan(11, scanInput, actor, database)
  assert.deepEqual(result.classifications, ['unknown'])
  assert.ok(!state.calls.some((call) => call.sql.includes('INSERT INTO inventory_audit_events')))
})

// ---- Review fixes: C1/H1/H2 locking and query count, M2, M3 ----

const bookRows = (count: number) => Array.from({ length: count }, (_, index) => ({
  physical_copy_id: 100 + index, material_id: 500 + index, barcode: `B-${index}`, accession_number: `A-${index}`,
  title: 'T', category_id: 1, category_name: 'C', shelf_location: 'Shelf A', shelf_column: 1, shelf_row: 1,
  condition_status: 'Good', availability_status: 'Available', lifecycle_status: 'Active', row_version: 1, home_shelf_id: 5,
}))
const expectedRowsFor = (count: number) => Array.from({ length: count }, (_, index) => ({
  ...EXPECTED_BOOK, stocktake_expected_item_id: 21 + index, source_item_id: 100 + index, barcode: `B-${index}`,
}))

async function createCalls(count: number) {
  const { state, database } = stocktakePool({
    handler: (sql) => (sql.includes('FROM physical_copies pc') && sql.includes('LEFT JOIN categories') ? [bookRows(count)] : undefined),
  })
  await createStocktakeSession({ name: 'n', scopeKind: 'shelf', scopeId: '5', assetKind: 'book' }, actor, database)
  return state.calls
}

test('create reads loan state without locks and with a constant number of queries', async () => {
  const small = await createCalls(2)
  const large = await createCalls(40)
  assert.equal(large.length, small.length)
  assert.equal(large.filter((call) => call.sql.includes('borrow_transactions')).length, 1)
  assert.ok(!large.some((call) => call.sql.includes('FOR UPDATE')))
})

async function closeCalls(count: number) {
  const { state, database } = stocktakePool({ expectedItems: expectedRowsFor(count) })
  await closeStocktakeSession(11, actor, database)
  return state.calls
}

test('close reads live rows and loans in constant queries, without locks, and writes findings in one statement', async () => {
  const small = await closeCalls(2)
  const large = await closeCalls(40)
  assert.equal(large.length, small.length)
  assert.ok(!large.some((call) => call.sql.includes('FOR UPDATE') && !call.sql.includes('stocktake_sessions')))
  assert.equal(findingCodes(large).length, 40)
  assert.equal(large.filter((call) => call.sql.includes('INSERT INTO stocktake_discrepancies')).length, 1)
})

test('scan reads loan state without FOR UPDATE on loans', async () => {
  const { state, database } = stocktakePool({ handler: scanHandler(BOOK) })
  await recordStocktakeScan(11, scanInput, actor, database)
  const loanReads = state.calls.filter((call) => call.sql.includes('borrow_transactions'))
  assert.ok(loanReads.length > 0)
  assert.ok(loanReads.every((call) => !call.sql.includes('FOR UPDATE')))
})

test('M3 close freezes an archived finding when the live row is gone', async () => {
  const { state, database } = stocktakePool({
    expectedItems: [EXPECTED_BOOK],
    handler: (sql) => (sql.includes('FROM physical_copies') && sql.includes('ANY(') ? [[]] : undefined),
  })
  await closeStocktakeSession(11, actor, database)
  assert.deepEqual(findingCodes(state.calls), ['archived'])
  const snapshot = state.calls.find((call) => call.sql.includes('UPDATE stocktake_expected_items'))
  assert.deepEqual(snapshot?.values[1], ['Removed'])
})

test('M2 apply_condition refuses when the barcode now belongs to another copy', async () => {
  const { database } = stocktakePool({
    status: 'closed', discrepancy: { ...LOST_FINDING, source_item_id: 999 }, handler: lockCopyHandler('Lost', 'Unavailable'),
  })
  await assert.rejects(
    resolveStocktakeDiscrepancy(11, 33, {
      expectedRowVersion: 1, action: 'apply_condition', reason: 'x', condition: 'Good', availability: null,
    }, actor, database),
    (error: unknown) => error instanceof HttpError && error.code === 'STOCKTAKE_LIVE_STATE_CHANGED',
  )
})

test('M2 apply_condition refuses when an active reservation exists', async () => {
  const locked = lockCopyHandler('Lost', 'Unavailable')
  const { database } = stocktakePool({
    status: 'closed', discrepancy: LOST_FINDING,
    handler: (sql) => (sql.includes('FROM reservations') ? [[{ reservation_id: 5, reservation_status: 'pending' }]] : locked(sql)),
  })
  await assert.rejects(
    resolveStocktakeDiscrepancy(11, 33, {
      expectedRowVersion: 1, action: 'apply_condition', reason: 'x', condition: 'Good', availability: null,
    }, actor, database),
    (error: unknown) => error instanceof HttpError && error.code === 'STOCKTAKE_LIVE_STATE_CHANGED',
  )
})
