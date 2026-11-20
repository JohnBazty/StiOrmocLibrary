import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

type Query = Pick<Pool, 'execute'>
// A DDC class number such as 005 or 005.133; anything else has no place in a range.
const DDC_NUMBER = String.raw`CASE WHEN d.code ~ '^\d{1,3}(\.\d+)?$' THEN d.code::numeric END`
const LIMIT = 300

const invalid = (message: string) => new HttpError(422, 'SHELF_DDC_RANGE_INVALID', message, { errors: { ddcRange: message } })
function ddcValue(value: unknown) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(text)) throw invalid('Enter DDC numbers from 000 to 999.999, such as 004 or 005.999.')
  return Number(text)
}

async function shelfRow(q: Query, locationId: unknown) {
  const id = Number(locationId)
  const [rows] = Number.isSafeInteger(id) && id > 0
    ? await q.execute<RowDataPacket[]>(`SELECT location_id,name,to_char(ddc_from,'FM000.000') AS ddc_from,to_char(ddc_to,'FM000.000') AS ddc_to FROM catalog_locations WHERE location_id=? AND lifecycle_status='Active'`, [id])
    : [[] as RowDataPacket[]]
  if (!rows[0]) throw new HttpError(404, 'SHELF_NOT_FOUND', 'This shelf was not found or is archived.')
  return { locationId: Number(rows[0].location_id), name: String(rows[0].name), ddcFrom: rows[0].ddc_from ? String(rows[0].ddc_from) : null, ddcTo: rows[0].ddc_to ? String(rows[0].ddc_to) : null }
}

const copyColumns = `pc.physical_copy_id,pc.accession_number,pc.shelf_location,pc.shelf_column,pc.shelf_row,t.title,t.call_number,d.code AS ddc_code,c.category_name`
const copyFrom = `FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
  LEFT JOIN categories c ON c.category_id=t.category_id
  LEFT JOIN dewey_classifications d ON d.classification_id=pc.dewey_classification_id`
// Call-number order: DDC number first, then the call number and title, so a shelf reads like the stacks.
const shelfOrder = `ORDER BY ${DDC_NUMBER} NULLS LAST,t.call_number NULLS LAST,t.title,pc.accession_number`

function toCopy(row: RowDataPacket) {
  return {
    physicalCopyId: Number(row.physical_copy_id), accession: String(row.accession_number ?? ''), title: String(row.title),
    callNumber: row.call_number ? String(row.call_number) : null, ddcCode: row.ddc_code ? String(row.ddc_code) : null,
    category: row.category_name ? String(row.category_name) : null,
    currentShelf: row.shelf_location ? String(row.shelf_location) : null, shelfColumn: Number(row.shelf_column ?? 1), shelfRow: Number(row.shelf_row ?? 1),
  }
}

export function createShelfSuggestionsService(database: Query = db) {
  return {
    /**
     * Copies that belong on this shelf but are elsewhere or Unassigned: their category's shelf is this one,
     * or their DDC number is in the shelf's range. Lent and lost copies are left out. Also lists the shelf's
     * own copies in call-number order.
     */
    async suggestions(locationId: unknown) {
      const shelf = await shelfRow(database, locationId)
      const range = shelf.ddcFrom !== null && shelf.ddcTo !== null
      const [suggested] = await database.execute<RowDataPacket[]>(`SELECT ${copyColumns},
          CASE WHEN c.shelf_location=? THEN 'category' ELSE 'ddc' END AS reason
        ${copyFrom}
        WHERE t.record_type='Book' AND t.lifecycle_status='Active' AND pc.lifecycle_status='Active'
          AND pc.condition_status<>'Lost' AND pc.availability_status NOT IN ('Borrowed','Reserved')
          AND pc.shelf_location IS DISTINCT FROM ?
          AND (c.shelf_location=? ${range ? `OR ${DDC_NUMBER} BETWEEN ?::numeric AND ?::numeric` : ''})
        ${shelfOrder} LIMIT ${LIMIT}`,
        range ? [shelf.name, shelf.name, shelf.name, shelf.ddcFrom, shelf.ddcTo] : [shelf.name, shelf.name, shelf.name])
      const [onShelf] = await database.execute<RowDataPacket[]>(`SELECT ${copyColumns} ${copyFrom}
        WHERE pc.shelf_location=? AND pc.lifecycle_status='Active' ${shelfOrder} LIMIT ${LIMIT}`, [shelf.name])
      return {
        shelf,
        suggestions: suggested.map(row => ({ ...toCopy(row), reason: String(row.reason) as 'category' | 'ddc' })),
        onShelf: onShelf.map(toCopy),
      }
    },

    async saveDdcRange(locationId: unknown, body: unknown) {
      const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
      const from = ddcValue(input.ddcFrom), to = ddcValue(input.ddcTo)
      if ((from === null) !== (to === null)) throw invalid('Enter both the first and last DDC number, or clear both.')
      if (from !== null && to !== null && from > to) throw invalid('The first DDC number must not be after the last one.')
      const shelf = await shelfRow(database, locationId)
      await database.execute('UPDATE catalog_locations SET ddc_from=?,ddc_to=?,row_version=row_version+1 WHERE location_id=?', [from, to, shelf.locationId])
      return shelfRow(database, shelf.locationId)
    },
  }
}

export const shelfSuggestionsService = createShelfSuggestionsService()
