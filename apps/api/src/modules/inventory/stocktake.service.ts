import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { createFloorPlanRepository } from '../floor-plan/floor-plan.repository.ts'
import {
  findActiveLoan, findActiveReservation, lockInventoryCopy, recordInventoryAudit,
  synchronizeLegacyAvailability, type InventoryActor,
} from './inventory.repository.ts'
import type { ExpectedItemInsert, ScopeSnapshot } from './stocktake.repository.ts'
import {
  countOpenDiscrepancies, countPriorResolvedScans,
  findExpectedItem, findScanByRequestKey, getStocktakeSession, insertExpectedItemsBatch,
  insertResolutionEvent, insertStocktakeScan, insertStocktakeSession, listDiscrepancies,
  listExpectedItems, listScans, listStocktakeSessions, lockDiscrepancy, lockStocktakeSession,
  updateCloseSnapshots, upsertDiscrepancies, upsertDiscrepancy,
  type CloseSnapshot, type DiscrepancyUpsert,
} from './stocktake.repository.ts'
import type {
  StocktakeAssetKind, StocktakeResolveAction, StocktakeScopeKind,
} from './stocktake.validation.ts'
import {
  lockThesisInventory, recordThesisInventoryAudit,
} from './thesis-inventory.repository.ts'

const BATCH_SIZE = 100
const LOST_BOOK = 'Lost'
const LOST_RESEARCH = 'lost'

type CreateInput = {
  name: string
  scopeKind: StocktakeScopeKind
  scopeId: string | null
  assetKind: StocktakeAssetKind
}

async function loadShelfDirectory(connection: PoolConnection) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT id, label, column_count, row_count FROM floor_plan_shelves ORDER BY label`)
  return rows.map((row) => ({
    id: Number(row.id),
    label: String(row.label),
    columnCount: Number(row.column_count),
    rowCount: Number(row.row_count),
  }))
}

async function resolveScope(connection: PoolConnection, input: CreateInput): Promise<ScopeSnapshot> {
  const shelves = await loadShelfDirectory(connection)
  const byId = new Map(shelves.map((shelf) => [shelf.id, shelf]))
  const byLabel = new Map(shelves.map((shelf) => [shelf.label.toLowerCase(), shelf]))

  if (input.scopeKind === 'collection') {
    return {
      scopeKind: 'collection',
      scopeId: null,
      scopeLabel: 'Entire collection',
      assetKind: input.assetKind,
      shelfIds: shelves.map((shelf) => shelf.id),
      shelfLabels: shelves.map((shelf) => shelf.label),
      unplacedShelfIds: [],
      unplacedShelfLabels: [],
      roomMapRevision: null,
      categoryId: null,
      categoryName: null,
    }
  }

  if (input.scopeKind === 'shelf') {
    const shelfId = Number(input.scopeId)
    const shelf = byId.get(shelfId)
    if (!shelf) throw new HttpError(422, 'STOCKTAKE_SCOPE_INVALID', 'Select an existing managed shelf.')
    return {
      scopeKind: 'shelf',
      scopeId: String(shelf.id),
      scopeLabel: shelf.label,
      assetKind: input.assetKind,
      shelfIds: [shelf.id],
      shelfLabels: [shelf.label],
      unplacedShelfIds: [],
      unplacedShelfLabels: [],
      roomMapRevision: null,
      categoryId: null,
      categoryName: null,
    }
  }

  if (input.scopeKind === 'category') {
    const categoryId = Number(input.scopeId)
    const [rows] = await connection.execute<RowDataPacket[]>(`
      SELECT category_id, category_name, shelf_location FROM categories WHERE category_id = ? LIMIT 1`, [categoryId])
    const category = rows[0]
    if (!category) throw new HttpError(422, 'STOCKTAKE_SCOPE_INVALID', 'Select an existing category.')
    const label = String(category.shelf_location ?? '').trim()
    const shelf = label ? byLabel.get(label.toLowerCase()) : null
    return {
      scopeKind: 'category',
      scopeId: String(category.category_id),
      scopeLabel: String(category.category_name),
      assetKind: input.assetKind,
      shelfIds: shelf ? [shelf.id] : [],
      shelfLabels: shelf ? [shelf.label] : label ? [label] : [],
      unplacedShelfIds: [],
      unplacedShelfLabels: [],
      roomMapRevision: null,
      categoryId: Number(category.category_id),
      categoryName: String(category.category_name),
    }
  }

  const [stateRows] = await connection.execute<RowDataPacket[]>(`
    SELECT revision, published FROM floor_plan_state WHERE id = 1 LIMIT 1`)
  const state = stateRows[0]
  if (!state?.published) {
    throw new HttpError(422, 'STOCKTAKE_SCOPE_INVALID', 'Publish a floor plan before counting by room.')
  }
  const layout = JSON.parse(String(state.published)) as {
    areas?: Array<{ id: string; name: string }>
    objects?: Array<{ kind?: string; areaId?: string; shelfId?: number; label?: string }>
  }
  const area = (layout.areas ?? []).find((entry) => entry.id === input.scopeId)
  if (!area) throw new HttpError(422, 'STOCKTAKE_SCOPE_INVALID', 'Select a published floor-plan area (room).')
  const placed = (layout.objects ?? []).filter((object) => object.kind === 'shelf' && object.areaId === area.id && object.shelfId)
  const shelfIds = placed.map((object) => Number(object.shelfId)).filter((id) => byId.has(id))
  if (shelfIds.length === 0) {
    throw new HttpError(422, 'STOCKTAKE_SCOPE_INVALID', 'This room has no placed shelves on the published floor plan.')
  }
  const placedSet = new Set(shelfIds)
  const unplaced = shelves.filter((shelf) => !placedSet.has(shelf.id))
  return {
    scopeKind: 'room',
    scopeId: area.id,
    scopeLabel: area.name,
    assetKind: input.assetKind,
    shelfIds,
    shelfLabels: shelfIds.map((id) => byId.get(id)!.label),
    unplacedShelfIds: unplaced.map((shelf) => shelf.id),
    unplacedShelfLabels: unplaced.map((shelf) => shelf.label),
    roomMapRevision: Number(state.revision),
    categoryId: null,
    categoryName: null,
  }
}

// Stocktake only reads loan state; plain SELECTs (no FOR UPDATE) keep the lock order of checkout
// (copy, then loan) and let a count run beside circulation. One query per call, not per item.
async function loanStatesByMaterial(connection: PoolConnection, materialIds: Array<number | null>) {
  const states = new Map<number, string>()
  const ids = [...new Set(materialIds.filter((id): id is number => id != null))]
  if (ids.length === 0) return states
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT material_id, transaction_status
      FROM borrow_transactions
     WHERE material_id = ANY(?::bigint[]) AND transaction_status IN ('Borrowed', 'Overdue')
     ORDER BY transaction_id ASC`, [ids])
  for (const row of rows) states.set(Number(row.material_id), String(row.transaction_status).toLowerCase())
  return states
}

async function bookLoanState(connection: PoolConnection, materialId: number | null) {
  if (materialId == null) return 'none'
  return (await loanStatesByMaterial(connection, [materialId])).get(materialId) ?? 'none'
}

async function researchLoanStates(connection: PoolConnection, barcodes: string[]) {
  const states = new Map<string, string>()
  const unique = [...new Set(barcodes)]
  if (unique.length === 0) return states
  const [materialRows] = await connection.execute<RowDataPacket[]>(`
    SELECT material_id, barcode FROM materials WHERE barcode = ANY(?::text[]) ORDER BY material_id DESC`, [unique])
  // Later rows overwrite earlier ones, so the lowest material_id wins per barcode.
  const materialByBarcode = new Map(materialRows.map((row) => [String(row.barcode), Number(row.material_id)]))
  const loans = await loanStatesByMaterial(connection, [...materialByBarcode.values()])
  for (const [barcode, materialId] of materialByBarcode) if (loans.has(materialId)) states.set(barcode, 'borrowed')
  return states
}

async function researchLoanState(connection: PoolConnection, barcode: string) {
  return (await researchLoanStates(connection, [barcode])).get(barcode) ?? 'none'
}

async function collectExpectedItems(connection: PoolConnection, scope: ScopeSnapshot): Promise<ExpectedItemInsert[]> {
  const items: ExpectedItemInsert[] = []
  const shelfLabels = scope.shelfLabels
  const includeBooks = scope.assetKind === 'book' || scope.assetKind === 'both'
  const includeResearch = scope.assetKind === 'research' || scope.assetKind === 'both'

  if (includeBooks && !(scope.scopeKind === 'shelf' || scope.scopeKind === 'room') || (includeBooks && shelfLabels.length > 0)) {
    const where = ["pc.lifecycle_status = 'Active'", "t.lifecycle_status = 'Active'"]
    const parameters: Array<string | number> = []
    if (scope.scopeKind === 'shelf' || scope.scopeKind === 'room') {
      where.push(`pc.shelf_location IN (${shelfLabels.map(() => '?').join(',')})`)
      parameters.push(...shelfLabels)
    } else if (scope.scopeKind === 'category' && scope.categoryId != null) {
      where.push('t.category_id = ?')
      parameters.push(scope.categoryId)
    }
    const [rows] = await connection.execute<RowDataPacket[]>(`
      SELECT pc.physical_copy_id, pc.material_id, pc.barcode, pc.accession_number, t.title,
             t.category_id, c.category_name, pc.shelf_location, pc.shelf_column, pc.shelf_row,
             pc.condition_status, pc.availability_status, pc.lifecycle_status, pc.row_version,
             s.id AS home_shelf_id
        FROM physical_copies pc
        JOIN titles t ON t.title_id = pc.title_id
        LEFT JOIN categories c ON c.category_id = t.category_id
        LEFT JOIN floor_plan_shelves s ON s.label = pc.shelf_location
       WHERE ${where.join(' AND ')}
       ORDER BY pc.physical_copy_id ASC`, parameters)
    const loans = await loanStatesByMaterial(connection, rows.map((row) => (row.material_id == null ? null : Number(row.material_id))))
    for (const row of rows) {
      const materialId = row.material_id == null ? null : Number(row.material_id)
      items.push({
        assetKind: 'book',
        sourceItemId: Number(row.physical_copy_id),
        barcode: String(row.barcode),
        accessionNumber: String(row.accession_number),
        title: String(row.title),
        categoryId: row.category_id == null ? null : Number(row.category_id),
        categoryName: row.category_name ? String(row.category_name) : null,
        homeShelfId: row.home_shelf_id == null ? null : Number(row.home_shelf_id),
        homeShelfLabel: String(row.shelf_location ?? ''),
        homeShelfColumn: Number(row.shelf_column ?? 1),
        homeShelfRow: Number(row.shelf_row ?? 1),
        conditionSnapshot: String(row.condition_status),
        availabilitySnapshot: String(row.availability_status),
        lifecycleSnapshot: String(row.lifecycle_status),
        rowVersionSnapshot: Number(row.row_version ?? 1),
        loanStateSnapshot: materialId == null ? 'none' : loans.get(materialId) ?? 'none',
        reservationStateSnapshot: 'none',
      })
    }
  }

  if (includeResearch && (!(scope.scopeKind === 'shelf' || scope.scopeKind === 'room') || shelfLabels.length > 0)) {
    const where = ["ri.lifecycle_status = 'Active'"]
    const parameters: Array<string | number> = []
    if (scope.scopeKind === 'shelf' || scope.scopeKind === 'room') {
      where.push(`ri.shelf_location IN (${shelfLabels.map(() => '?').join(',')})`)
      parameters.push(...shelfLabels)
    } else if (scope.scopeKind === 'category' && scope.categoryId != null) {
      where.push('ri.title_id IS NOT NULL AND t.category_id = ?')
      parameters.push(scope.categoryId)
    }
    const [rows] = await connection.execute<RowDataPacket[]>(`
      SELECT ri.research_inventory_id, ri.barcode, ri.accession_number, ri.title, ri.title_id,
             ri.shelf_location, ri.shelf_column, ri.shelf_row, ri.condition_state,
             ri.availability_status, ri.lifecycle_status, ri.row_version,
             s.id AS home_shelf_id, c.category_id, c.category_name
        FROM research_inventory ri
        LEFT JOIN titles t ON t.title_id = ri.title_id
        LEFT JOIN categories c ON c.category_id = t.category_id
        LEFT JOIN floor_plan_shelves s ON s.label = ri.shelf_location
       WHERE ${where.join(' AND ')}
       ORDER BY ri.research_inventory_id ASC`, parameters)
    const loans = await researchLoanStates(connection, rows.map((row) => String(row.barcode)))
    for (const row of rows) {
      items.push({
        assetKind: 'research',
        sourceItemId: Number(row.research_inventory_id),
        barcode: String(row.barcode),
        accessionNumber: String(row.accession_number),
        title: String(row.title),
        categoryId: row.category_id == null ? null : Number(row.category_id),
        categoryName: row.category_name ? String(row.category_name) : null,
        homeShelfId: row.home_shelf_id == null ? null : Number(row.home_shelf_id),
        homeShelfLabel: String(row.shelf_location ?? ''),
        homeShelfColumn: Number(row.shelf_column ?? 1),
        homeShelfRow: Number(row.shelf_row ?? 1),
        conditionSnapshot: String(row.condition_state),
        availabilitySnapshot: String(row.availability_status),
        lifecycleSnapshot: String(row.lifecycle_status),
        rowVersionSnapshot: Number(row.row_version ?? 1),
        loanStateSnapshot: loans.get(String(row.barcode)) ?? 'none',
        reservationStateSnapshot: 'none',
      })
    }
  }

  return items
}

export async function previewStocktakeScope(input: CreateInput, database: Pool = db) {
  const connection = await database.getConnection()
  try {
    const scope = await resolveScope(connection, input)
    const items = await collectExpectedItems(connection, scope)
    return {
      scope,
      expected_count: items.length,
      book_count: items.filter((item) => item.assetKind === 'book').length,
      research_count: items.filter((item) => item.assetKind === 'research').length,
      unplaced_shelves: scope.unplacedShelfLabels,
    }
  } finally { connection.release() }
}

export async function createStocktakeSession(input: CreateInput, actor: InventoryActor, database: Pool = db) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const scope = await resolveScope(connection, input)
    const items = await collectExpectedItems(connection, scope)
    const sessionId = await insertStocktakeSession(connection, {
      name: input.name, scope, actorUserId: actor.userId, actorLabel: actor.label,
    })
    for (let index = 0; index < items.length; index += BATCH_SIZE) {
      await insertExpectedItemsBatch(connection, sessionId, items.slice(index, index + BATCH_SIZE))
    }
    await connection.commit()
    const session = await getStocktakeSession(database, sessionId)
    return { ...session, expected_count: items.length }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export const stocktakeSessions = (
  filters: { page: number; limit: number; status: string | null; scopeKind: string | null; query: string | null },
  database: Pool = db,
) => listStocktakeSessions(database, filters)

export async function stocktakeSessionDetail(sessionId: number, database: Pool = db) {
  const session = await getStocktakeSession(database, sessionId)
  if (!session) throw new HttpError(404, 'STOCKTAKE_NOT_FOUND', 'Stocktake session not found.')
  return session
}

export const stocktakeExpected = (
  sessionId: number,
  filters: { page: number; limit: number; query: string | null },
  database: Pool = db,
) => listExpectedItems(database, sessionId, filters)

export const stocktakeScans = (
  sessionId: number,
  filters: { page: number; limit: number; query: string | null },
  database: Pool = db,
) => listScans(database, sessionId, filters)

export const stocktakeDiscrepancies = (
  sessionId: number,
  filters: { page: number; limit: number; query: string | null; status: string | null; findingCode: string | null; assetKind: string | null },
  database: Pool = db,
) => listDiscrepancies(database, sessionId, filters)

async function requireInProgress(connection: PoolConnection, sessionId: number) {
  const session = await lockStocktakeSession(connection, sessionId)
  if (!session) throw new HttpError(404, 'STOCKTAKE_NOT_FOUND', 'Stocktake session not found.')
  if (String(session.status) !== 'in_progress') {
    throw new HttpError(409, 'STOCKTAKE_NOT_OPEN', 'Only an in-progress stocktake accepts this action.', {
      status: String(session.status),
    })
  }
  return session
}

async function lookupBarcode(connection: PoolConnection, barcode: string) {
  const [bookRows] = await connection.execute<RowDataPacket[]>(`
    SELECT pc.physical_copy_id AS source_item_id, 'book' AS asset_kind, pc.barcode, pc.accession_number,
           t.title, pc.shelf_location, pc.shelf_column, pc.shelf_row, pc.condition_status AS condition_state,
           pc.availability_status, pc.lifecycle_status, pc.row_version, pc.material_id,
           s.id AS home_shelf_id
      FROM physical_copies pc
      JOIN titles t ON t.title_id = pc.title_id
      LEFT JOIN floor_plan_shelves s ON s.label = pc.shelf_location
     WHERE pc.barcode = ?
     LIMIT 1`, [barcode])
  const [researchRows] = await connection.execute<RowDataPacket[]>(`
    SELECT ri.research_inventory_id AS source_item_id, 'research' AS asset_kind, ri.barcode, ri.accession_number,
           ri.title, ri.shelf_location, ri.shelf_column, ri.shelf_row, ri.condition_state,
           ri.availability_status, ri.lifecycle_status, ri.row_version, NULL AS material_id,
           s.id AS home_shelf_id
      FROM research_inventory ri
      LEFT JOIN floor_plan_shelves s ON s.label = ri.shelf_location
     WHERE ri.barcode = ?
     LIMIT 1`, [barcode])
  return {
    book: bookRows[0] ?? null,
    research: researchRows[0] ?? null,
  }
}

async function verifyBookOnConnection(connection: PoolConnection, barcode: string, actor: InventoryActor) {
  const copy = await lockInventoryCopy(connection, barcode)
  if (!copy || copy.lifecycle_status !== 'Active') return null
  await connection.execute(
    'UPDATE physical_copies SET last_scanned_at = NOW(), row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?',
    [copy.physical_copy_id],
  )
  await recordInventoryAudit(connection, copy, 'Verified', actor)
  return copy
}

async function verifyResearchOnConnection(connection: PoolConnection, barcode: string, actor: InventoryActor) {
  const thesis = await lockThesisInventory(connection, barcode)
  if (!thesis || thesis.lifecycle_status !== 'Active') return null
  await connection.execute(`
    UPDATE research_inventory
       SET last_audited_at = NOW(), row_version = row_version + 1, updated_at = NOW()
     WHERE research_inventory_id = ?`, [thesis.research_inventory_id])
  await recordThesisInventoryAudit(
    connection, thesis, 'verified', actor, thesis.condition_state, thesis.availability_status,
  )
  return thesis
}

export async function recordStocktakeScan(
  sessionId: number,
  input: {
    requestKey: string
    barcode: string
    observedShelfId: number
    observedColumn: number | null
    observedRow: number | null
    source: string
  },
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await requireInProgress(connection, sessionId)
    const existing = await findScanByRequestKey(connection, sessionId, input.requestKey)
    if (existing) {
      await connection.commit()
      return {
        stocktake_scan_id: Number(existing.stocktake_scan_id),
        duplicate_request: true,
        classification: 'request_replay',
        entered_barcode: String(existing.entered_barcode),
      }
    }

    const shelves = await loadShelfDirectory(connection)
    const observed = shelves.find((shelf) => shelf.id === input.observedShelfId)
    if (!observed) throw new HttpError(422, 'STOCKTAKE_SHELF_INVALID', 'Select a managed shelf for this scan.')
    if (input.observedColumn != null && (input.observedColumn < 1 || input.observedColumn > observed.columnCount)) {
      throw new HttpError(422, 'STOCKTAKE_COMPARTMENT_INVALID', 'Observed column is outside this shelf grid.')
    }
    if (input.observedRow != null && (input.observedRow < 1 || input.observedRow > observed.rowCount)) {
      throw new HttpError(422, 'STOCKTAKE_COMPARTMENT_INVALID', 'Observed row is outside this shelf grid.')
    }

    const matches = await lookupBarcode(connection, input.barcode)
    const classifications: string[] = []
    let resolvedAssetKind: 'book' | 'research' | null = null
    let resolvedSourceItemId: number | null = null
    let matched: RowDataPacket | null = null

    if (matches.book && matches.research) {
      classifications.push('unknown')
      matched = null
    } else if (matches.book) {
      matched = matches.book
      resolvedAssetKind = 'book'
      resolvedSourceItemId = Number(matches.book.source_item_id)
    } else if (matches.research) {
      matched = matches.research
      resolvedAssetKind = 'research'
      resolvedSourceItemId = Number(matches.research.source_item_id)
    } else {
      classifications.push('unknown')
    }

    const loanState = matched
      ? (resolvedAssetKind === 'book'
        ? await bookLoanState(connection, matched.material_id == null ? null : Number(matched.material_id))
        : await researchLoanState(connection, input.barcode))
      : 'none'

    const lookupSnapshot = {
      book: matches.book,
      research: matches.research,
      observed: {
        shelfId: observed.id,
        shelfLabel: observed.label,
        column: input.observedColumn,
        row: input.observedRow,
      },
      loanState,
    }

    let isFirstPresent = false
    if (matched && resolvedAssetKind && resolvedSourceItemId != null) {
      const prior = await countPriorResolvedScans(connection, sessionId, resolvedAssetKind, resolvedSourceItemId)
      if (prior > 0) classifications.push('duplicate')
      const expected = await findExpectedItem(connection, sessionId, resolvedAssetKind, resolvedSourceItemId)
      const lifecycle = String(matched.lifecycle_status)
      if (lifecycle !== 'Active') {
        classifications.push('archived')
      } else if (!expected) {
        classifications.push('out_of_scope')
      } else if (prior === 0) {
        isFirstPresent = true
        const homeLabel = String(expected.home_shelf_label)
        const homeColumn = Number(expected.home_shelf_column)
        const homeRow = Number(expected.home_shelf_row)
        const wrongShelf = observed.label !== homeLabel
        const wrongCompartment = (input.observedColumn != null && input.observedColumn !== homeColumn)
          || (input.observedRow != null && input.observedRow !== homeRow)
        if (wrongShelf || wrongCompartment) classifications.push('wrong_location')
        if (loanState !== 'none') classifications.push('borrowed_but_found')
        const condition = String(matched.condition_state)
        if (condition === LOST_BOOK || condition === LOST_RESEARCH) classifications.push('lost_but_found')
      }
    }

    const scanId = await insertStocktakeScan(connection, {
      sessionId,
      requestKey: input.requestKey,
      barcode: input.barcode,
      resolvedAssetKind,
      resolvedSourceItemId,
      observedShelfId: observed.id,
      observedShelfLabel: observed.label,
      observedColumn: input.observedColumn,
      observedRow: input.observedRow,
      source: input.source,
      lookupSnapshot,
      actorUserId: actor.userId,
      actorLabel: actor.label,
    })

    if (isFirstPresent && resolvedAssetKind === 'book') {
      await verifyBookOnConnection(connection, input.barcode, actor)
    }
    if (isFirstPresent && resolvedAssetKind === 'research') {
      await verifyResearchOnConnection(connection, input.barcode, actor)
    }

    const expected = matched && resolvedAssetKind && resolvedSourceItemId != null
      ? await findExpectedItem(connection, sessionId, resolvedAssetKind, resolvedSourceItemId)
      : null

    for (const code of classifications) {
      const findingKey = expected
        ? `${code}:${resolvedAssetKind}:${resolvedSourceItemId}`
        : `${code}:scan:${input.requestKey}`
      await upsertDiscrepancy(connection, {
        sessionId,
        findingKey,
        findingCode: code,
        expectedItemId: expected ? Number(expected.stocktake_expected_item_id) : null,
        scanId,
        evidence: { lookupSnapshot, classifications },
      })
    }

    await connection.commit()
    return {
      stocktake_scan_id: scanId,
      duplicate_request: false,
      classification: classifications[0] ?? (isFirstPresent ? 'present' : 'recorded'),
      classifications,
      entered_barcode: input.barcode,
      resolved_asset_kind: resolvedAssetKind,
      resolved_source_item_id: resolvedSourceItemId,
      title: matched ? String(matched.title) : null,
      observed_shelf_label: observed.label,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function closeStocktakeSession(sessionId: number, actor: InventoryActor, database: Pool = db) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const session = await lockStocktakeSession(connection, sessionId)
    if (!session) throw new HttpError(404, 'STOCKTAKE_NOT_FOUND', 'Stocktake session not found.')
    if (String(session.status) === 'closed' || String(session.status) === 'reviewed') {
      await connection.commit()
      return getStocktakeSession(database, sessionId)
    }
    if (String(session.status) !== 'in_progress') {
      throw new HttpError(409, 'STOCKTAKE_NOT_OPEN', 'Only an in-progress stocktake can be closed.')
    }

    const [expectedRows] = await connection.execute<RowDataPacket[]>(`
      SELECT * FROM stocktake_expected_items WHERE stocktake_session_id = ? ORDER BY stocktake_expected_item_id`, [sessionId])
    const [firstScans] = await connection.execute<RowDataPacket[]>(`
      SELECT resolved_asset_kind, resolved_source_item_id, MIN(stocktake_scan_id) AS first_scan_id
        FROM stocktake_scans
       WHERE stocktake_session_id = ? AND resolved_source_item_id IS NOT NULL
       GROUP BY resolved_asset_kind, resolved_source_item_id`, [sessionId])
    const present = new Set(firstScans.map((row) => `${row.resolved_asset_kind}:${row.resolved_source_item_id}`))

    const bookIds = expectedRows.filter((row) => String(row.asset_kind) === 'book').map((row) => Number(row.source_item_id))
    const researchIds = expectedRows.filter((row) => String(row.asset_kind) !== 'book').map((row) => Number(row.source_item_id))
    const liveBooks = new Map<number, RowDataPacket>()
    if (bookIds.length > 0) {
      const [rows] = await connection.execute<RowDataPacket[]>(`
        SELECT physical_copy_id, lifecycle_status, row_version, condition_status, material_id
          FROM physical_copies WHERE physical_copy_id = ANY(?::bigint[])`, [bookIds])
      for (const row of rows) liveBooks.set(Number(row.physical_copy_id), row)
    }
    const liveResearch = new Map<number, RowDataPacket>()
    if (researchIds.length > 0) {
      const [rows] = await connection.execute<RowDataPacket[]>(`
        SELECT research_inventory_id, lifecycle_status, row_version, condition_state, barcode
          FROM research_inventory WHERE research_inventory_id = ANY(?::bigint[])`, [researchIds])
      for (const row of rows) liveResearch.set(Number(row.research_inventory_id), row)
    }
    const bookLoans = await loanStatesByMaterial(
      connection, [...liveBooks.values()].map((row) => (row.material_id == null ? null : Number(row.material_id))),
    )
    const researchLoans = await researchLoanStates(connection, [...liveResearch.values()].map((row) => String(row.barcode)))

    const snapshots: CloseSnapshot[] = []
    const findings: DiscrepancyUpsert[] = []
    for (const expected of expectedRows) {
      const isBook = String(expected.asset_kind) === 'book'
      const kind = isBook ? 'book' : 'research'
      const live = isBook ? liveBooks.get(Number(expected.source_item_id)) : liveResearch.get(Number(expected.source_item_id))
      const expectedItemId = Number(expected.stocktake_expected_item_id)
      const finding = (code: string, evidence: Record<string, unknown>) => findings.push({
        sessionId, findingKey: `${code}:${kind}:${expected.source_item_id}`, findingCode: code,
        expectedItemId, scanId: null, evidence,
      })
      const scanned = present.has(`${expected.asset_kind}:${expected.source_item_id}`)
      if (!live) {
        // The live row is gone (hard delete outside the guarded paths): freeze it as archived instead of skipping it.
        const loan = String(expected.loan_state_snapshot)
        snapshots.push({ id: expectedItemId, lifecycle: 'Removed', loan, rowVersion: Number(expected.row_version_snapshot) })
        if (!scanned) finding('archived', { closeLifecycle: 'Removed', closeLoan: loan, liveRowMissing: true })
        continue
      }
      const closeLifecycle = String(live.lifecycle_status)
      const closeLoan = isBook
        ? (live.material_id == null ? 'none' : bookLoans.get(Number(live.material_id)) ?? 'none')
        : researchLoans.get(String(live.barcode)) ?? 'none'
      snapshots.push({ id: expectedItemId, lifecycle: closeLifecycle, loan: closeLoan, rowVersion: Number(live.row_version) })
      if (scanned) continue
      const evidence = { closeLifecycle, closeLoan }
      const condition = String(isBook ? live.condition_status : live.condition_state)
      if (closeLifecycle !== 'Active') finding('archived', evidence)
      else if (condition === (isBook ? LOST_BOOK : LOST_RESEARCH)) finding('known_lost', evidence)
      else if (closeLoan !== 'none') finding('borrowed_out', evidence)
      else finding('missing', evidence)
    }
    await updateCloseSnapshots(connection, snapshots)
    await upsertDiscrepancies(connection, findings)

    await connection.execute(`
      UPDATE stocktake_sessions
         SET status = 'closed', closed_at = NOW(), closed_by_user_id = ?, closed_by_label = ?,
             row_version = row_version + 1, updated_at = NOW()
       WHERE stocktake_session_id = ?`, [actor.userId, actor.label, sessionId])
    await connection.commit()
    return getStocktakeSession(database, sessionId)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function cancelStocktakeSession(
  sessionId: number,
  reason: string,
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await requireInProgress(connection, sessionId)
    await connection.execute(`
      UPDATE stocktake_sessions
         SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = ?, cancelled_by_label = ?,
             cancel_reason = ?, row_version = row_version + 1, updated_at = NOW()
       WHERE stocktake_session_id = ?`, [actor.userId, actor.label, reason, sessionId])
    await connection.commit()
    return getStocktakeSession(database, sessionId)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function reviewStocktakeSession(sessionId: number, actor: InventoryActor, database: Pool = db) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const session = await lockStocktakeSession(connection, sessionId)
    if (!session) throw new HttpError(404, 'STOCKTAKE_NOT_FOUND', 'Stocktake session not found.')
    if (String(session.status) !== 'closed') {
      throw new HttpError(409, 'STOCKTAKE_NOT_CLOSED', 'Mark the session closed before review completion.')
    }
    const openCount = await countOpenDiscrepancies(connection, sessionId)
    if (openCount > 0) {
      throw new HttpError(409, 'STOCKTAKE_OPEN_FINDINGS', 'Resolve or dismiss every open finding before review.', {
        openCount,
      })
    }
    await connection.execute(`
      UPDATE stocktake_sessions
         SET status = 'reviewed', reviewed_at = NOW(), reviewed_by_user_id = ?, reviewed_by_label = ?,
             row_version = row_version + 1, updated_at = NOW()
       WHERE stocktake_session_id = ?`, [actor.userId, actor.label, sessionId])
    await connection.commit()
    return getStocktakeSession(database, sessionId)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

const CORRECTABLE_CONDITIONS = new Set(['Good', 'Fair', 'For Repair', 'Damaged'])

// Spec Q2: the Librarian's resolve decision is the only thing that changes a lost copy; it writes the normal inventory audit.
// shortcut: books only; research copies still change in Inventory first, then confirm or dismiss.
async function applyLiveCorrection(
  connection: PoolConnection,
  discrepancy: RowDataPacket,
  input: { action: StocktakeResolveAction; condition: string | null; availability: string | null },
  actor: InventoryActor,
): Promise<Record<string, unknown>> {
  if (String(discrepancy.asset_kind) !== 'book' || !discrepancy.barcode) {
    throw new HttpError(
      422,
      'STOCKTAKE_CORRECTION_EXTERNAL',
      'Apply this change in Inventory first, then confirm or dismiss this finding with the matching live state.',
    )
  }
  const copy = await lockInventoryCopy(connection, String(discrepancy.barcode))
  // The snapshot barcode may have moved to another copy since the count; never change a different row.
  if (!copy || Number(copy.physical_copy_id) !== Number(discrepancy.source_item_id) || copy.lifecycle_status !== 'Active') {
    throw new HttpError(409, 'STOCKTAKE_LIVE_STATE_CHANGED', 'The live copy is no longer the counted active copy.')
  }
  // Lock order matches checkout: copy first, then loan, then reservation.
  const loan = await findActiveLoan(connection, copy.circulation_material_id)
  const reservation = await findActiveReservation(connection, Number(copy.physical_copy_id))
  if (loan || reservation || copy.availability_status === 'Borrowed' || copy.availability_status === 'Reserved') {
    throw new HttpError(409, 'STOCKTAKE_LIVE_STATE_CHANGED', 'The copy is borrowed or reserved; handle it in Circulation first.')
  }
  const wasLost = copy.condition_status === LOST_BOOK
  let nextCondition = copy.condition_status
  let nextAvailability = copy.availability_status
  if (input.action === 'apply_condition') {
    if (!input.condition || !CORRECTABLE_CONDITIONS.has(input.condition)) {
      throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'Choose Good, Fair, For Repair or Damaged.', {
        errors: { condition: 'Choose Good, Fair, For Repair or Damaged.' },
      })
    }
    nextCondition = input.condition
    if (wasLost && copy.availability_status === 'Unavailable') nextAvailability = 'Available'
  } else {
    if (input.availability !== 'Available' && input.availability !== 'Unavailable') {
      throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'Choose Available or Unavailable.', {
        errors: { availability: 'Choose Available or Unavailable.' },
      })
    }
    if (wasLost && input.availability === 'Available') {
      throw new HttpError(422, 'LOST_COPY_MUST_REMAIN_UNAVAILABLE', 'Change the condition from Lost first.')
    }
    nextAvailability = input.availability
  }
  await connection.execute(`
    UPDATE physical_copies
       SET condition_status = ?, availability_status = ?, row_version = row_version + 1, updated_at = NOW()
     WHERE physical_copy_id = ?`, [nextCondition, nextAvailability, copy.physical_copy_id])
  if (nextAvailability !== copy.availability_status) {
    await synchronizeLegacyAvailability(connection, copy.material_id, nextAvailability as 'Available' | 'Unavailable')
  }
  await recordInventoryAudit(
    connection, copy, input.action === 'apply_condition' ? 'Condition Changed' : 'Availability Changed',
    actor, nextCondition, nextAvailability,
  )
  return { action: input.action, condition_status: nextCondition, availability_status: nextAvailability }
}

export async function resolveStocktakeDiscrepancy(
  sessionId: number,
  discrepancyId: number,
  input: {
    expectedRowVersion: number
    action: StocktakeResolveAction
    reason: string
    condition: string | null
    availability: string | null
  },
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const session = await lockStocktakeSession(connection, sessionId)
    if (!session) throw new HttpError(404, 'STOCKTAKE_NOT_FOUND', 'Stocktake session not found.')
    if (!['closed', 'reviewed'].includes(String(session.status))) {
      throw new HttpError(409, 'STOCKTAKE_NOT_CLOSED', 'Close the stocktake before resolving findings.')
    }
    if (String(session.status) === 'reviewed') {
      throw new HttpError(409, 'STOCKTAKE_ALREADY_REVIEWED', 'This stocktake is already marked reviewed.')
    }
    const discrepancy = await lockDiscrepancy(connection, sessionId, discrepancyId)
    if (!discrepancy) throw new HttpError(404, 'STOCKTAKE_DISCREPANCY_NOT_FOUND', 'Finding not found.')
    if (Number(discrepancy.row_version) !== input.expectedRowVersion) {
      throw new HttpError(409, 'STOCKTAKE_STALE', 'This finding changed. Reload and try again.', {
        row_version: Number(discrepancy.row_version),
      })
    }
    if (!['open', 'blocked'].includes(String(discrepancy.status))) {
      throw new HttpError(409, 'STOCKTAKE_ALREADY_RESOLVED', 'This finding already has a decision.')
    }

    const beforeSnapshot = {
      status: String(discrepancy.status),
      finding_code: String(discrepancy.finding_code),
      evidence: discrepancy.evidence_snapshot,
    }
    let nextStatus: 'resolved' | 'dismissed' = input.action === 'dismiss' ? 'dismissed' : 'resolved'
    let afterSnapshot: Record<string, unknown> = { action: input.action }

    if (input.action === 'apply_condition' || input.action === 'apply_availability') {
      afterSnapshot = await applyLiveCorrection(connection, discrepancy, input, actor)
    }

    if (input.action === 'confirm_found_at_home' && discrepancy.asset_kind && discrepancy.source_item_id != null) {
      if (String(discrepancy.asset_kind) === 'book') {
        const [live] = await connection.execute<RowDataPacket[]>(`
          SELECT shelf_location, shelf_column, shelf_row, lifecycle_status
            FROM physical_copies WHERE physical_copy_id = ? LIMIT 1 FOR UPDATE`, [discrepancy.source_item_id])
        const row = live[0]
        if (!row || String(row.lifecycle_status) !== 'Active') {
          throw new HttpError(409, 'STOCKTAKE_LIVE_STATE_CHANGED', 'The live copy is no longer active at home.', {
            live: row ?? null,
          })
        }
        if (
          String(row.shelf_location) !== String(discrepancy.home_shelf_label)
          || Number(row.shelf_column) !== Number(discrepancy.home_shelf_column)
          || Number(row.shelf_row) !== Number(discrepancy.home_shelf_row)
        ) {
          throw new HttpError(409, 'STOCKTAKE_LIVE_STATE_CHANGED', 'Return the item to its recorded home shelf before confirming.', {
            live: {
              shelf_location: row.shelf_location,
              shelf_column: row.shelf_column,
              shelf_row: row.shelf_row,
            },
            expected: {
              shelf_location: discrepancy.home_shelf_label,
              shelf_column: discrepancy.home_shelf_column,
              shelf_row: discrepancy.home_shelf_row,
            },
          })
        }
        afterSnapshot = { confirmed_home: true, shelf_location: row.shelf_location }
      } else {
        const [live] = await connection.execute<RowDataPacket[]>(`
          SELECT shelf_location, shelf_column, shelf_row, lifecycle_status
            FROM research_inventory WHERE research_inventory_id = ? LIMIT 1 FOR UPDATE`, [discrepancy.source_item_id])
        const row = live[0]
        if (!row || String(row.lifecycle_status) !== 'Active') {
          throw new HttpError(409, 'STOCKTAKE_LIVE_STATE_CHANGED', 'The live research copy is no longer active at home.')
        }
        if (
          String(row.shelf_location) !== String(discrepancy.home_shelf_label)
          || Number(row.shelf_column) !== Number(discrepancy.home_shelf_column)
          || Number(row.shelf_row) !== Number(discrepancy.home_shelf_row)
        ) {
          throw new HttpError(409, 'STOCKTAKE_LIVE_STATE_CHANGED', 'Return the item to its recorded home shelf before confirming.')
        }
        afterSnapshot = { confirmed_home: true, shelf_location: row.shelf_location }
      }
    }

    await connection.execute(`
      UPDATE stocktake_discrepancies
         SET status = ?, row_version = row_version + 1, updated_at = NOW()
       WHERE stocktake_discrepancy_id = ?`, [nextStatus, discrepancyId])
    await insertResolutionEvent(connection, {
      discrepancyId,
      previousStatus: String(discrepancy.status),
      nextStatus,
      action: input.action,
      reason: input.reason,
      beforeSnapshot,
      afterSnapshot,
      actorUserId: actor.userId,
      actorLabel: actor.label,
    })
    await connection.commit()
    const [rows] = await database.execute<RowDataPacket[]>(`
      SELECT d.*, e.asset_kind, e.barcode, e.accession_number, e.title
        FROM stocktake_discrepancies d
        LEFT JOIN stocktake_expected_items e ON e.stocktake_expected_item_id = d.stocktake_expected_item_id
       WHERE d.stocktake_discrepancy_id = ? LIMIT 1`, [discrepancyId])
    const row = rows[0]
    return {
      stocktake_discrepancy_id: Number(row.stocktake_discrepancy_id),
      status: String(row.status),
      finding_code: String(row.finding_code),
      row_version: Number(row.row_version),
      title: row.title ? String(row.title) : null,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function listStocktakeScopeOptions(database: Pool = db) {
  const floorPlan = createFloorPlanRepository(database)
  const state = await floorPlan.state(false)
  const [categories] = await database.execute<RowDataPacket[]>(`
    SELECT category_id, category_name, shelf_location FROM categories ORDER BY category_name`)
  return {
    shelves: state.shelves,
    categories: categories.map((row) => ({
      id: Number(row.category_id),
      name: String(row.category_name),
      shelf_location: row.shelf_location ? String(row.shelf_location) : null,
    })),
    rooms: (state.layout?.areas ?? []).map((area) => ({ id: area.id, name: area.name })),
    map_revision: state.revision,
  }
}
