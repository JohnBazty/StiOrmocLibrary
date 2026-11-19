import {isAutomaticDdcSection} from './ddc-sections.ts'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { deweyCode, deweyLookup } from './dewey-lookup.service.ts'
import { normalizeIsbn } from './catalog.validation.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'

export type DeweyAssignment = { code: string; source: 'manual' | 'open_library' | 'local_rule'; sourceUrl: string | null; isbn: string }
export type ReviewedDewey = DeweyAssignment
type CopyVersion = { id: number; version: number }
const invalid = (code: string, message: string, status = 422) => new HttpError(status, code, message)
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function positive(value: unknown) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw invalid('DEWEY_ID_INVALID', 'Choose a valid book copy or classification.')
  return number
}
function actor(value: number | null) {
  if (!value || !Number.isSafeInteger(value) || value<1) throw invalid('DEWEY_ACTOR_REQUIRED', 'Sign in as the Librarian before saving classifications.', 403)
  return value
}
export async function assignDeweyCopies(connection: PoolConnection, selection: DeweyAssignment | null, copies: CopyVersion[], accountId: number | null) {
  if (!selection || !copies.length) return
  const actorId = actor(accountId)
  await requireLibraryActor(connection,actorId,'library.manage')
  if (selection.source === 'local_rule' && !isAutomaticDdcSection(selection.code)) throw invalid('DEWEY_SECTION_UNAVAILABLE','This section is unavailable for automatic assignment. Review the classification.')
  const ids = copies.map(copy => copy.id)
  // Catalog writers lock titles before their copies; keep that order to avoid deadlocks.
  await connection.execute(`SELECT title_id FROM titles WHERE title_id IN
    (SELECT title_id FROM physical_copies WHERE physical_copy_id=ANY(?::bigint[])) ORDER BY title_id FOR UPDATE`,[ids])
  const [locked] = await connection.execute<RowDataPacket[]>(`SELECT pc.physical_copy_id,pc.accession_number,pc.dewey_version,pc.dewey_classification_id,
      t.isbn,d.code FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
      LEFT JOIN dewey_classifications d ON d.classification_id=pc.dewey_classification_id
      WHERE pc.physical_copy_id=ANY(?::bigint[]) AND pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
      ORDER BY pc.physical_copy_id FOR UPDATE OF pc`, [ids])
  if (locked.length !== copies.length) throw invalid('DEWEY_COPY_UNAVAILABLE', 'A selected book copy is no longer active. Reload the list.', 409)
  for (const row of locked) {
    if (Number(row.dewey_version) !== copies.find(copy => copy.id === Number(row.physical_copy_id))?.version) throw invalid('DEWEY_COPY_CHANGED', 'A selected copy changed. Reload and review it again.', 409)
    if (selection.source === 'open_library' && normalizeIsbn(row.isbn) !== selection.isbn) throw invalid('DEWEY_ISBN_CHANGED', 'The ISBN changed. Look up and review the classification again.', 409)
  }
  const [entry] = await connection.execute<ResultSetHeader>(`INSERT INTO dewey_classifications(code,created_by,updated_by) VALUES (?,?,?)
    ON CONFLICT(code) DO NOTHING RETURNING classification_id`, [selection.code,actorId,actorId])
  // Lock the entry even when it existed, so archive and assignment serialize.
  const [classes] = await connection.execute<RowDataPacket[]>('SELECT classification_id,lifecycle_status FROM dewey_classifications WHERE code=? FOR UPDATE',[selection.code])
  const classification = classes[0]
  if (!classification || classification.lifecycle_status !== 'Active') throw invalid('DEWEY_ARCHIVED', 'This Dewey classification is archived. Choose an active entry.')
  const classificationId = Number(classification.classification_id ?? entry.insertId)
  for (const row of locked) {
    if (Number(row.dewey_classification_id) === classificationId) continue
    await connection.execute('UPDATE physical_copies SET dewey_classification_id=?,dewey_version=dewey_version+1 WHERE physical_copy_id=?',[classificationId,row.physical_copy_id])
    await connection.execute(`INSERT INTO dewey_assignment_events(physical_copy_id,accession_number,previous_code,new_code,source,source_url,actor_account_id)
      VALUES (?,?,?,?,?,?,?)`,[row.physical_copy_id,row.accession_number,row.code ?? null,selection.code,selection.source,selection.sourceUrl,actorId])
  }
}

export function createDeweyService(database: Pool = db, lookup: Pick<typeof deweyLookup,'lookup'> = deweyLookup) {
  async function transaction<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result }
    catch (error) { await connection.rollback(); throw error }
    finally { connection.release() }
  }
  async function prepare(value: unknown, rawIsbn: unknown): Promise<ReviewedDewey | null> {
    if (value === null || value === undefined || value === '') return null
    const input = object(value), code = deweyCode(input.code)
    if (input.reviewed !== true) throw invalid('DEWEY_REVIEW_REQUIRED', 'Review the Dewey number before saving.')
    if (!code) throw invalid('DEWEY_CODE_INVALID', 'Use three digits and an optional decimal, such as 005.1.')
    const isbn = normalizeIsbn(rawIsbn)
    if (input.source === 'open_library') {
      const result = await lookup.lookup(isbn)
      const candidate = result.candidates.find(candidate => candidate.code === code)
      if (!candidate) throw invalid('DEWEY_SELECTION_CHANGED', 'The Dewey suggestion is unavailable or changed. Look it up again or enter a reviewed number manually.',409)
      return { code,source:'open_library',sourceUrl:candidate.sourceUrl,isbn }
    }
    if (input.source !== 'manual') throw invalid('DEWEY_SOURCE_INVALID','Choose a lookup suggestion or enter the number manually.')
    return {code,source:'manual',sourceUrl:null,isbn}
  }
  return {
    prepare,
    async classifications(query: unknown) {
      const q = typeof query === 'string' ? query.trim().slice(0,100) : ''
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT classification_id AS id,code,description,lifecycle_status AS status,row_version AS version
        FROM dewey_classifications WHERE STRPOS(code,?)>0 OR STRPOS(LOWER(COALESCE(description,'')),LOWER(?))>0 ORDER BY code LIMIT 200`,[q,q])
      return rows.map(row => ({id:Number(row.id),code:String(row.code),description:row.description as string|null,status:row.status as 'Active'|'Archived',version:Number(row.version)}))
    },
    async saveClassification(id: unknown, body: unknown, accountId: number) {
      const actorId = actor(accountId), input = object(body)
      const description = typeof input.description === 'string' ? input.description.trim() : ''
      if (description.length>255 || !['Active','Archived'].includes(String(input.status))) throw invalid('DEWEY_ENTRY_INVALID','Use a description up to 255 characters and choose Active or Archived.')
      try {
        return await transaction(async connection => {
          await requireLibraryActor(connection,actorId,'library.manage')
          if (id == null) {
            const code = deweyCode(input.code)
            if (!code) throw invalid('DEWEY_CODE_INVALID','Use three digits and an optional decimal, such as 005.1.')
            await connection.execute('INSERT INTO dewey_classifications(code,description,lifecycle_status,created_by,updated_by) VALUES (?,?,?,?,?)',[code,description||null,input.status,actorId,actorId])
          } else {
            const [result] = await connection.execute<ResultSetHeader>(`UPDATE dewey_classifications SET description=?,lifecycle_status=?,updated_by=?,updated_at=NOW(),row_version=row_version+1
              WHERE classification_id=? AND row_version=?`,[description||null,input.status,actorId,positive(id),positive(input.version)])
            if (!result.affectedRows) throw invalid('DEWEY_ENTRY_CHANGED','This classification changed. Reload before saving.',409)
          }
          return {saved:true}
        })
      } catch (error) {
        if (['23505','ER_DUP_ENTRY'].includes(String((error as {code?:string}).code))) throw invalid('DEWEY_CODE_EXISTS','This Dewey number already exists. Edit its entry instead.',409)
        throw error
      }
    },
    async copies(query: Record<string, unknown>) {
      const page = Math.min(10000,Math.max(1,Number(query.page)||1)), q = String(query.q??'').trim().slice(0,120)
      if (!Number.isInteger(page)) throw invalid('DEWEY_PAGE_INVALID','Choose a whole page number.')
      const status = String(query.status??'unassigned')
      if (!['all','assigned','unassigned'].includes(status)) throw invalid('DEWEY_FILTER_INVALID','Choose all, assigned or unassigned copies.')
      const where = `pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
        AND (STRPOS(LOWER(t.title),LOWER(?))>0 OR STRPOS(pc.accession_number,?)>0 OR STRPOS(COALESCE(t.isbn,''),?)>0)
        ${status==='all'?'':`AND pc.dewey_classification_id IS ${status==='assigned'?'NOT ':''}NULL`}`
      const [[items],[counts]] = await Promise.all([
        database.execute<RowDataPacket[]>(`SELECT pc.physical_copy_id AS id,pc.accession_number AS accession,t.title,t.isbn,pc.dewey_version AS version,d.code,d.description
          FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id LEFT JOIN dewey_classifications d ON d.classification_id=pc.dewey_classification_id
          WHERE ${where} ORDER BY pc.physical_copy_id LIMIT 50 OFFSET ${(page-1)*50}`,[q,q,q]),
        database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE ${where}`,[q,q,q]),
      ])
      return {items:items.map(row=>({id:Number(row.id),accession:String(row.accession),title:String(row.title),isbn:row.isbn as string|null,version:Number(row.version),code:row.code as string|null,description:row.description as string|null})),total:Number(counts[0]?.total??0),page}
    },
    async assign(body: unknown, accountId: number) {
      actor(accountId)
      const input = object(body)
      if (!Array.isArray(input.copies) || !input.copies.length || input.copies.length>50) throw invalid('DEWEY_COPY_LIMIT','Select between 1 and 50 copies.')
      const copies = input.copies.map(value => { const copy=object(value),version=Number(copy.version); if (!Number.isSafeInteger(version)||version<0) throw invalid('DEWEY_VERSION_REQUIRED','Reload the selected copies before saving.'); return {id:positive(copy.id),version} })
      if (new Set(copies.map(copy=>copy.id)).size!==copies.length) throw invalid('DEWEY_COPY_DUPLICATE','Select each copy once.')
      const selection = await prepare(input.selection,input.isbn)
      if (!selection) throw invalid('DEWEY_SELECTION_REQUIRED','Choose a reviewed Dewey number.')
      await transaction(connection=>assignDeweyCopies(connection,selection,copies,accountId))
      return {saved:true,copies:copies.length}
    },
  }
}
export const deweyService = createDeweyService()
