import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { applicableWindows, scheduleId, scheduleStatus, scheduleTermId, scheduleVersion, selectedWindow, studentClearanceGroup, validateSchedule, type ClearanceGroup, type ScheduleWindow } from './clearance-schedule.rules.ts'

type Actor = { role?: string; accountId?: number }
const semestersSql = `SELECT academic_term_id id,academic_year,term_name,is_active,starts_on::timestamp AT TIME ZONE 'Asia/Manila' sort_at,0 source_priority FROM academic_terms
  UNION ALL SELECT -semester_id id,academic_year,term_name,CASE WHEN started_at IS NOT NULL AND ended_at IS NULL THEN 1 ELSE 0 END is_active,COALESCE(started_at,created_at) sort_at,1 source_priority FROM enrollment_semesters`
const termColumn = (termId: number) => termId < 0 ? 'enrollment_semester_id' : 'academic_term_id'
const iso = (value: unknown) => new Date(value as string).toISOString()

export function createClearanceScheduleService(database: Pool = db, clock = () => new Date()) {
  async function terms() {
    const [rows] = await database.execute<RowDataPacket[]>(`SELECT id,academic_year,term_name,is_active FROM (${semestersSql}) terms ORDER BY is_active DESC,source_priority DESC,sort_at DESC,id DESC`)
    return rows
  }
  async function current(termId?: number, executor: Pick<Pool, 'execute'> = database) {
    const [rows] = await executor.execute<RowDataPacket[]>(`SELECT id AS "termId",academic_year AS "academicYear",term_name AS "termName" FROM (${semestersSql}) terms WHERE ${termId ? 'id=?' : 'is_active=1'} ORDER BY source_priority DESC,sort_at DESC,id DESC LIMIT 1`, termId ? [termId] : [])
    const term = rows[0]
    if (!term) return { termId: null, windows: [] as ScheduleWindow[], deadlineAt: null, version: 0 }
    const [windows] = await executor.execute<RowDataPacket[]>(`SELECT schedule_id,audience,starts_at,ends_at,row_version FROM clearance_schedule_windows WHERE ${termColumn(Number(term.termId))}=? AND cancelled_at IS NULL ORDER BY starts_at,schedule_id`, [Math.abs(Number(term.termId))])
    const now = clock()
    return { ...term, termId: Number(term.termId), deadlineAt: null, version: 0, windows: windows.map(row => {
      const startsAt = iso(row.starts_at), endsAt = iso(row.ends_at)
      return { id: Number(row.schedule_id), group: row.audience as ClearanceGroup, startsAt, endsAt, version: Number(row.row_version), status: scheduleStatus(startsAt, endsAt, now) }
    }) }
  }
  async function mine(actor: Actor) {
    if (actor.role !== 'Student') return null
    const [profiles] = await database.execute<RowDataPacket[]>(`SELECT COALESCE(NULLIF(sp.program_strand,''),u.course_or_strand) program,COALESCE(NULLIF(sp.year_grade_level,''),u.educational_level) level FROM accounts a LEFT JOIN student_profiles sp ON sp.account_id=a.account_id LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? AND a.role='Student' AND a.account_status='Active'`, [scheduleId(actor.accountId)])
    if (!profiles.length) throw new HttpError(403, 'SCHEDULE_FORBIDDEN', 'Your account cannot view this schedule.')
    const data = await current(), group = studentClearanceGroup(profiles[0].program, profiles[0].level)
    const windows = applicableWindows(data.windows, group), selected = selectedWindow(windows, clock())
    return { ...data, windows, group, selected, deadlineAt: selected?.endsAt ?? null }
  }
  async function transaction<T>(actor: Actor, termId: number, action: (connection: PoolConnection) => Promise<T>) {
    if (actor.role !== 'Librarian' || !actor.accountId) throw new HttpError(403, 'SCHEDULE_FORBIDDEN', 'Only the Librarian can change clearance schedules.')
    const c = await database.getConnection()
    try {
      await c.beginTransaction()
      const [actors] = await c.execute<RowDataPacket[]>("SELECT account_id FROM accounts WHERE account_id=? AND role='Librarian' AND account_status='Active' FOR UPDATE", [actor.accountId])
      if (!actors.length) throw new HttpError(403, 'SCHEDULE_FORBIDDEN', 'Your permission to manage schedules changed.')
      // Lock the semester before reading its schedule to serialize first creation and edits.
      const [term] = await c.execute<RowDataPacket[]>(`SELECT ${termId < 0 ? 'semester_id' : 'academic_term_id'} FROM ${termId < 0 ? 'enrollment_semesters' : 'academic_terms'} WHERE ${termId < 0 ? 'semester_id' : 'academic_term_id'}=? FOR UPDATE`, [Math.abs(termId)])
      if (!term.length) throw new HttpError(422, 'SCHEDULE_INVALID', 'Choose an existing semester.')
      const result = await action(c)
      await c.commit()
      return result
    } catch (error) { await c.rollback(); throw error } finally { c.release() }
  }
  async function audit(c: PoolConnection, id: number, actor: Actor, action: string, before: RowDataPacket | null) {
    await c.execute('INSERT INTO clearance_window_events(schedule_id,action,actor_id,before_values,after_values) SELECT schedule_id,?,?,?::jsonb,to_jsonb(w) FROM clearance_schedule_windows w WHERE schedule_id=?', [action, actor.accountId, before ? JSON.stringify(before) : null, id])
  }
  return {
    current, mine, terms,
    async save(actor: Actor, body: unknown) {
      const input = validateSchedule(body)
      return transaction(actor, input.termId, async c => {
        if (input.id === null) {
          const [retry] = await c.execute<RowDataPacket[]>('SELECT * FROM clearance_schedule_windows WHERE request_key=?::uuid', [input.requestKey])
          if (retry.length) {
            const saved = retry[0]
            if (Number(saved[termColumn(input.termId)]) !== Math.abs(input.termId) || saved.audience !== input.group || iso(saved.starts_at) !== input.startsAt || iso(saved.ends_at) !== input.endsAt || saved.cancelled_at) throw new HttpError(409, 'SCHEDULE_CHANGED', 'This submission was already used. Reload schedules before trying again.')
            return current(input.termId, c)
          }
        }
        const [locked] = input.id ? await c.execute<RowDataPacket[]>(`SELECT * FROM clearance_schedule_windows WHERE schedule_id=? AND ${termColumn(input.termId)}=? FOR UPDATE`, [input.id, Math.abs(input.termId)]) : [[]]
        if (input.id && (!locked.length || locked[0].cancelled_at || Number(locked[0].row_version) !== input.version)) throw new HttpError(409, 'SCHEDULE_CHANGED', 'This schedule changed. Reload schedules and review before saving again.')
        const [overlaps] = await c.execute<RowDataPacket[]>(`SELECT schedule_id FROM clearance_schedule_windows WHERE ${termColumn(input.termId)}=? AND audience=? AND cancelled_at IS NULL AND starts_at<?::timestamptz AND ends_at>?::timestamptz AND (?::bigint IS NULL OR schedule_id<>?::bigint) LIMIT 1`, [Math.abs(input.termId), input.group, input.endsAt, input.startsAt, input.id, input.id])
        if (overlaps.length) throw new HttpError(409, 'SCHEDULE_OVERLAP', 'This group already has a schedule during that period. Choose another period or edit its existing schedule.')
        let id = input.id
        if (id) {
          await c.execute('UPDATE clearance_schedule_windows SET audience=?,starts_at=?::timestamptz,ends_at=?::timestamptz,row_version=row_version+1,updated_by=?,updated_at=now() WHERE schedule_id=?', [input.group, input.startsAt, input.endsAt, actor.accountId, id])
        } else {
          const [created] = await c.execute<ResultSetHeader>(`INSERT INTO clearance_schedule_windows(${termColumn(input.termId)},audience,starts_at,ends_at,request_key,created_by,updated_by) VALUES(?,?,?::timestamptz,?::timestamptz,?::uuid,?,?) RETURNING schedule_id`, [Math.abs(input.termId), input.group, input.startsAt, input.endsAt, input.requestKey, actor.accountId, actor.accountId])
          id = Number(created.insertId)
        }
        await audit(c, id, actor, input.id ? 'Updated' : 'Created', locked[0] ?? null)
        return current(input.termId, c)
      })
    },
    async cancel(actor: Actor, rawId: unknown, body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const id = scheduleId(rawId), termId = scheduleTermId(input.termId), version = scheduleVersion(input.version)
      return transaction(actor, termId, async c => {
        const [rows] = await c.execute<RowDataPacket[]>(`SELECT * FROM clearance_schedule_windows WHERE schedule_id=? AND ${termColumn(termId)}=? FOR UPDATE`, [id, Math.abs(termId)])
        if (!rows.length || Number(rows[0].row_version) !== version || rows[0].cancelled_at) throw new HttpError(409, 'SCHEDULE_CHANGED', 'This schedule changed. Reload schedules before cancelling.')
        await c.execute('UPDATE clearance_schedule_windows SET cancelled_at=now(),updated_at=now(),updated_by=?,row_version=row_version+1 WHERE schedule_id=?', [actor.accountId, id])
        await audit(c, id, actor, 'Cancelled', rows[0])
        return current(termId, c)
      })
    },
  }
}
export const clearanceScheduleService = createClearanceScheduleService()
