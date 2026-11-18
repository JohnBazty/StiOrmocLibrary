import { randomBytes } from 'node:crypto'
import { env } from '../src/config/env.js'
import { db } from '../src/config/db.js'
import {
  cancelStocktakeSession,
  closeStocktakeSession,
  createStocktakeSession,
  recordStocktakeScan,
  resolveStocktakeDiscrepancy,
  reviewStocktakeSession,
  stocktakeDiscrepancies,
} from '../src/modules/inventory/stocktake.service.ts'

if (env.db.driver !== 'postgres') {
  console.error('smoke:stocktake requires env.db.driver === "postgres" (set DATABASE_URL).')
  process.exit(1)
}

const suffix = randomBytes(6).toString('hex')
const sessionName = `SMOKE STK ${suffix.toUpperCase()}`
const actor = { userId: null, label: `Smoke Stocktake ${suffix}` }

/** @type {number | null} */
let sessionId = null

function expect(condition, label) {
  if (!condition) throw new Error(`Failed: ${label}`)
  console.log(`PASS ${label}`)
}

try {
  const [shelfRows] = await db.execute(
    'SELECT id, label FROM floor_plan_shelves ORDER BY id ASC LIMIT 1',
    [],
  )
  const shelf = shelfRows[0]
  expect(Boolean(shelf), 'at least one managed shelf exists for smoke')

  const created = await createStocktakeSession({
    name: sessionName,
    scopeKind: 'shelf',
    scopeId: String(shelf.id),
    assetKind: 'book',
  }, actor)
  sessionId = Number(created.stocktake_session_id)
  expect(sessionId > 0, `created disposable session ${sessionId}`)
  expect(created.status === 'in_progress', 'session starts in progress')

  const unknown = await recordStocktakeScan(sessionId, {
    requestKey: `smoke-unknown-${suffix}`,
    barcode: `SMOKE-UNKNOWN-${suffix}`,
    observedShelfId: Number(shelf.id),
    observedColumn: null,
    observedRow: null,
    source: 'manual',
  }, actor)
  expect(unknown.classification === 'unknown', 'unknown barcode classified')

  const closed = await closeStocktakeSession(sessionId, actor)
  expect(closed?.status === 'closed', 'session closed after scan')

  const findings = await stocktakeDiscrepancies(sessionId, {
    page: 1,
    limit: 50,
    query: null,
    status: 'open',
    findingCode: null,
    assetKind: null,
  })
  expect(findings.items.length >= 1, 'close/scan produced open findings')

  for (const finding of findings.items) {
    await resolveStocktakeDiscrepancy(sessionId, finding.stocktake_discrepancy_id, {
      expectedRowVersion: finding.row_version,
      action: 'dismiss',
      reason: 'Smoke cleanup dismissal',
      condition: null,
      availability: null,
    }, actor)
  }
  console.log(`PASS dismissed ${findings.items.length} open finding(s)`)

  const reviewed = await reviewStocktakeSession(sessionId, actor)
  expect(reviewed?.status === 'reviewed', 'session marked reviewed after dismissals')

  console.log('smoke:stocktake completed successfully')
} catch (error) {
  console.error(error)
  if (sessionId) {
    try {
      await cancelStocktakeSession(sessionId, 'Smoke failure cleanup', actor)
    } catch {
      // reviewed/closed sessions cannot cancel; delete below
    }
  }
  process.exitCode = 1
} finally {
  if (sessionId) {
    await db.execute('DELETE FROM stocktake_resolution_events WHERE stocktake_discrepancy_id IN (SELECT stocktake_discrepancy_id FROM stocktake_discrepancies WHERE stocktake_session_id = ?)', [sessionId])
    await db.execute('DELETE FROM stocktake_discrepancies WHERE stocktake_session_id = ?', [sessionId])
    await db.execute('DELETE FROM stocktake_scans WHERE stocktake_session_id = ?', [sessionId])
    await db.execute('DELETE FROM stocktake_expected_items WHERE stocktake_session_id = ?', [sessionId])
    await db.execute('DELETE FROM stocktake_sessions WHERE stocktake_session_id = ?', [sessionId])
    console.log(`PASS cleaned disposable session ${sessionId}`)
  }
  if (typeof db.end === 'function') await db.end()
}
