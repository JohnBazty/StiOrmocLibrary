import { basename } from 'node:path'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { enrollmentEnabled, lockEnrollment, currentRosterSql } from './enrollment-policy.ts'
import { parseEnrollmentFile } from './enrollment-parser.ts'

const fail = (message: string) => new HttpError(422, 'SEMESTER_INVALID', message)
const object = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const id = (value: unknown) => {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 1) throw fail('Choose a valid semester.')
  return n
}
const day = (value: unknown) => {
  const s = text(value), date = new Date(s+'T00:00:00Z')
  if (!/^\d{4}-\d\d-\d\d$/.test(s) || !Number.isFinite(+date) || date.toISOString().slice(0,10)!==s) throw fail('Choose a valid date.')
  return s
}
const status = `CASE WHEN ended_at IS NOT NULL OR (started_at IS NOT NULL AND scheduled_end_at<=clock_timestamp())
  THEN 'Ended' WHEN started_at IS NULL THEN 'Draft' ELSE 'Active' END`

async function now(q: PoolConnection) {
  const [rows] = await q.execute<RowDataPacket[]>('SELECT clock_timestamp() AS time')
  return new Date(rows[0].time)
}
async function semester(q: PoolConnection, value: unknown) {
  const [rows] = await q.execute<RowDataPacket[]>('SELECT * FROM enrollment_semesters WHERE semester_id=?', [id(value)])
  if (!rows[0]) throw new HttpError(404, 'SEMESTER_NOT_FOUND', 'This semester could not be found.')
  return rows[0]
}
async function addRosterMembers(q: PoolConnection, semesterId: number, includeInactive = false) {
  await q.execute(`INSERT INTO enrollment_semester_members(semester_id,account_id,school_id,student_name)
    SELECT r.semester_id,a.account_id,r.school_id,r.student_name FROM (${currentRosterSql}) r
    JOIN accounts a ON a.school_id=r.school_id AND a.role='Student' AND (a.account_status='Active' OR ?::boolean)
    ON CONFLICT (semester_id,account_id) DO NOTHING`, [semesterId, includeInactive])
}

/** The lifecycle lock is always acquired before any Student account locks. */
async function finishSemester(q: PoolConnection, term: RowDataPacket, time: Date, actor: number | null) {
  const cutoff = new Date(term.scheduled_end_at)
  const scheduled = time >= cutoff
  const effective = scheduled ? cutoff : time
  if (!term.started_at || term.ended_at) throw fail('Only an active semester can end.')
  if (!scheduled && (!actor || time < new Date(term.manual_end_at))) throw fail('This semester cannot be ended before the scheduled unlock time.')
  const semesterId = Number(term.semester_id)
  await addRosterMembers(q, semesterId, true)
  // Snapshot status for every member; a prior restriction never gets a restoration marker.
  await q.execute(`UPDATE enrollment_semester_members m SET closed_status=a.account_status
    FROM accounts a WHERE m.semester_id=? AND a.account_id=m.account_id`, [semesterId])
  await q.execute(`WITH affected AS (
    UPDATE accounts a SET account_status='Deactivated',auth_version=a.auth_version+1,updated_at=NOW()
    FROM enrollment_semester_members m WHERE m.semester_id=? AND a.account_id=m.account_id
      AND a.role='Student' AND a.account_status='Active'
    RETURNING a.account_id,a.user_id,a.auth_version
  ) UPDATE enrollment_semester_members m
    SET closed_status='Deactivated',closed_auth_version=CASE WHEN EXISTS(
      SELECT 1 FROM users u WHERE u.user_id=a.user_id AND u.account_status='Active'
    ) THEN a.auth_version ELSE NULL END
    FROM affected a WHERE m.semester_id=? AND m.account_id=a.account_id`, [semesterId,semesterId])
  await q.execute(`UPDATE users u SET account_status='Deactivated',auth_version=u.auth_version+1,updated_at=NOW()
    FROM enrollment_semester_members m JOIN accounts a USING(account_id)
    WHERE m.semester_id=? AND m.closed_auth_version IS NOT NULL AND u.user_id=a.user_id`, [semesterId])
  await q.execute(`UPDATE library_login_sessions s SET revoked_at=? FROM enrollment_semester_members m
    WHERE m.semester_id=? AND s.account_id=m.account_id AND s.revoked_at IS NULL`, [effective,semesterId])
  await q.execute(`UPDATE login_otp_challenges c SET consumed_at=?,code_hash=NULL FROM enrollment_semester_members m
    WHERE m.semester_id=? AND c.account_id=m.account_id AND c.consumed_at IS NULL`, [effective,semesterId])
  await q.execute('UPDATE login_otp_challenges SET consumed_at=?,code_hash=NULL WHERE restoration_semester_id=? AND consumed_at IS NULL', [effective,semesterId])
  await q.execute(`DELETE FROM auth_sessions s USING enrollment_semester_members m,accounts a
    WHERE m.semester_id=? AND a.account_id=m.account_id AND s.session_data::json->'user'->>'id'=a.user_id::text`, [semesterId])
  await q.execute('DELETE FROM enrollment_signup_challenges WHERE semester_id=?', [semesterId])
  await q.execute('UPDATE enrollment_semesters SET ended_at=?,ended_by=?,end_kind=? WHERE semester_id=?', [effective,scheduled?null:actor,scheduled?'Scheduled':'Manual',semesterId])
}

async function closeDue(q: PoolConnection) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT * FROM enrollment_semesters
    WHERE started_at IS NOT NULL AND ended_at IS NULL AND scheduled_end_at<=clock_timestamp() LIMIT 1`)
  if (rows[0]) await finishSemester(q, rows[0], await now(q), null)
  return Boolean(rows[0])
}

export function createEnrollmentService(database: Pool = db, enabled = enrollmentEnabled) {
  async function run<T>(actor: number | null, write: boolean, work: (q: PoolConnection) => Promise<T>) {
    if (!enabled()) throw new HttpError(503,'ENROLLMENT_NOT_ENABLED','Student enrollment is not enabled for this installation.')
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      if (actor !== null) await requireLibraryActor(q, id(actor), 'accounts.manage')
      if (write) await lockEnrollment(q,true)
      const value = await work(q)
      await q.commit()
      return value
    } catch (e) { await q.rollback(); throw e }
    finally { q.release() }
  }
  return {
    async closeDue() { if (!enabled()) return false; return run(null,true,closeDue) },
    async overview(actor: number) {
      return run(actor,true,async q => {
        await closeDue(q)
        const [rows]=await q.execute<RowDataPacket[]>(`SELECT s.semester_id,s.academic_year,s.term_name,s.end_date::text,
          s.manual_end_at,s.scheduled_end_at,s.started_at,s.ended_at,s.end_kind,${status} AS status,
          (s.started_at IS NOT NULL AND s.ended_at IS NULL AND s.manual_end_at<=clock_timestamp()) AS can_end,
          EXISTS(SELECT 1 FROM enrollment_roster_imports r WHERE r.semester_id=s.semester_id AND r.complete) AS has_complete,
          (SELECT COUNT(*) FROM enrollment_semester_members m JOIN accounts a USING(account_id)
            WHERE m.semester_id=s.semester_id AND a.role='Student' AND a.account_status='Active') AS active_accounts,
          (SELECT row_to_json(b) FROM (SELECT r.file_name,r.student_count,r.source_date,r.complete FROM enrollment_roster_imports r
            WHERE r.semester_id=s.semester_id ORDER BY roster_id DESC LIMIT 1) b) AS latest_roster
          FROM enrollment_semesters s ORDER BY s.created_at DESC LIMIT 100`)
        return rows
      })
    },
    async saveSemester(actor: number, body: unknown) {
      const input=object(body), academicYear=text(input.academicYear), termName=text(input.termName), endDate=day(input.endDate)
      const year=/^(\d{4})-(\d{4})$/.exec(academicYear)
      if (!year || Number(year[2])!==Number(year[1])+1 || !['1st Semester','2nd Semester','Summer'].includes(termName)) throw fail('Choose a valid school year and semester.')
      const scheduled=new Date(+new Date(endDate+'T00:00:00+08:00')+86_400_000), unlock=text(input.manualEndAt)
      const manual=unlock?new Date(unlock+':00+08:00'):scheduled
      if (unlock && (!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(unlock) || day(unlock.slice(0,10))!==unlock.slice(0,10))) throw fail('Choose a valid manual end date and time.')
      if (!Number.isFinite(+manual) || manual>scheduled) throw fail('The earliest manual end cannot be after the scheduled end.')
      return run(actor,true,async q => {
        if (manual<=await now(q)) throw fail('Set an end time in the future.')
        if (input.semesterId != null) {
          const term=await semester(q,input.semesterId)
          if (term.started_at) throw fail('Semester dates lock after it starts.')
          if (academicYear!==term.academic_year || termName!==term.term_name) throw fail('Create a separate semester for a different term.')
          await q.execute('UPDATE enrollment_semesters SET end_date=?,manual_end_at=?,scheduled_end_at=? WHERE semester_id=?',[endDate,manual,scheduled,term.semester_id])
          return { semesterId:Number(term.semester_id) }
        }
        const [result]=await q.execute<ResultSetHeader>(`INSERT INTO enrollment_semesters
          (academic_year,term_name,end_date,manual_end_at,scheduled_end_at,created_by) VALUES (?,?,?,?,?,?)
          ON CONFLICT (academic_year,term_name) DO NOTHING`,[academicYear,termName,endDate,manual,scheduled,actor])
        if (!result.insertId) throw fail('That semester already exists. Select it from the list.')
        return { semesterId:Number(result.insertId) }
      })
    },
    async preview(actor: number, semesterId: unknown, file: {buffer:Buffer;originalname:string}) {
      const term = await run(actor, false, q => semester(q, semesterId))
      if (term.ended_at) throw fail('An ended semester is read-only.')
      const roster = await parseEnrollmentFile(file, { academicYear: term.academic_year, termName: term.term_name, listedEnrolled: true, includeSource: true })
      const preview = {
        studentCount: new Set(roster.rows.map(row => row.data.schoolId).filter(Boolean)).size,
        errorCount: roster.errors,
        warningCount: roster.warnings,
        sheets: roster.sheets.map(name => ({
          name, headings: roster.headings[name],
          rows: roster.rows.filter(row => row.sheet === name)
            .map(row => ({ row: row.row, cells: row.source!, errors: row.errors, warnings: row.warnings })),
        })),
      }
      if (Buffer.byteLength(JSON.stringify(preview)) > 4 * 1024 * 1024) {
        throw fail('The preview is too large. Split the workbook into smaller files, or remove columns the library does not use.')
      }
      return preview
    },
    async upload(actor: number, semesterId: unknown, file: {buffer:Buffer;originalname:string}, body:unknown) {
      const input=object(body), sourceDate=day(input.sourceDate), scope=text(input.scope)
      if (!['Complete','Partial'].includes(scope)) throw fail('Choose complete or partial roster.')
      const initial=await run(actor,false,q=>semester(q,semesterId))
      const roster=await parseEnrollmentFile(file,{academicYear:initial.academic_year,termName:initial.term_name,listedEnrolled:true})
      if (roster.errors) throw new HttpError(422,'ROSTER_ROWS_INVALID',`Fix ${roster.errors} roster row(s) and upload again. The existing roster was kept.`, {
        rows: roster.rows.filter(r=>r.errors.length).slice(0,25).map(r=>({sheet:r.sheet,row:r.row,errors:r.errors})),
      })
      return run(actor,true,async q => {
        await closeDue(q)
        const term=await semester(q,semesterId)
        if (term.ended_at) throw fail('An ended semester is read-only.')
        const today = new Date(+(await now(q)) + 8 * 3_600_000).toISOString().slice(0,10)
        if (sourceDate > today) throw fail('The roster date cannot be in the future.')
        const [latest]=await q.execute<RowDataPacket[]>('SELECT source_date::text AS date FROM enrollment_roster_imports WHERE semester_id=? ORDER BY roster_id DESC LIMIT 1',[term.semester_id])
        if (latest[0]?.date && sourceDate<latest[0].date) throw fail('A newer roster is already in use.')
        const [save]=await q.execute<ResultSetHeader>(`INSERT INTO enrollment_roster_imports
          (semester_id,source_date,complete,file_hash,file_name,student_count,uploaded_by) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT (semester_id,file_hash,complete) DO NOTHING`,[term.semester_id,sourceDate,scope==='Complete',roster.fingerprint,
          basename(file.originalname).replace(/[\u0000-\u001f]/g,'').slice(0,240),roster.rows.length,actor])
        if (!save.insertId) return { alreadyUploaded:true, students:roster.rows.length, missingEmail:roster.warnings }
        await q.execute(`INSERT INTO enrollment_roster_students(roster_id,school_id,student_name,first_name,last_name,school_email,program,year_level)
          SELECT ?,r."schoolId",r.name,r."firstName",r."lastName",NULLIF(r.email,''),r.program,r."yearLevel"
          FROM jsonb_to_recordset(?::jsonb) r("schoolId" text,name text,"firstName" text,"lastName" text,email text,program text,"yearLevel" text)`,
          [save.insertId,JSON.stringify(roster.rows.map(r=>r.data))])
        const [duplicates]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM (${currentRosterSql}) r WHERE school_email IS NOT NULL
          GROUP BY LOWER(school_email) HAVING COUNT(*)>1 LIMIT 1`,[term.semester_id])
        if (duplicates.length) throw fail('Two Student IDs share the same school email in the resulting roster. Correct the file and upload it again.')
        if (term.started_at) await addRosterMembers(q,Number(term.semester_id))
        return { alreadyUploaded:false, students:roster.rows.length, missingEmail:roster.warnings }
      })
    },
    async start(actor: number, semesterId: unknown) {
      return run(actor,true,async q => {
        await closeDue(q)
        const term=await semester(q,semesterId)
        if (term.started_at) throw fail('Only a draft semester can start.')
        const [active]=await q.execute<RowDataPacket[]>('SELECT 1 FROM enrollment_semesters WHERE started_at IS NOT NULL AND ended_at IS NULL LIMIT 1')
        if (active.length) throw fail('End the active semester before starting another one.')
        const [rosters]=await q.execute<RowDataPacket[]>('SELECT 1 FROM enrollment_roster_imports WHERE semester_id=? AND complete LIMIT 1',[term.semester_id])
        if (!rosters.length) throw fail('Upload the complete roster before starting the semester.')
        const time=await now(q)
        if (time>=new Date(term.manual_end_at)) throw fail('Update the end schedule before starting this semester.')
        await q.execute('UPDATE enrollment_semesters SET started_at=?,started_by=? WHERE semester_id=?',[time,actor,term.semester_id])
        await addRosterMembers(q,Number(term.semester_id))
        await q.execute('UPDATE enrollment_lifecycle SET started=TRUE WHERE id=1')
        return { startedAt:time }
      })
    },
    async end(actor: number, semesterId: unknown) {
      return run(actor,true,async q => {
        const term=await semester(q,semesterId)
        if (!term.ended_at) await finishSemester(q,term,await now(q),actor)
        return { ended:true }
      })
    },
    async roster(actor: number, semesterId: unknown, pageValue: unknown, query: unknown) {
      return run(actor,true,async q => {
        await closeDue(q)
        const term=await semester(q,semesterId)
        const page=pageValue===undefined?1:id(pageValue), search=text(query).slice(0,100)
        const [rows]=await q.execute<RowDataPacket[]>(`WITH roster AS (${currentRosterSql}), students AS (
          SELECT COALESCE(r.school_id,m.school_id) AS school_id,COALESCE(m.student_name,r.student_name) AS student_name,
          r.program,r.year_level,m.closed_status,m.closed_auth_version IS NOT NULL AS deactivated_at_end,
          COALESCE(m.account_id,a.account_id) AS account_id,
          CASE WHEN a.account_id IS NOT NULL AND r.school_email IS NOT NULL
            THEN LOWER(u.email) IS DISTINCT FROM LOWER(r.school_email) ELSE FALSE END AS email_mismatch
          FROM roster r FULL JOIN (SELECT * FROM enrollment_semester_members WHERE semester_id=?) m USING(school_id)
          LEFT JOIN accounts a ON a.school_id=r.school_id AND a.role='Student' AND ?::boolean
          LEFT JOIN users u ON u.user_id=a.user_id
        ) SELECT * FROM students WHERE STRPOS(LOWER(CONCAT_WS(' ',school_id,student_name)),LOWER(?))>0
          ORDER BY school_id LIMIT 51 OFFSET ?`,[term.semester_id,term.semester_id,!term.ended_at,search,(page-1)*50])
        return { rows:rows.slice(0,50), more:rows.length>50, page, archived:Boolean(term.ended_at) }
      })
    },
  }
}
export const enrollmentService = createEnrollmentService()
