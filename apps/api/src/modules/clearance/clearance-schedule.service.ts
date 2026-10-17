import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

export function createClearanceScheduleService(database: Pool = db) {
  async function terms() {
    const [rows] = await database.execute<RowDataPacket[]>('SELECT academic_term_id AS id,academic_year,term_name,is_active FROM academic_terms ORDER BY is_active DESC,starts_on DESC,academic_term_id DESC')
    return rows
  }
  async function current(termId?: number, executor: Pick<Pool, 'execute'> = database) {
    const [rows] = await executor.execute<RowDataPacket[]>(`SELECT t.academic_term_id AS "termId",t.academic_year AS "academicYear",t.term_name AS "termName",s.deadline_at AS "deadlineAt",COALESCE(s.row_version,0) AS version FROM academic_terms t LEFT JOIN clearance_semester_schedules s ON s.academic_term_id=t.academic_term_id WHERE ${termId ? 't.academic_term_id=?' : 't.is_active=1'} ORDER BY t.starts_on DESC,t.academic_term_id DESC LIMIT 1`, termId ? [termId] : [])
    return rows[0] ?? { termId: null, deadlineAt: null, version: 0 }
  }
  return {
    current, terms,
    async save(actor: { role?: string; accountId?: number }, body: any) {
      if (actor.role !== 'Librarian' || !actor.accountId) throw new HttpError(403, 'SCHEDULE_FORBIDDEN', 'Only the Librarian can change clearance schedules.')
      const termId = Number(body?.termId), version = Number(body?.version)
      const deadline = body?.deadlineAt === null || body?.deadlineAt === '' ? null : new Date(String(body?.deadlineAt))
      if (!Number.isSafeInteger(termId) || termId < 1 || !Number.isInteger(version) || version < 0 || (deadline && !Number.isFinite(deadline.getTime())) || body?.deadlineAt === undefined) throw new HttpError(422, 'SCHEDULE_INVALID', 'Choose a semester and a valid clearance deadline, or remove its schedule.')
      const c = await database.getConnection()
      try {
        await c.beginTransaction()
        const [actorRows] = await c.execute<RowDataPacket[]>("SELECT account_id FROM accounts WHERE account_id=? AND role='Librarian' AND account_status='Active' FOR UPDATE", [actor.accountId])
        if (!actorRows.length) throw new HttpError(403, 'SCHEDULE_FORBIDDEN', 'Your permission to manage schedules changed.')
        const [termRows] = await c.execute<RowDataPacket[]>('SELECT academic_term_id FROM academic_terms WHERE academic_term_id=? FOR UPDATE', [termId])
        if (!termRows.length) throw new HttpError(422, 'SCHEDULE_INVALID', 'Choose an existing semester.')
        // Lock the semester before reading its schedule to serialize first creation and edits.
        const [locked] = await c.execute<RowDataPacket[]>('SELECT * FROM clearance_semester_schedules WHERE academic_term_id=? FOR UPDATE', [termId])
        if (Number(locked[0]?.row_version ?? 0) !== version) throw new HttpError(409, 'SCHEDULE_CHANGED', 'The schedule changed. Reload before saving.')
        await c.execute('INSERT INTO clearance_semester_schedules(academic_term_id,deadline_at,updated_by) VALUES (?,?,?) ON CONFLICT(academic_term_id) DO UPDATE SET deadline_at=EXCLUDED.deadline_at,updated_by=EXCLUDED.updated_by,updated_at=NOW(),row_version=clearance_semester_schedules.row_version+1', [termId, deadline, actor.accountId])
        await c.execute('INSERT INTO clearance_schedule_events(academic_term_id,previous_deadline,deadline_at,actor_id) VALUES (?,?,?,?)', [termId, locked[0]?.deadline_at ?? null, deadline, actor.accountId])
        const saved = await current(termId, c)
        await c.commit()
        return saved
      } catch (error) { await c.rollback(); throw error } finally { c.release() }
    },
  }
}
export const clearanceScheduleService = createClearanceScheduleService()
