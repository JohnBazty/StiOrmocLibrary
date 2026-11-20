import { basename } from 'node:path'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { enrollmentEnabled, lockEnrollment, rosterSql, type RosterRole } from './enrollment-policy.ts'
import { parseEnrollmentFile, parseLateEnrollmentForm, type EnrollmentData, type EnrollmentRosterFile } from './enrollment-parser.ts'
import QRCode from 'qrcode'
import { libraryQrImageOptions } from '../attendance/attendance-qr-image.ts'
import { existingAttendancePayload, issueAttendanceCredential } from '../attendance/attendance-credential.service.ts'
import { inspectLateEnrollment, inspectReplacement, lateFingerprint, matchesReview, reviewChanged, reviewToken, rosterPreview } from './late-enrollment.ts'
import { sendSchoolEmail } from '../auth/school-email.sender.ts'
import { SYSTEM_SHORT_NAME } from '../../config/branding.ts'
import { env } from '../../config/env.js'

type LateEnrollmentResult = { added: number; alreadyListed: number; missingEmail: number; missingEmailStudentIds: string[] }
type LateEnrollmentReview = LateEnrollmentResult & ReturnType<typeof rosterPreview> & { reviewToken: string }

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
const manilaDay = (time: Date) => new Date(+time + 8 * 3_600_000).toISOString().slice(0,10)
const safeFileName = (file: EnrollmentRosterFile) => basename(file.originalname).replace(/[\u0000-\u001f]/g,'').slice(0,240)
const lateFormFields = ['schoolId','firstName','lastName','program','yearLevel','email']

function requireActiveTerm(term: RowDataPacket, time: Date) {
  if (!term.started_at || term.ended_at || time >= new Date(term.scheduled_end_at)) {
    throw new HttpError(409, 'LATE_ENROLLMENT_CLOSED', 'Late students can only be added to the active semester.')
  }
}

function checkedPreview<T>(preview: T) {
  if (Buffer.byteLength(JSON.stringify(preview)) > 4 * 1024 * 1024) {
    throw fail('The preview is too large. Split the workbook into smaller files, or remove columns the library does not use.')
  }
  return preview
}

async function insertRosterStudents(q: PoolConnection, rosterId: number, students: EnrollmentData[]) {
  await q.execute(`INSERT INTO enrollment_roster_students(roster_id,school_id,student_name,first_name,last_name,school_email,program,year_level)
    SELECT ?,r."schoolId",r.name,r."firstName",r."lastName",NULLIF(r.email,''),r.program,r."yearLevel"
    FROM jsonb_to_recordset(?::jsonb) r("schoolId" text,name text,"firstName" text,"lastName" text,email text,program text,"yearLevel" text)`,
  [rosterId, JSON.stringify(students)])
}
async function semester(q: PoolConnection, value: unknown) {
  const [rows] = await q.execute<RowDataPacket[]>('SELECT * FROM enrollment_semesters WHERE semester_id=?', [id(value)])
  if (!rows[0]) throw new HttpError(404, 'SEMESTER_NOT_FOUND', 'This semester could not be found.')
  return rows[0]
}
async function addRosterMembers(q: PoolConnection, semesterId: number, includeInactive = false, role: RosterRole = 'Student') {
  const currentRosterSql=rosterSql(role)
  await q.execute(`INSERT INTO enrollment_semester_members(semester_id,account_id,school_id,student_name)
    SELECT r.semester_id,a.account_id,r.school_id,r.student_name FROM (${currentRosterSql}) r
    JOIN accounts a ON a.school_id=r.school_id AND a.role='${role}' AND (a.account_status='Active' OR ?::boolean)
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
  await addRosterMembers(q, semesterId, true, 'Faculty')
  // Snapshot status for every member; a prior restriction never gets a restoration marker.
  await q.execute(`UPDATE enrollment_semester_members m SET closed_status=a.account_status
    FROM accounts a WHERE m.semester_id=? AND a.account_id=m.account_id`, [semesterId])
  await q.execute(`WITH affected AS (
    UPDATE accounts a SET account_status='Deactivated',auth_version=a.auth_version+1,updated_at=NOW()
    FROM enrollment_semester_members m WHERE m.semester_id=? AND a.account_id=m.account_id
      AND a.role IN ('Student','Faculty') AND a.account_status='Active'
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

/** Runs in the import transaction, so a rejected import cannot invalidate passes. */
export async function replenishRosterCredentials(q: PoolConnection, semesterId: number) {
  const currentRosterSql=rosterSql('Student')
  const [previous] = await q.execute<RowDataPacket[]>(`SELECT DISTINCT u.user_id
    FROM enrollment_roster_students r JOIN enrollment_roster_imports b USING(roster_id)
    JOIN accounts a ON a.school_id=r.school_id AND a.role='Student'
    JOIN users u ON u.user_id=a.user_id WHERE b.semester_id=? AND b.roster_role='Student'`, [semesterId])
  for (const row of previous) {
    await q.execute(`UPDATE attendance_qr_credentials SET credential_status='Revoked',revoked_at=NOW(),updated_at=NOW()
      WHERE user_id=?`, [row.user_id])
  }
  const [current] = await q.execute<RowDataPacket[]>(`SELECT u.user_id FROM (${currentRosterSql}) r
    JOIN accounts a ON a.school_id=r.school_id AND a.role='Student' AND a.account_status='Active'
    JOIN users u ON u.user_id=a.user_id AND u.account_status='Active'`, [semesterId])
  for (const row of current) await issueAttendanceCredential(q, Number(row.user_id))
}

export function createEnrollmentService(database: Pool = db, enabled = enrollmentEnabled, role: RosterRole = 'Student') {
  const currentRosterSql=rosterSql(role)
  async function run<T>(actor: number | null, lock: boolean | 'share', work: (q: PoolConnection) => Promise<T>) {
    if (!enabled()) throw new HttpError(503,'ENROLLMENT_NOT_ENABLED','Student enrollment is not enabled for this installation.')
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      if (actor !== null) await requireLibraryActor(q, id(actor), 'accounts.manage')
      if (lock) await lockEnrollment(q,lock === true)
      const value = await work(q)
      await q.commit()
      return value
    } catch (e) { await q.rollback(); throw e }
    finally { q.release() }
  }

  function lateEnrollment(actor: number, semesterId: unknown, file: EnrollmentRosterFile | undefined, body: unknown, save: false): Promise<LateEnrollmentReview>
  function lateEnrollment(actor: number, semesterId: unknown, file: EnrollmentRosterFile | undefined, body: unknown, save: true): Promise<LateEnrollmentResult>
  async function lateEnrollment(actor: number, semesterId: unknown, file: EnrollmentRosterFile | undefined, body: unknown, save: boolean) {
    const input = object(body)
    if (['scope','complete','semesterId','academicYear','termName'].some(field => field in input)) {
      throw fail(`Add ${role.toLowerCase()} records to the selected semester using the late enrollment form.`)
    }
    if (file && lateFormFields.some(field => field in input)) throw fail(`Choose either a ${role.toLowerCase()} form or a registrar file.`)
    const sourceDate = day(input.sourceDate)
    if (save && ((input.confirmed !== true && input.confirmed !== 'true') ||
      typeof input.reviewToken !== 'string' || !/^[0-9a-f]{64}$/.test(input.reviewToken))) {
      throw new HttpError(422, 'ENROLLMENT_CONFIRMATION_REQUIRED', 'Review the late entries and confirm the registrar details before saving.')
    }
    const initial = await run(actor, false, async q => {
      const term = await semester(q, semesterId)
      requireActiveTerm(term, await now(q))
      return term
    })
    const roster = file
      ? await parseEnrollmentFile(file, { academicYear: initial.academic_year, termName: initial.term_name, listedEnrolled: true, includeSource: !save, role })
      : parseLateEnrollmentForm(input, role)
    const sourceKind = file ? 'LateEnrollmentFile' : 'LateEnrollmentForm'
    const fileName = file ? safeFileName(file) : 'Entered by the library'

    return run(actor, save ? true : 'share', async q => {
      const term = await semester(q, semesterId)
      const time = await now(q)
      requireActiveTerm(term, time)
      const id = Number(term.semester_id)
      const assessment = await inspectLateEnrollment(q, id, roster, role)
      if (sourceDate > manilaDay(time)) throw fail('The registrar confirmation date cannot be in the future.')
      if (sourceDate < assessment.baseline.source_date) throw fail('Use registrar confirmation from the date of the current complete roster or later.')
      const { additions, alreadyListed, missingEmailStudentIds, rows } = assessment
      const summary = { added: additions.length, alreadyListed, missingEmail: missingEmailStudentIds.length, missingEmailStudentIds }
      const token = reviewToken('late', actor, id, sourceDate, sourceKind, fileName, roster.fingerprint, assessment.head.roster_id,
        additions.map(row => row.schoolId), alreadyListed, assessment.identities)
      if (!save) return checkedPreview({ ...rosterPreview(roster, rows), ...summary, reviewToken: token })
      if (rows.some(row => row.errors.length)) {
        throw new HttpError(422, 'ROSTER_ROWS_INVALID', 'Fix the highlighted details before saving. No records were added.', {
          rows: rows.filter(row => row.errors.length).slice(0, 25).map(row => ({ sheet: row.sheet, row: row.row, errors: row.errors })),
        })
      }
      if (!additions.length) return summary
      if (!matchesReview(input.reviewToken, token)) throw reviewChanged()
      requireActiveTerm(term, await now(q))
      const [saved] = await q.execute<ResultSetHeader>(`INSERT INTO enrollment_roster_imports
        (semester_id,source_date,complete,file_hash,file_name,student_count,uploaded_by,source_kind,roster_role)
        VALUES (?,?,FALSE,?,?,?,?,?,?)`, [id, sourceDate, lateFingerprint(sourceKind, assessment.baseline.roster_id, additions),
        fileName, additions.length, actor, sourceKind, role])
      await insertRosterStudents(q, saved.insertId, additions)
      await addRosterMembers(q, id)
      requireActiveTerm(term, await now(q))
      return summary
    })
  }

  return {
    async qrSemesters(actor: number) {
      return run(actor,false,async q => {
        const [rows] = await q.execute<RowDataPacket[]>(`SELECT semester_id,academic_year,term_name,${status} AS status
          FROM enrollment_semesters ORDER BY created_at DESC LIMIT 100`)
        return rows
      })
    },
    async qrRoster(actor: number, semesterId: unknown, pageValue: unknown, query: unknown, accountStatus: unknown = '') {
      return run(actor,false,async q => {
        const filter = text(accountStatus)
        if (!['', 'Active', 'Not registered'].includes(filter)) throw fail('Choose a valid account filter.')
        const term = await semester(q,semesterId)
        const page = pageValue === undefined ? 1 : id(pageValue)
        const [rows] = await q.execute<RowDataPacket[]>(`SELECT r.school_id,r.student_name,r.program,r.year_level,
          a.account_status,u.account_status AS user_status,c.user_id,c.public_id,c.credential_version,c.credential_status,c.secret_hash
          FROM (${currentRosterSql}) r
          LEFT JOIN accounts a ON a.school_id=r.school_id AND a.role='${role}'
          LEFT JOIN users u ON u.user_id=a.user_id
          LEFT JOIN attendance_qr_credentials c ON c.user_id=u.user_id
          WHERE STRPOS(LOWER(CONCAT_WS(' ',r.school_id,r.student_name)),LOWER(?))>0
            AND (?='' OR (?='Active' AND a.account_status='Active' AND u.account_status='Active')
              OR (?='Not registered' AND a.account_id IS NULL))
          ORDER BY r.school_id LIMIT 25 OFFSET ?`, [term.semester_id,text(query).slice(0,100),filter,filter,filter,(page-1)*24])
        const ended = Boolean(term.ended_at) || Boolean(term.started_at && new Date(term.scheduled_end_at) <= new Date())
        const cards = await Promise.all(rows.slice(0,24).map(async row => {
          const active = !ended && row.account_status === 'Active' && row.user_status === 'Active'
          const pass = active ? existingAttendancePayload(row) : null
          const qr_status = !row.account_status ? 'Registration needed' : !active ? 'Account inactive' : pass ? 'Ready' : 'Open My permanent library QR to prepare a pass'
          return { school_id: String(row.school_id), student_name: String(row.student_name),
            program: row.program as string | null, year_level: row.year_level as string | null, qr_status,
            qr_image: pass ? await QRCode.toDataURL(pass,libraryQrImageOptions) : null }
        }))
        return { rows: cards, more: rows.length > 24 }
      })
    },
    async closeDue() { if (!enabled()) return false; return run(null,true,closeDue) },
    async overview(actor: number) {
      return run(actor,true,async q => {
        await closeDue(q)
        const [rows]=await q.execute<RowDataPacket[]>(`SELECT s.semester_id,s.academic_year,s.term_name,s.end_date::text,
          s.manual_end_at,s.scheduled_end_at,s.started_at,s.ended_at,s.end_kind,${status} AS status,
          (s.started_at IS NOT NULL AND s.ended_at IS NULL AND s.manual_end_at<=clock_timestamp()) AS can_end,
          EXISTS(SELECT 1 FROM enrollment_roster_imports r WHERE r.semester_id=s.semester_id AND r.roster_role='${role}' AND r.complete) AS has_complete,
          (SELECT COUNT(*) FROM enrollment_semester_members m JOIN accounts a USING(account_id)
            WHERE m.semester_id=s.semester_id AND a.role IN ('Student','Faculty') AND a.account_status='Active') AS active_accounts,
          (SELECT row_to_json(b) FROM (SELECT r.file_name,r.student_count,r.source_date,r.complete${role === 'Student' ? ',r.source_kind' : ''} FROM enrollment_roster_imports r
            WHERE r.semester_id=s.semester_id AND r.roster_role='${role}' ORDER BY roster_id DESC LIMIT 1) b) AS latest_roster
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
    reviewLateEnrollment(actor: number, semesterId: unknown, file: EnrollmentRosterFile | undefined, body: unknown) {
      return lateEnrollment(actor, semesterId, file, body, false)
    },
    saveLateEnrollment(actor: number, semesterId: unknown, file: EnrollmentRosterFile | undefined, body: unknown) {
      return lateEnrollment(actor, semesterId, file, body, true)
    },
    async preview(actor: number, semesterId: unknown, file: EnrollmentRosterFile, body?: unknown) {
      const term = await run(actor, false, q => semester(q, semesterId))
      if (term.ended_at) throw fail('An ended semester is read-only.')
      const roster = await parseEnrollmentFile(file, { academicYear: term.academic_year, termName: term.term_name, listedEnrolled: true, includeSource: true, role })
      const input = object(body)
      const preview = rosterPreview(roster)
      if (role !== 'Student' || input.scope !== 'Complete' || !text(input.sourceDate) || roster.errors || !term.started_at) {
        return checkedPreview({ ...preview, replacement: undefined })
      }
      const sourceDate = day(input.sourceDate)
      const replacement = await run(actor, 'share', async q => {
        requireActiveTerm(await semester(q, semesterId), await now(q))
        return inspectReplacement(q, actor, Number(term.semester_id), sourceDate, roster)
      })
      return checkedPreview({ ...preview, replacement })
    },
    async upload(actor: number, semesterId: unknown, file: {buffer:Buffer;originalname:string}, body:unknown) {
      const input=object(body), sourceDate=day(input.sourceDate), scope=text(input.scope)
      if (!['Complete','Partial'].includes(scope)) throw fail('Choose complete or partial roster.')
      const initial=await run(actor,false,q=>semester(q,semesterId))
      const roster=await parseEnrollmentFile(file,{academicYear:initial.academic_year,termName:initial.term_name,listedEnrolled:true,role})
      if (roster.errors) throw new HttpError(422,'ROSTER_ROWS_INVALID',`Fix ${roster.errors} roster row(s) and upload again. The existing roster was kept.`, {
        rows: roster.rows.filter(r=>r.errors.length).slice(0,25).map(r=>({sheet:r.sheet,row:r.row,errors:r.errors})),
      })
      return run(actor,true,async q => {
        await closeDue(q)
        const term=await semester(q,semesterId)
        if (term.ended_at) throw fail('An ended semester is read-only.')
        const today = manilaDay(await now(q))
        if (sourceDate > today) throw fail('The roster date cannot be in the future.')
        const [latest]=await q.execute<RowDataPacket[]>(`SELECT source_date::text AS date FROM enrollment_roster_imports
          WHERE semester_id=? AND roster_role=? ${role === 'Student' ? "AND source_kind='RosterUpload'" : ''} ORDER BY roster_id DESC LIMIT 1`,[term.semester_id,role])
        if (latest[0]?.date && sourceDate<latest[0].date) throw fail('A newer roster is already in use.')
        if (role === 'Student' && scope === 'Complete' && term.started_at) {
          const [existing] = await q.execute<RowDataPacket[]>(`SELECT 1 FROM enrollment_roster_imports
            WHERE semester_id=? AND roster_role='Student' AND file_hash=? AND complete`, [term.semester_id, roster.fingerprint])
          if (existing.length) {
            await replenishRosterCredentials(q,Number(term.semester_id))
            return { alreadyUploaded:true, students:roster.rows.length, missingEmail:roster.warnings }
          }
          const replacement = await inspectReplacement(q, actor, Number(term.semester_id), sourceDate, roster)
          if (replacement && !matchesReview(input.replacementToken, replacement.reviewToken)) {
            throw new HttpError(409, 'ENROLLMENT_REVIEW_CHANGED', 'This complete roster would omit late students. Review the affected Student IDs before replacing the roster.')
          }
          if (!replacement && input.replacementToken) {
            throw new HttpError(409, 'ENROLLMENT_REVIEW_CHANGED', 'The roster changed. Review the complete roster again before replacing it.')
          }
        }
        const [save]=await q.execute<ResultSetHeader>(`INSERT INTO enrollment_roster_imports
          (semester_id,source_date,complete,file_hash,file_name,student_count,uploaded_by,roster_role) VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT (semester_id,roster_role,file_hash,complete) DO NOTHING`,[term.semester_id,sourceDate,scope==='Complete',roster.fingerprint,
          safeFileName(file),roster.rows.length,actor,role])
        if (!save.insertId) {
          if(role==='Student') await replenishRosterCredentials(q,Number(term.semester_id))
          return { alreadyUploaded:true, students:roster.rows.length, missingEmail:roster.warnings }
        }
        await insertRosterStudents(q, save.insertId, roster.rows.map(row => row.data))
        const [duplicates]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM (${currentRosterSql}) r WHERE school_email IS NOT NULL
          GROUP BY LOWER(school_email) HAVING COUNT(*)>1 LIMIT 1`,[term.semester_id])
        if (duplicates.length) throw fail(`Two ${role} IDs share the same school email in the resulting roster. Correct the file and upload it again.`)
        const [conflicts]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM (${currentRosterSql}) r
          JOIN accounts a ON a.school_id=r.school_id OR EXISTS(SELECT 1 FROM users u WHERE u.user_id=a.user_id AND LOWER(u.email)=LOWER(r.school_email))
          LEFT JOIN users u ON u.user_id=a.user_id
          WHERE a.role<>? OR a.school_id<>r.school_id OR (r.school_email IS NOT NULL AND COALESCE(LOWER(u.email),'')<>LOWER(r.school_email)) LIMIT 1`,[term.semester_id,role])
        if(conflicts.length)throw fail('A roster ID or email conflicts with an existing account. Review the identity with the library; no account or roster was changed.')
        const [otherRoster]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM (${currentRosterSql}) r JOIN (${rosterSql(role==='Faculty'?'Student':'Faculty')}) other ON other.school_id=r.school_id OR (r.school_email IS NOT NULL AND LOWER(other.school_email)=LOWER(r.school_email)) LIMIT 1`,[term.semester_id,term.semester_id])
        if(otherRoster.length)throw fail('A school ID or email is already listed in the other account-type roster. Review it before importing.')
        if (term.started_at) await addRosterMembers(q,Number(term.semester_id),false,role)
        if(role==='Student') await replenishRosterCredentials(q,Number(term.semester_id))
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
        const [rosters]=await q.execute<RowDataPacket[]>('SELECT 1 FROM enrollment_roster_imports WHERE semester_id=? AND roster_role=? AND complete LIMIT 1',[term.semester_id,role])
        if (!rosters.length) throw fail('Upload the complete roster before starting the semester.')
        if (role === 'Faculty') {
          const [studentRosters]=await q.execute<RowDataPacket[]>("SELECT 1 FROM enrollment_roster_imports WHERE semester_id=? AND roster_role='Student' AND complete LIMIT 1",[term.semester_id])
          if (!studentRosters.length) throw fail('Upload the complete Student roster before starting the semester.')
        }
        const time=await now(q)
        if (time>=new Date(term.manual_end_at)) throw fail('Update the end schedule before starting this semester.')
        await q.execute('UPDATE enrollment_semesters SET started_at=?,started_by=? WHERE semester_id=?',[time,actor,term.semester_id])
        await addRosterMembers(q,Number(term.semester_id),false,role)
        await addRosterMembers(q,Number(term.semester_id),false,role==='Student'?'Faculty':'Student')
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
          FROM roster r FULL JOIN (SELECT m.* FROM enrollment_semester_members m JOIN accounts member_account USING(account_id) WHERE semester_id=? AND member_account.role='${role}') m USING(school_id)
          LEFT JOIN accounts a ON a.school_id=r.school_id AND a.role='${role}' AND ?::boolean
          LEFT JOIN users u ON u.user_id=a.user_id
        ) SELECT * FROM students WHERE STRPOS(LOWER(CONCAT_WS(' ',school_id,student_name)),LOWER(?))>0
          ORDER BY school_id LIMIT 51 OFFSET ?`,[term.semester_id,term.semester_id,!term.ended_at,search,(page-1)*50])
        return { rows:rows.slice(0,50), more:rows.length>50, page, archived:Boolean(term.ended_at) }
      })
    },
    async sendActivationEmails(actor: number, semesterId: unknown, sendEmail = sendSchoolEmail) {
      const targets = await run(actor, false, async q => {
        const term = await semester(q, semesterId)
        if (term.ended_at) throw fail('Activation emails can only be sent for an active or draft semester.')
        const [rows] = await q.execute<RowDataPacket[]>(`SELECT r.roster_id, r.school_id, r.student_name, r.school_email
          FROM (${currentRosterSql}) r
          LEFT JOIN accounts a ON a.school_id = r.school_id
          LEFT JOIN users u ON LOWER(u.email) = LOWER(r.school_email)
          WHERE a.account_id IS NULL AND u.user_id IS NULL
          ORDER BY r.school_id`, [term.semester_id])
        const [cols] = await q.execute<RowDataPacket[]>(
          `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='enrollment_roster_students' AND column_name='activation_email_status' LIMIT 1`,
        )
        return { rows, hasTrackingColumns: cols.length > 0 }
      })
      const activationUrl = `${env.webOrigin.replace(/\/$/, '')}/register`
      let sent = 0, failed = 0, skippedNoEmail = 0
      const failures: Array<{ schoolId: string; reason: string }> = []
      for (const row of targets.rows) {
        const email = typeof row.school_email === 'string' ? row.school_email.trim() : ''
        const schoolId = String(row.school_id)
        if (!email) { skippedNoEmail++; continue }
        try {
          await sendEmail(
            email,
            `Activate your ${SYSTEM_SHORT_NAME} account`,
            `Hello ${row.student_name},\n\nYour ${role.toLowerCase()} record (${schoolId}) is ready for ${SYSTEM_SHORT_NAME}. Activate your library account at ${activationUrl} using your ${role} ID.\n`,
          )
          sent++
          if (targets.hasTrackingColumns) {
            await database.execute(
              `UPDATE enrollment_roster_students SET activation_email_status='Sent', activation_email_sent_at=NOW(), activation_email_error=NULL WHERE roster_id=? AND school_id=?`,
              [row.roster_id, schoolId],
            )
          }
        } catch (err) {
          failed++
          const reason = err instanceof Error ? err.message : 'Unable to send activation email.'
          failures.push({ schoolId, reason })
          if (targets.hasTrackingColumns) {
            await database.execute(
              `UPDATE enrollment_roster_students SET activation_email_status='Failed', activation_email_sent_at=NOW(), activation_email_error=? WHERE roster_id=? AND school_id=?`,
              [reason.slice(0, 500), row.roster_id, schoolId],
            )
          }
        }
      }
      return { total: targets.rows.length, sent, failed, skippedNoEmail, failures: failures.slice(0, 25) }
    },
  }
}
export const enrollmentService = createEnrollmentService()
export const facultyEnrollmentService = createEnrollmentService(db,enrollmentEnabled,'Faculty')
