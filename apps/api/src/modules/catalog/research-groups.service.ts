import { db, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'

const fail = (message: string, status = 422) => new HttpError(status, 'RESEARCH_GROUP_REVIEW_REQUIRED', message)
const positive = (value: unknown) => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw fail('Choose a valid research group or record.'); return id }
export function researchGroupLabel(row: Record<string, unknown>) {
  return row.department === 'SHS' ? `Grade ${row.year_level} · ${row.program}` : `${row.program} · Year ${row.year_level}`
}
export async function requireResearchGroup(connection: Pick<PoolConnection,'execute'>, value: unknown) {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM research_academic_groups WHERE research_group_id=? AND is_active=TRUE FOR SHARE', [positive(value)])
  if (!rows[0]) throw fail('This research group is no longer available. Choose an active group.')
  return rows[0]
}
export function createResearchGroupsService(database: Pool = db) {
  async function transaction<T>(actorId: number, work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try { await connection.beginTransaction(); await requireLibraryActor(connection, positive(actorId), 'library.manage'); const result = await work(connection); await connection.commit(); return result }
    catch (error) { await connection.rollback(); if ((error as {code?:string}).code === '23505') throw fail('This research group already exists.'); throw error }
    finally { connection.release() }
  }
  async function assignment(titleId: unknown, connection: Pick<PoolConnection,'execute'> = database) {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT rr.research_record_id,rr.research_group_id,rr.classification_version,rr.department_or_program
      FROM research_records rr JOIN titles t ON t.title_id=rr.title_id WHERE rr.title_id=? AND t.lifecycle_status='Active'`, [positive(titleId)])
    if (!rows[0]) throw fail('Choose an active research title.', 404)
    return { researchRecordId: Number(rows[0].research_record_id), groupId: rows[0].research_group_id ? Number(rows[0].research_group_id) : null, version: Number(rows[0].classification_version), legacyDepartment: String(rows[0].department_or_program) }
  }
  return {
    async list(includeArchived = false) {
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT research_group_id,department,program,year_level,is_active,row_version,
        (SELECT COUNT(*)::int FROM research_records rr WHERE rr.research_group_id=g.research_group_id) AS uses
        FROM research_academic_groups g ${includeArchived ? '' : 'WHERE is_active=TRUE OR EXISTS (SELECT 1 FROM research_records rr WHERE rr.research_group_id=g.research_group_id)'} ORDER BY department,program,year_level`)
      return rows.map(row => ({ id: Number(row.research_group_id), department: String(row.department), program: String(row.program), yearLevel: Number(row.year_level), active: Boolean(row.is_active), version: Number(row.row_version), label: researchGroupLabel(row), uses: Number(row.uses) }))
    },
    assignment,
    async save(actorId: number, groupId: unknown, body: Record<string,unknown>) {
      const department = String(body.department), program = String(body.program ?? '').trim().replace(/\s+/g,' ').toUpperCase(), year = Number(body.yearLevel)
      if (!['SHS','College'].includes(department) || !/^[A-Z0-9][A-Z0-9 &()./-]{0,79}$/.test(program) || !Number.isInteger(year) || !(department === 'SHS' ? [11,12] : [1,2,3,4]).includes(year) || typeof body.active !== 'boolean') throw fail('Choose SHS or College, enter a program or strand, and select its year level.')
      return transaction(actorId, async connection => {
        let id: number
        if (groupId) {
          id = positive(groupId)
          const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM research_academic_groups WHERE research_group_id=? FOR UPDATE', [id])
          const old = rows[0]
          if (!old || Number(old.row_version) !== Number(body.version)) throw fail('This group changed. Reload it before saving.', 409)
          if (old.department !== department || old.program !== program || Number(old.year_level) !== year) {
            const [used] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM research_records WHERE research_group_id=? LIMIT 1', [id])
            if (used.length) throw fail('This group has research records. Create a new group to preserve their classification.')
          }
          await connection.execute('UPDATE research_academic_groups SET department=?,program=?,year_level=?,is_active=?,row_version=row_version+1,updated_at=NOW() WHERE research_group_id=?', [department,program,year,body.active,id])
        } else {
          const [result] = await connection.execute<ResultSetHeader>('INSERT INTO research_academic_groups(department,program,year_level,is_active) VALUES(?,?,?,?)', [department,program,year,body.active])
          id = Number(result.insertId)
        }
        await connection.execute('INSERT INTO research_group_events(actor_account_id,research_group_id,event_type,details) VALUES(?,?,?,?::jsonb)', [actorId,id,groupId ? 'Updated' : 'Created',JSON.stringify({department,program,yearLevel:year,active:body.active})])
        return { id }
      })
    },
    async assign(actorId: number, titleId: unknown, body: Record<string,unknown>) {
      return transaction(actorId, async connection => {
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT rr.research_record_id,rr.classification_version,rr.research_group_id FROM research_records rr JOIN titles t ON t.title_id=rr.title_id WHERE rr.title_id=? AND t.lifecycle_status='Active' FOR UPDATE OF rr`, [positive(titleId)])
        const old = rows[0]
        if (!old || Number(old.classification_version) !== Number(body.version)) throw fail('This research classification changed. Reload before saving.', 409)
        const group = await requireResearchGroup(connection, body.groupId)
        await connection.execute('UPDATE research_records SET research_group_id=?,classification_version=classification_version+1 WHERE research_record_id=?', [group.research_group_id,old.research_record_id])
        await connection.execute("INSERT INTO research_group_events(actor_account_id,research_group_id,research_record_id,event_type,details) VALUES(?,?,?,'Assigned',?::jsonb)", [actorId,group.research_group_id,old.research_record_id,JSON.stringify({previousGroupId:old.research_group_id})])
        return assignment(titleId,connection)
      })
    },
  }
}
export const researchGroupsService = createResearchGroupsService()
