import type { Pool, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

export function parseAvailabilityIds(value: unknown) {
  if (typeof value !== 'string' || !/^\d+(,\d+)*$/.test(value)) throw new HttpError(422, 'CATALOG_IDS_INVALID', 'Choose valid catalog entries.')
  const ids = [...new Set(value.split(',').map(Number))]
  if (ids.length > 25 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new HttpError(422, 'CATALOG_IDS_INVALID', 'Check at most 25 catalog entries at a time.')
  return ids
}

/** A bounded public stock read, without authors, files, programs or borrower data. */
export async function readCatalogAvailability(database: Pick<Pool, 'execute'>, value: unknown, detailValue?: unknown) {
  const ids = parseAvailabilityIds(value)
  const detailId = detailValue == null ? null : Number(detailValue)
  if (detailId !== null && (!Number.isSafeInteger(detailId) || !ids.includes(detailId))) throw new HttpError(422, 'CATALOG_IDS_INVALID', 'Choose a visible catalog entry for copy details.')
  const [rows] = await database.execute<RowDataPacket[]>(`SELECT t.title_id AS id,
    t.record_type AS kind,
    (t.lifecycle_status='Active' AND (t.record_type='Book' OR EXISTS
      (SELECT 1 FROM research_records rr WHERE rr.title_id=t.title_id AND rr.viewing_status<>'Archived'))) AS active,
    COUNT(pc.physical_copy_id) AS "copyCount",
    SUM(CASE WHEN pc.availability_status='Available' AND m.availability_status='Available'
      AND pc.condition_status NOT IN ('Lost','Damaged','For Repair') THEN 1 ELSE 0 END) AS available
    FROM titles t LEFT JOIN physical_copies pc ON pc.title_id=t.title_id AND pc.lifecycle_status='Active'
    LEFT JOIN materials m ON m.material_id=pc.material_id
    WHERE t.title_id IN (${ids.map(() => '?').join(',')})
    GROUP BY t.title_id,t.lifecycle_status,t.record_type`, ids)
  const selected = rows.find(row => Number(row.id) === detailId)
  let selectedCopies: Array<{id:number;accession:string;barcode:string;shelf:string;condition:string;availability:string}> = []
  if (detailId !== null && (selected?.active === true || selected?.active === 1)) {
    const research = selected.kind === 'Research/Thesis'
    const [copies] = await database.execute<RowDataPacket[]>(research
      ? `SELECT research_inventory_id AS id,accession_number AS accession,barcode,shelf_location AS shelf,condition_state AS condition,availability_status AS availability FROM research_inventory WHERE title_id=? AND lifecycle_status='Active' ORDER BY research_inventory_id`
      : `SELECT physical_copy_id AS id,accession_number AS accession,barcode,shelf_location AS shelf,condition_status AS condition,availability_status AS availability FROM physical_copies WHERE title_id=? AND lifecycle_status='Active' ORDER BY physical_copy_id`, [detailId])
    selectedCopies = copies.map(copy => ({id:Number(copy.id),accession:String(copy.accession),barcode:String(copy.barcode),shelf:String(copy.shelf??'Not recorded'),condition:String(copy.condition),availability:String(copy.availability)}))
  }
  return { items: ids.map(id => {
    const row = rows.find(row => Number(row.id) === id)
    const active = row?.active === true || row?.active === 1
    return { id, active, available: active ? Number(row.available) : 0, copyCount: active ? Number(row.copyCount) : 0 }
  }), ...(detailId !== null ? {selectedCopies} : {}) }
}

/** Coalesce public count reads across clients sharing the same visible titles. */
export function createAvailabilityReader(database: Pick<Pool, 'execute'>, clock = Date.now) {
  type Result = Awaited<ReturnType<typeof readCatalogAvailability>>
  const cache = new Map<string, { expires: number; result: Promise<Result> }>()
  return (value: unknown, detailValue?: unknown) => {
    const ids = parseAvailabilityIds(value).sort((a,b) => a-b).join(',')
    if (detailValue != null && (typeof detailValue !== 'string' || !/^\d+$/.test(detailValue))) throw new HttpError(422, 'CATALOG_IDS_INVALID', 'Choose valid copy details.')
    const key = `${ids}:${detailValue ?? ''}`
    const cached = cache.get(key)
    if (cached && cached.expires > clock()) return cached.result
    if (cache.size >= 256) cache.delete(cache.keys().next().value!)
    const entry = { expires: Infinity, result: Promise.resolve({items:[]}) as Promise<Result> }
    entry.result = readCatalogAvailability(database, ids, detailValue).then(result => {
      entry.expires = clock() + 250
      return result
    }).catch(error => { if (cache.get(key) === entry) cache.delete(key); throw error })
    cache.set(key, entry)
    return entry.result
  }
}
