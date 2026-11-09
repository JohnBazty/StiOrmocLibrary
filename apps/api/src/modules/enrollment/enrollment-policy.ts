import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { isPostgres } from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'

type Query = Pick<PoolConnection, 'execute'> | Pick<Pool, 'execute'>
export const enrollmentEnabled = () => isPostgres && process.env.ENROLLMENT_ROSTER_ENABLED === 'true'
export const currentRosterSql = `SELECT DISTINCT ON (r.school_id) r.*, b.semester_id
  FROM enrollment_roster_students r JOIN enrollment_roster_imports b ON b.roster_id=r.roster_id
  WHERE b.semester_id=? AND b.roster_id >= COALESCE(
    (SELECT MAX(roster_id) FROM enrollment_roster_imports WHERE semester_id=b.semester_id AND complete),0)
  ORDER BY r.school_id,b.roster_id DESC`

export async function lockEnrollment(q: Query, write = false) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT started FROM enrollment_lifecycle WHERE id=1 ${write ? 'FOR UPDATE' : 'FOR SHARE'}`)
  if (!rows.length) throw new HttpError(503, 'ENROLLMENT_NOT_READY', 'Student enrollment is not ready. Contact the library.')
  return Boolean(rows[0].started)
}

export async function rosterRegistrationRequired(q: Query) {
  if (!enrollmentEnabled()) return false
  const [rows] = await q.execute<RowDataPacket[]>('SELECT started FROM enrollment_lifecycle WHERE id=1')
  if (!rows.length) throw new HttpError(503, 'ENROLLMENT_NOT_READY', 'Student enrollment is not ready. Contact the library.')
  return Boolean(rows[0].started)
}

export async function activeEnrollmentSemester(q: Query) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT * FROM enrollment_semesters
    WHERE started_at IS NOT NULL AND ended_at IS NULL AND scheduled_end_at>clock_timestamp() LIMIT 1`)
  return rows[0] ?? null
}

export async function rosterStudent(q: Query, semesterId: number, schoolId: string) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT * FROM (${currentRosterSql}) roster WHERE school_id=?`, [semesterId, schoolId])
  return rows[0] ?? null
}

export async function enrollmentDecision(q: Query, schoolId: string, role: string) {
  if (role !== 'Student') return { allowed: true, label: 'Student enrollment check does not apply' }
  if (!await rosterRegistrationRequired(q)) return { allowed: true, label: 'Enrollment not verified' }
  const term = await activeEnrollmentSemester(q)
  if (!term) return { allowed: false, label: 'New student borrowing is paused until the next semester starts.' }
  const match = await rosterStudent(q, Number(term.semester_id), schoolId)
  return match
    ? { allowed: true, label: `Enrolled · ${term.academic_year}, ${term.term_name}` }
    : { allowed: false, label: 'This Student ID is not listed in the current semester roster.' }
}

export async function linkSemesterMember(q: Query, semesterId: number, accountId: number, schoolId: string, name: string) {
  await q.execute(`INSERT INTO enrollment_semester_members(semester_id,account_id,school_id,student_name)
    VALUES (?,?,?,?) ON CONFLICT (semester_id,account_id) DO NOTHING`, [semesterId, accountId, schoolId, name])
}

/** Block access at the cutoff, even while persistence is waiting for the job runner. */
export async function semesterAccessEnded(q: Query, accountId: number) {
  if (!enrollmentEnabled()) return false
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT s.ended_at IS NOT NULL OR s.scheduled_end_at<=clock_timestamp() AS ended
    FROM enrollment_semester_members m JOIN enrollment_semesters s USING(semester_id)
    WHERE m.account_id=? ORDER BY s.started_at DESC LIMIT 1`, [accountId])
  return Boolean(rows[0]?.ended)
}

/** A version match proves that semester closure, not a newer restriction, deactivated this account. */
export async function restorationEvidence(q: Query, accountId: number, schoolId: string, email: string) {
  if (!enrollmentEnabled() || !email) return null
  const term = await activeEnrollmentSemester(q)
  if (!term) return null
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT m.semester_id
    FROM enrollment_semester_members m JOIN enrollment_semesters s USING(semester_id)
    JOIN accounts a USING(account_id) JOIN users u ON u.user_id=a.user_id
    WHERE m.account_id=? AND a.role='Student' AND a.school_id=? AND LOWER(u.email)=LOWER(?)
      AND a.account_status='Deactivated' AND u.account_status='Deactivated'
      AND m.closed_auth_version=a.auth_version AND s.ended_at IS NOT NULL
      AND s.ended_at<=?::timestamptz
    ORDER BY s.ended_at DESC LIMIT 1`, [accountId, schoolId, email, term.started_at])
  if (!rows.length) return null
  const match = await rosterStudent(q, Number(term.semester_id), schoolId)
  return match?.school_email?.toLowerCase() === email.toLowerCase()
    ? { semesterId: Number(term.semester_id), name: String(match.student_name) } : null
}
