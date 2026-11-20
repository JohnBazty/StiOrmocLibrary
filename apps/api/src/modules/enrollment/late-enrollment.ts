import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import type { EnrollmentData, EnrollmentFile, EnrollmentImportRow } from './enrollment-parser.ts'
import { currentRosterSql, rosterSql } from './enrollment-policy.ts'

type EffectiveStudent = RowDataPacket & {
  school_id: string
  student_name: string
  first_name: string
  last_name: string
  school_email: string | null
  program: string
  year_level: string
}
type KnownIdentity = RowDataPacket & {
  school_id: string
  role: string
  email: string | null
  full_name: string | null
  has_account: boolean
  account_status: string | null
  user_status: string | null
}
type RosterVersion = RowDataPacket & { roster_id: string | number; source_date: string }
type LateRow = EnrollmentImportRow & { disposition: 'new' | 'alreadyListed' }

const canonical = (value: string | null) => (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

function sameDetails(existing: EffectiveStudent, incoming: EnrollmentData) {
  return [
    [existing.student_name, incoming.name], [existing.first_name, incoming.firstName], [existing.last_name, incoming.lastName],
    [existing.program, incoming.program], [existing.year_level, incoming.yearLevel], [existing.school_email, incoming.email],
  ].every(([previous, next]) => canonical(previous) === canonical(next))
}

export function reviewToken(purpose: 'late' | 'replacement', ...values: unknown[]) {
  return createHmac('sha256', env.jwt.secret).update(JSON.stringify(['enrollment-review', purpose, ...values])).digest('hex')
}

export function matchesReview(input: unknown, expected: string) {
  return typeof input === 'string' && /^[0-9a-f]{64}$/.test(input) && timingSafeEqual(Buffer.from(input), Buffer.from(expected))
}

export function reviewChanged() {
  return new HttpError(409, 'ENROLLMENT_REVIEW_CHANGED', 'The roster or submitted details changed. Review the additions again before saving.')
}

export function lateFingerprint(kind: string, baseline: string | number, rows: EnrollmentData[]) {
  return createHash('sha256').update(JSON.stringify([
    kind, baseline, rows.slice().sort((a, b) => a.schoolId.localeCompare(b.schoolId)),
  ])).digest('hex')
}

export function rosterPreview(roster: EnrollmentFile, rows: EnrollmentImportRow[] = roster.rows) {
  const sheets = new Map(roster.sheets.map(name => [name, {
    name, headings: roster.headings[name], rows: [] as {
      row: number; cells: string[]; errors: string[]; warnings: string[]; status?: string
    }[],
  }]))
  for (const row of rows) {
    const status = 'disposition' in row && row.disposition === 'alreadyListed' && !row.errors.length ? 'Already on roster' : undefined
    sheets.get(row.sheet)?.rows.push({ row: row.row, cells: row.source ?? [], errors: row.errors, warnings: row.warnings, status })
  }
  return {
    studentCount: new Set(rows.map(row => row.data.schoolId).filter(Boolean)).size,
    errorCount: rows.filter(row => row.errors.length).length,
    warningCount: rows.filter(row => row.warnings.length).length,
    sheets: Array.from(sheets.values()),
  }
}

export async function inspectLateEnrollment(q: PoolConnection, semesterId: number, roster: EnrollmentFile, role: 'Student' | 'Faculty' = 'Student') {
  const otherRole = role === 'Faculty' ? 'Student' : 'Faculty'
  const [versionRows] = await q.execute<RosterVersion[]>(`SELECT roster_id,source_date::text
    FROM enrollment_roster_imports WHERE semester_id=? AND roster_role=? ORDER BY roster_id DESC LIMIT 1`, [semesterId, role])
  const [completeRows] = await q.execute<RosterVersion[]>(`SELECT roster_id,source_date::text
    FROM enrollment_roster_imports WHERE semester_id=? AND roster_role=? AND complete ORDER BY roster_id DESC LIMIT 1`, [semesterId, role])
  const head = versionRows[0]
  const baseline = completeRows[0]
  if (!head || !baseline) throw new HttpError(409, 'LATE_ENROLLMENT_NEEDS_ROSTER', `Upload the complete ${role.toLowerCase()} roster before adding late ${role.toLowerCase()} records.`)

  const schoolIds = roster.rows.map(row => row.data.schoolId).filter(Boolean)
  const emails = roster.rows.map(row => row.data.email).filter(Boolean)
  const [current] = await q.execute<EffectiveStudent[]>(`SELECT school_id,student_name,first_name,last_name,school_email,program,year_level
    FROM (${rosterSql(role)}) roster
    WHERE school_id=ANY(?::text[]) OR LOWER(school_email)=ANY(?::text[])`, [semesterId, schoolIds, emails])
  const [opposite] = await q.execute<RowDataPacket[]>(`SELECT school_id,school_email FROM (${rosterSql(otherRole)}) roster
    WHERE school_id=ANY(?::text[]) OR LOWER(school_email)=ANY(?::text[])`, [semesterId, schoolIds, emails])
  const oppositeIds = new Set(opposite.map(row => String(row.school_id)))
  const oppositeEmails = new Set(opposite.map(row => canonical(row.school_email)).filter(Boolean))
  const [identities] = await q.execute<KnownIdentity[]>(`SELECT a.school_id,a.role,u.email,u.full_name,TRUE AS has_account,
    a.account_status,u.account_status AS user_status
    FROM accounts a LEFT JOIN users u USING(user_id)
    WHERE a.school_id=ANY(?::text[]) OR LOWER(u.email)=ANY(?::text[])
    UNION ALL
    SELECT COALESCE(NULLIF(u.school_id,''),u.institutional_id),u.user_role,u.email,u.full_name,FALSE,NULL,u.account_status
    FROM users u WHERE (COALESCE(NULLIF(u.school_id,''),u.institutional_id)=ANY(?::text[]) OR LOWER(u.email)=ANY(?::text[]))
    AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id=u.user_id)
    ORDER BY school_id,has_account DESC,email`, [schoolIds, emails, schoolIds, emails])

  const currentById = new Map(current.map(row => [row.school_id, row]))
  const rosterEmailOwners = new Map(current.filter(row => row.school_email).map(row => [canonical(row.school_email), row.school_id]))
  const accountsById = new Map<string, KnownIdentity[]>()
  for (const identity of identities) {
    const records = accountsById.get(identity.school_id) ?? []
    records.push(identity)
    accountsById.set(identity.school_id, records)
  }
  const accountEmailOwners = new Map(identities.filter(row => row.email).map(row => [canonical(row.email), row.school_id]))
  const submittedEmailCounts = new Map<string, number>()
  for (const email of emails) submittedEmailCounts.set(email, (submittedEmailCounts.get(email) ?? 0) + 1)

  const rows: LateRow[] = roster.rows.map(row => {
    const { schoolId, email, name } = row.data
    const existing = currentById.get(schoolId)
    const accounts = accountsById.get(schoolId) ?? []
    const account = accounts[0]
    const errors = [...row.errors]
    const disposition = existing && sameDetails(existing, row.data) ? 'alreadyListed' : 'new'
    if (existing && disposition === 'new') errors.push(`This ${role} ID is already on the roster with different details. Use the roster correction workflow.`)
    if (accounts.length > 1 || (account && (account.role !== role || !account.has_account))) {
      errors.push(`This ${role} ID has a conflicting library record. Review the account before saving.`)
    } else if (account && (email ? canonical(account.email) !== email : canonical(account.full_name) !== canonical(name))) {
      errors.push(`These details differ from the linked account. Check the ${role} ID and school email with the registrar.`)
    }
    if (oppositeIds.has(schoolId) || oppositeEmails.has(email)) {
      errors.push(`This School ID or email is already listed in the ${otherRole} roster. Review it before saving.`)
    }
    if (email) {
      const owners = [rosterEmailOwners.get(email), accountEmailOwners.get(email)]
      if (owners.some(owner => owner && owner !== schoolId) || (submittedEmailCounts.get(email) ?? 0) > 1) {
        errors.push('This school email is used by another submitted student, roster entry or library account.')
      }
    }
    return { ...row, disposition, errors, warnings: disposition === 'alreadyListed' ? [] : row.warnings }
  })
  const additions = rows.filter(row => row.disposition === 'new' && !row.errors.length).map(row => row.data)
  const alreadyListed = rows.filter(row => row.disposition === 'alreadyListed' && !row.errors.length).length
  const missingEmailStudentIds = additions.filter(row => !row.email).map(row => row.schoolId)
  return { head, baseline, rows, additions, alreadyListed, missingEmailStudentIds, identities }
}

export async function inspectReplacement(
  q: PoolConnection, actor: number, semesterId: number, sourceDate: string, roster: EnrollmentFile,
) {
  const [versions] = await q.execute<RowDataPacket[]>(`SELECT MAX(roster_id) AS head,
    MAX(roster_id) FILTER (WHERE complete) AS baseline FROM enrollment_roster_imports WHERE semester_id=? AND roster_role='Student'`, [semesterId])
  const { head, baseline } = versions[0]
  const [omitted] = await q.execute<RowDataPacket[]>(`SELECT DISTINCT r.school_id
    FROM enrollment_roster_students r JOIN enrollment_roster_imports i USING(roster_id)
    WHERE i.semester_id=? AND i.roster_role='Student' AND i.roster_id>? AND i.source_kind IN ('LateEnrollmentForm','LateEnrollmentFile')
      AND NOT (r.school_id=ANY(?::text[])) ORDER BY r.school_id`, [semesterId, baseline, roster.rows.map(row => row.data.schoolId)])
  if (!omitted.length) return undefined
  const omittedStudentIds = omitted.map(row => String(row.school_id))
  return {
    omittedStudentIds,
    reviewToken: reviewToken('replacement', actor, semesterId, sourceDate, roster.fingerprint, head, omittedStudentIds),
  }
}
