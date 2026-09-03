import type { Pool, RowDataPacket } from 'mysql2/promise'

export type AssetCodeRecord = {
  physicalCopyId: number
  titleId: number
  title: string
  author: string
  accessionNumber: string
  barcode: string
  shelfLocation: string
  conditionStatus: string
  qrCodeData?: string | null
}

export type ResearchAssetCodeRecord = {
  researchInventoryId: number
  titleId: number
  title: string
  author: string
  accessionNumber: string
  barcode: string
  shelfLocation: string
  conditionStatus: string
  qrCodeData?: string | null
}

function mapAsset(row: RowDataPacket, includeQr: boolean): AssetCodeRecord {
  return {
    physicalCopyId: Number(row.physical_copy_id),
    titleId: Number(row.title_id),
    title: String(row.title),
    author: String(row.author),
    accessionNumber: String(row.accession_number),
    barcode: String(row.barcode),
    shelfLocation: String(row.shelf_location),
    conditionStatus: String(row.condition_status),
    ...(includeQr ? { qrCodeData: row.qr_code_data ? String(row.qr_code_data) : null } : {}),
  }
}

const COPY_FIELDS = `pc.physical_copy_id, pc.title_id, t.title,
  COALESCE((
    SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ')
      FROM authors a
     WHERE a.title_id = pc.title_id
  ), 'Unknown author') AS author,
  pc.accession_number, pc.barcode, pc.shelf_location, pc.condition_status`

export async function findAdminAssetById(database: Pool, physicalCopyId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT ${COPY_FIELDS}, pc.qr_code_data
       FROM physical_copies pc
       JOIN titles t ON t.title_id = pc.title_id AND t.record_type = 'Book'
      WHERE pc.physical_copy_id = ?
      LIMIT 1`,
    [physicalCopyId],
  )
  return rows[0] ? mapAsset(rows[0], true) : null
}

export async function findCatalogAssetByBarcode(database: Pool, barcode: string) {
  // Deliberately excludes qr_code_data: catalog clients are permitted to inspect barcodes only.
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT ${COPY_FIELDS}
       FROM physical_copies pc
       JOIN titles t ON t.title_id = pc.title_id
        AND t.record_type = 'Book' AND t.lifecycle_status = 'Active'
      WHERE pc.barcode = ? AND pc.lifecycle_status = 'Active'
      LIMIT 1`,
    [barcode],
  )
  return rows[0] ? mapAsset(rows[0], false) : null
}

export async function findAdminResearchAssetById(database: Pool, researchInventoryId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT
       ri.research_inventory_id, ri.title_id,
       COALESCE(t.title, ri.title) AS title,
       COALESCE(NULLIF(ri.authors, ''), (
         SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ')
           FROM authors a
          WHERE a.title_id = ri.title_id
       ), 'Unknown author') AS author,
       ri.accession_number, ri.barcode, ri.shelf_location,
       ri.condition_state AS condition_status, ri.qr_code_data
     FROM research_inventory ri
     LEFT JOIN titles t ON t.title_id = ri.title_id
     WHERE ri.research_inventory_id = ?
       AND ri.lifecycle_status = 'Active'
     LIMIT 1`,
    [researchInventoryId],
  )
  if (!rows[0]) return null
  const row = rows[0]
  return {
    researchInventoryId: Number(row.research_inventory_id),
    titleId: Number(row.title_id),
    title: String(row.title),
    author: String(row.author),
    accessionNumber: String(row.accession_number),
    barcode: String(row.barcode),
    shelfLocation: String(row.shelf_location),
    conditionStatus: String(row.condition_status),
    qrCodeData: row.qr_code_data ? String(row.qr_code_data) : null,
  } satisfies ResearchAssetCodeRecord
}
