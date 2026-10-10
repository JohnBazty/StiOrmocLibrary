import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { excluded, forUpdate, upsert } from '../../config/sql-dialect.js'
import type { StocktakeAssetKind, StocktakeScopeKind } from './stocktake.validation.ts'

export type ScopeSnapshot = {
  scopeKind: StocktakeScopeKind
  scopeId: string | null
  scopeLabel: string
  assetKind: StocktakeAssetKind
  shelfIds: number[]
  shelfLabels: string[]
  unplacedShelfIds: number[]
  unplacedShelfLabels: string[]
  roomMapRevision: number | null
  categoryId: number | null
  categoryName: string | null
}

export type ExpectedItemInsert = {
  assetKind: 'book' | 'research'
  sourceItemId: number
  barcode: string
  accessionNumber: string
  title: string
  categoryId: number | null
  categoryName: string | null
  homeShelfId: number | null
  homeShelfLabel: string
  homeShelfColumn: number
  homeShelfRow: number
  conditionSnapshot: string
  availabilitySnapshot: string
  lifecycleSnapshot: string
  rowVersionSnapshot: number
  loanStateSnapshot: string
  reservationStateSnapshot: string
}

function sessionDto(row: RowDataPacket) {
  return {
    stocktake_session_id: Number(row.stocktake_session_id),
    session_name: String(row.session_name),
    scope_kind: String(row.scope_kind),
    scope_id: row.scope_id == null ? null : String(row.scope_id),
    scope_label: String(row.scope_label),
    asset_kind: String(row.asset_kind),
    status: String(row.status),
    started_at: row.started_at,
    started_by_label: String(row.started_by_label ?? ''),
    closed_at: row.closed_at ?? null,
    closed_by_label: row.closed_by_label ? String(row.closed_by_label) : null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by_label: row.reviewed_by_label ? String(row.reviewed_by_label) : null,
    cancelled_at: row.cancelled_at ?? null,
    cancel_reason: row.cancel_reason ? String(row.cancel_reason) : null,
    row_version: Number(row.row_version ?? 1),
    expected_count: Number(row.expected_count ?? 0),
    present_count: Number(row.present_count ?? 0),
    missing_count: Number(row.missing_count ?? 0),
    exception_count: Number(row.exception_count ?? 0),
    open_discrepancy_count: Number(row.open_discrepancy_count ?? 0),
  }
}

export async function listStocktakeSessions(
  database: Pool,
  filters: { page: number; limit: number; status: string | null; scopeKind: string | null; query: string | null },
) {
  const where = ['1=1']
  const parameters: Array<string> = []
  if (filters.status) { where.push('s.status = ?'); parameters.push(filters.status) }
  if (filters.scopeKind) { where.push('s.scope_kind = ?'); parameters.push(filters.scopeKind) }
  if (filters.query) {
    where.push('(s.session_name LIKE ? OR s.scope_label LIKE ?)')
    const like = `%${filters.query}%`
    parameters.push(like, like)
  }
  const whereSql = where.join(' AND ')
  const offset = (filters.page - 1) * filters.limit
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(`
      SELECT s.*,
             (SELECT COUNT(*) FROM stocktake_expected_items e WHERE e.stocktake_session_id = s.stocktake_session_id) AS expected_count,
             (SELECT COUNT(DISTINCT CONCAT(sc.resolved_asset_kind, ':', sc.resolved_source_item_id))
                FROM stocktake_scans sc
               WHERE sc.stocktake_session_id = s.stocktake_session_id
                 AND sc.resolved_source_item_id IS NOT NULL
                 AND sc.stocktake_scan_id = (
                   SELECT MIN(sc2.stocktake_scan_id) FROM stocktake_scans sc2
                    WHERE sc2.stocktake_session_id = s.stocktake_session_id
                      AND sc2.resolved_asset_kind = sc.resolved_asset_kind
                      AND sc2.resolved_source_item_id = sc.resolved_source_item_id
                 )
                 AND EXISTS (
                   SELECT 1 FROM stocktake_expected_items e
                    WHERE e.stocktake_session_id = s.stocktake_session_id
                      AND e.asset_kind = sc.resolved_asset_kind
                      AND e.source_item_id = sc.resolved_source_item_id
                 )) AS present_count,
             (SELECT COUNT(*) FROM stocktake_discrepancies d
               WHERE d.stocktake_session_id = s.stocktake_session_id AND d.finding_code = 'missing') AS missing_count,
             (SELECT COUNT(*) FROM stocktake_discrepancies d
               WHERE d.stocktake_session_id = s.stocktake_session_id
                 AND d.finding_code <> 'missing') AS exception_count,
             (SELECT COUNT(*) FROM stocktake_discrepancies d
               WHERE d.stocktake_session_id = s.stocktake_session_id
                 AND d.status IN ('open', 'blocked')) AS open_discrepancy_count
        FROM stocktake_sessions s
       WHERE ${whereSql}
       ORDER BY s.started_at DESC, s.stocktake_session_id DESC
       LIMIT ${filters.limit} OFFSET ${offset}`, parameters),
    database.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS total FROM stocktake_sessions s WHERE ${whereSql}`, parameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(sessionDto),
    pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
  }
}

export async function lockStocktakeSession(connection: PoolConnection, sessionId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT * FROM stocktake_sessions WHERE stocktake_session_id = ? LIMIT 1 FOR UPDATE`, [sessionId])
  return rows[0] ?? null
}

export async function getStocktakeSession(database: Pool | PoolConnection, sessionId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(`
    SELECT s.*,
           (SELECT COUNT(*) FROM stocktake_expected_items e WHERE e.stocktake_session_id = s.stocktake_session_id) AS expected_count,
           (SELECT COUNT(DISTINCT CONCAT(sc.resolved_asset_kind, ':', sc.resolved_source_item_id))
              FROM stocktake_scans sc
             WHERE sc.stocktake_session_id = s.stocktake_session_id
               AND sc.resolved_source_item_id IS NOT NULL
               AND sc.stocktake_scan_id = (
                 SELECT MIN(sc2.stocktake_scan_id) FROM stocktake_scans sc2
                  WHERE sc2.stocktake_session_id = s.stocktake_session_id
                    AND sc2.resolved_asset_kind = sc.resolved_asset_kind
                    AND sc2.resolved_source_item_id = sc.resolved_source_item_id
               )
               AND EXISTS (
                 SELECT 1 FROM stocktake_expected_items e
                  WHERE e.stocktake_session_id = s.stocktake_session_id
                    AND e.asset_kind = sc.resolved_asset_kind
                    AND e.source_item_id = sc.resolved_source_item_id
               )) AS present_count,
           (SELECT COUNT(*) FROM stocktake_discrepancies d
             WHERE d.stocktake_session_id = s.stocktake_session_id AND d.finding_code = 'missing') AS missing_count,
           (SELECT COUNT(*) FROM stocktake_discrepancies d
             WHERE d.stocktake_session_id = s.stocktake_session_id AND d.finding_code <> 'missing') AS exception_count,
           (SELECT COUNT(*) FROM stocktake_discrepancies d
             WHERE d.stocktake_session_id = s.stocktake_session_id AND d.status IN ('open', 'blocked')) AS open_discrepancy_count
      FROM stocktake_sessions s
     WHERE s.stocktake_session_id = ?
     LIMIT 1`, [sessionId])
  return rows[0] ? sessionDto(rows[0]) : null
}

export async function insertStocktakeSession(
  connection: PoolConnection,
  input: {
    name: string
    scope: ScopeSnapshot
    actorUserId: number | null
    actorLabel: string
  },
) {
  const [result] = await connection.execute<ResultSetHeader>(`
    INSERT INTO stocktake_sessions
      (session_name, scope_kind, scope_id, scope_label, asset_kind, scope_snapshot,
       status, started_by_user_id, started_by_label)
    VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)`, [
    input.name,
    input.scope.scopeKind,
    input.scope.scopeId,
    input.scope.scopeLabel,
    input.scope.assetKind,
    JSON.stringify(input.scope),
    input.actorUserId,
    input.actorLabel,
  ])
  return Number(result.insertId)
}

export async function insertExpectedItemsBatch(
  connection: PoolConnection,
  sessionId: number,
  items: ExpectedItemInsert[],
) {
  if (items.length === 0) return
  const placeholders = items.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')
  const values: Array<string | number | null> = []
  for (const item of items) {
    values.push(
      sessionId, item.assetKind, item.sourceItemId, item.barcode, item.accessionNumber, item.title,
      item.categoryId, item.categoryName, item.homeShelfId, item.homeShelfLabel,
      item.homeShelfColumn, item.homeShelfRow, item.conditionSnapshot, item.availabilitySnapshot,
      item.lifecycleSnapshot, item.rowVersionSnapshot, item.loanStateSnapshot, item.reservationStateSnapshot,
    )
  }
  await connection.execute(`
    INSERT INTO stocktake_expected_items
      (stocktake_session_id, asset_kind, source_item_id, barcode, accession_number, title,
       category_id, category_name, home_shelf_id, home_shelf_label, home_shelf_column, home_shelf_row,
       condition_snapshot, availability_snapshot, lifecycle_snapshot, row_version_snapshot,
       loan_state_snapshot, reservation_state_snapshot)
    VALUES ${placeholders}`, values)
}

export async function findScanByRequestKey(connection: PoolConnection, sessionId: number, requestKey: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT * FROM stocktake_scans
     WHERE stocktake_session_id = ? AND request_key = ?
     LIMIT 1`, [sessionId, requestKey])
  return rows[0] ?? null
}

export async function countPriorResolvedScans(
  connection: PoolConnection,
  sessionId: number,
  assetKind: 'book' | 'research',
  sourceItemId: number,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT COUNT(*) AS total FROM stocktake_scans
     WHERE stocktake_session_id = ?
       AND resolved_asset_kind = ?
       AND resolved_source_item_id = ?`, [sessionId, assetKind, sourceItemId])
  return Number(rows[0]?.total ?? 0)
}

export async function insertStocktakeScan(
  connection: PoolConnection,
  input: {
    sessionId: number
    requestKey: string
    barcode: string
    resolvedAssetKind: 'book' | 'research' | null
    resolvedSourceItemId: number | null
    observedShelfId: number | null
    observedShelfLabel: string
    observedColumn: number | null
    observedRow: number | null
    source: string
    lookupSnapshot: unknown
    actorUserId: number | null
    actorLabel: string
  },
) {
  const [result] = await connection.execute<ResultSetHeader>(`
    INSERT INTO stocktake_scans
      (stocktake_session_id, request_key, entered_barcode, resolved_asset_kind, resolved_source_item_id,
       observed_shelf_id, observed_shelf_label, observed_shelf_column, observed_shelf_row,
       scan_source, lookup_snapshot, scanned_by_user_id, scanned_by_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    input.sessionId, input.requestKey, input.barcode, input.resolvedAssetKind, input.resolvedSourceItemId,
    input.observedShelfId, input.observedShelfLabel, input.observedColumn, input.observedRow,
    input.source, JSON.stringify(input.lookupSnapshot), input.actorUserId, input.actorLabel,
  ])
  return Number(result.insertId)
}

export async function findExpectedItem(
  connection: PoolConnection,
  sessionId: number,
  assetKind: 'book' | 'research',
  sourceItemId: number,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT * FROM stocktake_expected_items
     WHERE stocktake_session_id = ? AND asset_kind = ? AND source_item_id = ?
     LIMIT 1`, [sessionId, assetKind, sourceItemId])
  return rows[0] ?? null
}

export async function upsertDiscrepancy(
  connection: PoolConnection,
  input: {
    sessionId: number
    findingKey: string
    findingCode: string
    expectedItemId: number | null
    scanId: number | null
    evidence: unknown
  },
) {
  const sql = upsert(
    'stocktake_discrepancies',
    'stocktake_session_id, finding_key, finding_code, status, stocktake_expected_item_id, stocktake_scan_id, evidence_snapshot',
    '?,?,?,?,?,?,?',
    'stocktake_session_id, finding_key',
    `finding_code = ${excluded('finding_code')},
     stocktake_expected_item_id = ${excluded('stocktake_expected_item_id')},
     stocktake_scan_id = ${excluded('stocktake_scan_id')},
     evidence_snapshot = ${excluded('evidence_snapshot')},
     updated_at = NOW()`,
  )
  await connection.execute(sql, [
    input.sessionId, input.findingKey, input.findingCode, 'open',
    input.expectedItemId, input.scanId, JSON.stringify(input.evidence),
  ])
}

export async function listExpectedItems(
  database: Pool,
  sessionId: number,
  filters: { page: number; limit: number; query: string | null },
) {
  const where = ['stocktake_session_id = ?']
  const parameters: Array<string | number> = [sessionId]
  if (filters.query) {
    where.push('(barcode LIKE ? OR accession_number LIKE ? OR title LIKE ?)')
    const like = `%${filters.query}%`
    parameters.push(like, like, like)
  }
  const offset = (filters.page - 1) * filters.limit
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(`
      SELECT * FROM stocktake_expected_items
       WHERE ${where.join(' AND ')}
       ORDER BY title ASC, stocktake_expected_item_id ASC
       LIMIT ${filters.limit} OFFSET ${offset}`, parameters),
    database.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS total FROM stocktake_expected_items WHERE ${where.join(' AND ')}`, parameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map((row) => ({
      stocktake_expected_item_id: Number(row.stocktake_expected_item_id),
      asset_kind: String(row.asset_kind),
      source_item_id: Number(row.source_item_id),
      barcode: String(row.barcode),
      accession_number: String(row.accession_number),
      title: String(row.title),
      category_name: row.category_name ? String(row.category_name) : null,
      home_shelf_label: String(row.home_shelf_label),
      home_shelf_column: Number(row.home_shelf_column),
      home_shelf_row: Number(row.home_shelf_row),
      condition_snapshot: String(row.condition_snapshot),
      availability_snapshot: String(row.availability_snapshot),
      lifecycle_snapshot: String(row.lifecycle_snapshot),
      loan_state_snapshot: String(row.loan_state_snapshot),
    })),
    pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
  }
}

export async function listScans(
  database: Pool,
  sessionId: number,
  filters: { page: number; limit: number; query: string | null },
) {
  const where = ['stocktake_session_id = ?']
  const parameters: Array<string | number> = [sessionId]
  if (filters.query) {
    where.push('entered_barcode LIKE ?')
    parameters.push(`%${filters.query}%`)
  }
  const offset = (filters.page - 1) * filters.limit
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(`
      SELECT * FROM stocktake_scans
       WHERE ${where.join(' AND ')}
       ORDER BY scanned_at DESC, stocktake_scan_id DESC
       LIMIT ${filters.limit} OFFSET ${offset}`, parameters),
    database.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS total FROM stocktake_scans WHERE ${where.join(' AND ')}`, parameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map((row) => ({
      stocktake_scan_id: Number(row.stocktake_scan_id),
      request_key: String(row.request_key),
      entered_barcode: String(row.entered_barcode),
      resolved_asset_kind: row.resolved_asset_kind ? String(row.resolved_asset_kind) : null,
      resolved_source_item_id: row.resolved_source_item_id == null ? null : Number(row.resolved_source_item_id),
      observed_shelf_label: String(row.observed_shelf_label),
      observed_shelf_column: row.observed_shelf_column == null ? null : Number(row.observed_shelf_column),
      observed_shelf_row: row.observed_shelf_row == null ? null : Number(row.observed_shelf_row),
      scan_source: String(row.scan_source),
      scanned_by_label: String(row.scanned_by_label),
      scanned_at: row.scanned_at,
      lookup_snapshot: safeJson(row.lookup_snapshot),
    })),
    pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
  }
}

export async function listDiscrepancies(
  database: Pool,
  sessionId: number,
  filters: { page: number; limit: number; query: string | null; status: string | null; findingCode: string | null; assetKind: string | null },
) {
  const where = ['d.stocktake_session_id = ?']
  const parameters: Array<string | number> = [sessionId]
  if (filters.status) { where.push('d.status = ?'); parameters.push(filters.status) }
  if (filters.findingCode) { where.push('d.finding_code = ?'); parameters.push(filters.findingCode) }
  if (filters.assetKind) {
    where.push('e.asset_kind = ?')
    parameters.push(filters.assetKind)
  }
  if (filters.query) {
    where.push('(e.barcode LIKE ? OR e.accession_number LIKE ? OR e.title LIKE ? OR d.finding_code LIKE ?)')
    const like = `%${filters.query}%`
    parameters.push(like, like, like, like)
  }
  const offset = (filters.page - 1) * filters.limit
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(`
      SELECT d.*, e.asset_kind, e.barcode, e.accession_number, e.title, e.home_shelf_label
        FROM stocktake_discrepancies d
        LEFT JOIN stocktake_expected_items e ON e.stocktake_expected_item_id = d.stocktake_expected_item_id
       WHERE ${where.join(' AND ')}
       ORDER BY d.created_at ASC, d.stocktake_discrepancy_id ASC
       LIMIT ${filters.limit} OFFSET ${offset}`, parameters),
    database.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS total
        FROM stocktake_discrepancies d
        LEFT JOIN stocktake_expected_items e ON e.stocktake_expected_item_id = d.stocktake_expected_item_id
       WHERE ${where.join(' AND ')}`, parameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map((row) => ({
      stocktake_discrepancy_id: Number(row.stocktake_discrepancy_id),
      finding_key: String(row.finding_key),
      finding_code: String(row.finding_code),
      status: String(row.status),
      row_version: Number(row.row_version ?? 1),
      asset_kind: row.asset_kind ? String(row.asset_kind) : null,
      barcode: row.barcode ? String(row.barcode) : null,
      accession_number: row.accession_number ? String(row.accession_number) : null,
      title: row.title ? String(row.title) : null,
      home_shelf_label: row.home_shelf_label ? String(row.home_shelf_label) : null,
      evidence: safeJson(row.evidence_snapshot),
      created_at: row.created_at,
      updated_at: row.updated_at ?? null,
    })),
    pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
  }
}

export async function lockDiscrepancy(connection: PoolConnection, sessionId: number, discrepancyId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT d.*, e.asset_kind, e.source_item_id, e.barcode, e.accession_number, e.title,
           e.home_shelf_label, e.home_shelf_column, e.home_shelf_row, e.row_version_snapshot
      FROM stocktake_discrepancies d
      LEFT JOIN stocktake_expected_items e ON e.stocktake_expected_item_id = d.stocktake_expected_item_id
     WHERE d.stocktake_session_id = ? AND d.stocktake_discrepancy_id = ?
     LIMIT 1 ${forUpdate('d')}`, [sessionId, discrepancyId])
  return rows[0] ?? null
}

export async function insertResolutionEvent(
  connection: PoolConnection,
  input: {
    discrepancyId: number
    previousStatus: string
    nextStatus: string
    action: string
    reason: string
    beforeSnapshot: unknown
    afterSnapshot: unknown
    inventoryAuditEventId?: number | null
    researchAuditEventId?: number | null
    floorPlanEventId?: number | null
    actorUserId: number | null
    actorLabel: string
  },
) {
  await connection.execute(`
    INSERT INTO stocktake_resolution_events
      (stocktake_discrepancy_id, previous_status, next_status, action, reason,
       before_snapshot, after_snapshot, inventory_audit_event_id, research_inventory_audit_event_id,
       floor_plan_event_id, acted_by_user_id, acted_by_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    input.discrepancyId, input.previousStatus, input.nextStatus, input.action, input.reason,
    JSON.stringify(input.beforeSnapshot), JSON.stringify(input.afterSnapshot),
    input.inventoryAuditEventId ?? null, input.researchAuditEventId ?? null, input.floorPlanEventId ?? null,
    input.actorUserId, input.actorLabel,
  ])
}

export async function countOpenDiscrepancies(connection: PoolConnection, sessionId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT COUNT(*) AS total FROM stocktake_discrepancies
     WHERE stocktake_session_id = ? AND status IN ('open', 'blocked')`, [sessionId])
  return Number(rows[0]?.total ?? 0)
}

export async function hasStocktakeHistoryForBook(connection: PoolConnection, physicalCopyId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT 1 AS hit FROM stocktake_expected_items
     WHERE asset_kind = 'book' AND source_item_id = ?
     LIMIT 1`, [physicalCopyId])
  if (rows.length) return true
  const [scanRows] = await connection.execute<RowDataPacket[]>(`
    SELECT 1 AS hit FROM stocktake_scans
     WHERE resolved_asset_kind = 'book' AND resolved_source_item_id = ?
     LIMIT 1`, [physicalCopyId])
  return scanRows.length > 0
}

export async function hasStocktakeHistoryForResearch(connection: PoolConnection, researchInventoryId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT 1 AS hit FROM stocktake_expected_items
     WHERE asset_kind = 'research' AND source_item_id = ?
     LIMIT 1`, [researchInventoryId])
  if (rows.length) return true
  const [scanRows] = await connection.execute<RowDataPacket[]>(`
    SELECT 1 AS hit FROM stocktake_scans
     WHERE resolved_asset_kind = 'research' AND resolved_source_item_id = ?
     LIMIT 1`, [researchInventoryId])
  return scanRows.length > 0
}

function safeJson(value: unknown) {
  if (value == null) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return { raw: String(value) } }
}

export { sessionDto, safeJson }
