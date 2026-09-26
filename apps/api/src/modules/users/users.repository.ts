import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { isPostgres } from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'

const statuses = ['Active', 'Deactivated', 'Archived'] as const
type Status = typeof statuses[number]
export type UserFilters = { q: string; role: string; program: string; clearance: string; status: string; page: number; limit: number }

function id(value: unknown) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(422, 'USER_ID_INVALID', 'Choose a valid account.')
  return number
}
function reason(value: unknown) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length < 3 || result.length > 500) throw new HttpError(422, 'USER_REASON_REQUIRED', 'Give a reason between 3 and 500 characters.')
  return result
}
function profile(body: Record<string, unknown>) {
  const firstName = String(body.first_name ?? '').trim(), lastName = String(body.last_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase(), contact = String(body.contact_number ?? '').trim()
  const program = String(body.program_strand ?? '').trim(), year = String(body.year_grade_level ?? '').trim()
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) throw new HttpError(422, 'USER_NAME_INVALID', 'Enter first and last names up to 100 characters each.')
  if (!email || email.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'USER_EMAIL_INVALID', 'Enter a valid email address.')
  if (contact.length > 30) throw new HttpError(422, 'USER_CONTACT_INVALID', 'Contact number must be at most 30 characters.')
  if (!program || program.length > 150 || !year || year.length > 100) throw new HttpError(422, 'USER_ACADEMIC_DETAILS_INVALID', 'Enter a program and year or grade level.')
  return { firstName, lastName, email, contact, program, year, reason: reason(body.reason) }
}
export function parseUserFilters(q: Record<string, unknown>): UserFilters {
  const status = String(q.status ?? '').trim()
  if (status && !statuses.includes(status as Status)) throw new HttpError(422, 'USER_STATUS_INVALID', 'Choose a valid account status.')
  const page = Number(q.page), limit = Number(q.limit)
  return { q: String(q.q ?? '').trim().slice(0, 150), role: String(q.role ?? '').trim().slice(0, 30),
    program: String(q.program ?? '').trim().slice(0, 150), clearance: String(q.clearance ?? '').trim().slice(0, 30), status,
    page: Number.isFinite(page) ? Math.max(1, Math.min(100000, Math.trunc(page))) : 1,
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 25 }
}
export const parseActiveUserFilters = (q: Record<string, unknown>) => parseUserFilters({ ...q, status: 'Active' })

export class UsersRepository {
  private readonly pool: Pool
  constructor(pool: Pool = db) { this.pool = pool }
  private base() { return 'FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id LEFT JOIN student_profiles sp ON sp.account_id=a.account_id LEFT JOIN clearance_statuses cs ON cs.user_id=u.user_id' }
  private where(f: UserFilters) {
    const clauses = ['1=1'], values: Array<string | number> = []
    if (f.status) { clauses.push('a.account_status=?'); values.push(f.status) }
    if (f.q) { const q = `%${f.q}%`; clauses.push("(a.school_id LIKE ? OR CONCAT_WS(' ',sp.first_name,sp.last_name) LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)"); values.push(q, q, q, q) }
    if (f.role) { clauses.push('a.role=?'); values.push(f.role) }
    if (f.program) { clauses.push("COALESCE(sp.program_strand,u.course_or_strand,'')=?"); values.push(f.program) }
    if (f.clearance) { clauses.push("COALESCE(cs.standing_status,'Cleared')=?"); values.push(f.clearance) }
    return { sql: clauses.join(' AND '), values }
  }
  async summary() {
    const counts = isPostgres
      ? `COUNT(*) FILTER (WHERE account_status='Active') active_accounts,COUNT(*) FILTER (WHERE account_status='Deactivated') deactivated_accounts,
         COUNT(*) FILTER (WHERE account_status='Archived') archived_accounts,
         COUNT(*) FILTER (WHERE role='Student' AND account_status='Active') student_accounts,
         COUNT(*) FILTER (WHERE role='Faculty' AND account_status='Active') faculty_accounts,
         COUNT(*) FILTER (WHERE role IN ('Admin','Librarian') AND account_status='Active') staff_accounts`
      : `SUM(account_status='Active') active_accounts,SUM(account_status='Deactivated') deactivated_accounts,
         SUM(account_status='Archived') archived_accounts,SUM(role='Student' AND account_status='Active') student_accounts,
         SUM(role='Faculty' AND account_status='Active') faculty_accounts,
         SUM(role IN ('Admin','Librarian') AND account_status='Active') staff_accounts`
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT ${counts} FROM accounts`)
    return rows[0]
  }
  async programs() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT DISTINCT COALESCE(sp.program_strand,u.course_or_strand) program ${this.base()} WHERE COALESCE(sp.program_strand,u.course_or_strand) IS NOT NULL ORDER BY program`)
    return rows.map(row => row.program)
  }
  async directory(filters: UserFilters) {
    const where = this.where(filters), offset = (filters.page - 1) * filters.limit
    const [counts] = await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) total ${this.base()} WHERE ${where.sql}`, where.values)
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT a.account_id id,a.school_id,a.role,a.account_status,
              COALESCE(NULLIF(CONCAT_WS(' ',sp.first_name,sp.last_name),''),u.full_name,a.school_id) full_name,
              COALESCE(u.email,'—') email,COALESCE(sp.program_strand,u.course_or_strand,'—') program,
              COALESCE(sp.year_grade_level,u.section,'—') year_or_unit,COALESCE(cs.standing_status,'Cleared') clearance_status
         ${this.base()} WHERE ${where.sql} ORDER BY full_name,a.school_id LIMIT ${filters.limit} OFFSET ${offset}`, where.values)
    const total = Number(counts[0]?.total ?? 0)
    return { rows, pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } }
  }
  active(filters: UserFilters) { return this.directory({ ...filters, status: 'Active' }) }
  async detail(value: unknown) {
    const accountId = id(value)
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT a.account_id id,a.school_id,a.role,a.account_status,a.contact_number,
              u.email,u.user_id,sp.first_name,sp.last_name,sp.program_strand,sp.year_grade_level,
              COALESCE(u.full_name,a.school_id) full_name
         FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id
         LEFT JOIN student_profiles sp ON sp.account_id=a.account_id WHERE a.account_id=?`, [accountId])
    if (!rows[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'Account not found.')
    const [events] = await this.pool.execute<RowDataPacket[]>(
      `SELECT e.event_id id,e.action_code action,e.previous_status,e.new_status,e.changed_fields,e.reason,e.created_at,
              actor.school_id actor_school_id
         FROM account_management_events e JOIN accounts actor ON actor.account_id=e.actor_account_id
        WHERE e.account_id=? ORDER BY e.event_id DESC LIMIT 30`, [accountId])
    return { ...rows[0], events }
  }
  async editProfile(value: unknown, actorValue: unknown, body: Record<string, unknown>) {
    const accountId = id(value), actor = id(actorValue), input = profile(body)
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [accounts] = await connection.execute<RowDataPacket[]>('SELECT account_id,user_id,role,account_status,contact_number FROM accounts WHERE account_id=? FOR UPDATE', [accountId])
      const account = accounts[0]
      if (!account) throw new HttpError(404, 'USER_NOT_FOUND', 'Account not found.')
      if (account.role !== 'Student') throw new HttpError(422, 'USER_ROLE_READ_ONLY', 'Only student profiles can be edited here.')
      if (!account.user_id) throw new HttpError(409, 'USER_PROFILE_NOT_LINKED', 'This account needs its operational profile linked before editing.')
      const [users] = await connection.execute<RowDataPacket[]>('SELECT full_name,email,course_or_strand FROM users WHERE user_id=? FOR UPDATE', [account.user_id])
      if (!users[0]) throw new HttpError(409, 'USER_PROFILE_NOT_LINKED', 'This account needs its operational profile linked before editing.')
      const [profiles] = await connection.execute<RowDataPacket[]>('SELECT first_name,last_name,program_strand,year_grade_level FROM student_profiles WHERE account_id=? FOR UPDATE', [accountId])
      const old = { first_name: profiles[0]?.first_name ?? '', last_name: profiles[0]?.last_name ?? '', email: users[0]?.email ?? '', contact_number: account.contact_number ?? '', program_strand: profiles[0]?.program_strand ?? '', year_grade_level: profiles[0]?.year_grade_level ?? '' }
      const next = { first_name: input.firstName, last_name: input.lastName, email: input.email, contact_number: input.contact, program_strand: input.program, year_grade_level: input.year }
      const changedFields = (Object.keys(next) as Array<keyof typeof next>).filter(key => String(old[key]) !== String(next[key]))
      if (!changedFields.length) throw new HttpError(422, 'USER_NO_CHANGES', 'Change at least one profile field before saving.')
      await connection.execute('UPDATE accounts SET contact_number=?,updated_at=NOW() WHERE account_id=?', [input.contact || null, accountId])
      await connection.execute('UPDATE users SET full_name=?,email=?,course_or_strand=?,updated_at=NOW() WHERE user_id=?', [`${input.firstName} ${input.lastName}`, input.email, input.program, account.user_id])
      if (profiles[0]) await connection.execute('UPDATE student_profiles SET first_name=?,last_name=?,program_strand=?,year_grade_level=?,updated_at=NOW() WHERE account_id=?', [input.firstName, input.lastName, input.program, input.year, accountId])
      else await connection.execute('INSERT INTO student_profiles(account_id,first_name,last_name,program_strand,year_grade_level) VALUES (?,?,?,?,?)', [accountId, input.firstName, input.lastName, input.program, input.year])
      await connection.execute(`INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,changed_fields,reason)
        VALUES (?,?,'ProfileEdited',?,?,?,?)`, [accountId, actor, account.account_status, account.account_status, changedFields.join(','), input.reason])
      await connection.commit()
      return { id: accountId, changed_fields: changedFields }
    } catch (error) {
      await connection.rollback()
      if (['23505', 'ER_DUP_ENTRY'].includes((error as { code?: string })?.code ?? '')) throw new HttpError(422, 'USER_EMAIL_IN_USE', 'This email address is already used by another account.')
      throw error
    } finally { connection.release() }
  }
  async changeStatus(value: unknown, actorValue: unknown, body: Record<string, unknown>) {
    const accountId = id(value), actor = id(actorValue), next = String(body.status ?? '') as Status
    if (!statuses.includes(next)) throw new HttpError(422, 'USER_STATUS_INVALID', 'Choose Active, Deactivated, or Archived.')
    const auditReason = reason(body.reason), connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [accounts] = await connection.execute<RowDataPacket[]>('SELECT account_id,user_id,role,account_status FROM accounts WHERE account_id=? FOR UPDATE', [accountId])
      const account = accounts[0]
      if (!account) throw new HttpError(404, 'USER_NOT_FOUND', 'Account not found.')
      if (account.role !== 'Student') throw new HttpError(422, 'USER_ROLE_READ_ONLY', 'Only student accounts can be changed here.')
      if (!account.user_id) throw new HttpError(409, 'USER_PROFILE_NOT_LINKED', 'This account needs its operational profile linked before changing its status.')
      if (account.account_status === next) throw new HttpError(409, 'USER_STATUS_UNCHANGED', `This account is already ${next.toLowerCase()}.`)
      if (next === 'Archived') {
        const [loans] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) active_count FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Borrowed','Overdue')", [account.user_id])
        const [reservations] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) active_count FROM reservations WHERE user_id=? AND reservation_status IN ('pending','approved','ready_for_pickup')", [account.user_id])
        if (Number(loans[0]?.active_count ?? 0) || Number(reservations[0]?.active_count ?? 0)) throw new HttpError(409, 'USER_HAS_OPEN_ACTIVITY', 'Return borrowed books and close reservations before archiving this account.')
      }
      await connection.execute('UPDATE accounts SET account_status=?,auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?', [next, accountId])
      await connection.execute('UPDATE users SET account_status=?,auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?', [next, account.user_id])
      await connection.execute(`INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,reason)
        VALUES (?,?,?,?,?,?)`, [accountId, actor, next === 'Active' ? 'Activated' : next === 'Archived' ? 'Archived' : 'Deactivated', account.account_status, next, auditReason])
      await connection.commit()
      return { id: accountId, account_status: next }
    } catch (error) { await connection.rollback(); throw error }
    finally { connection.release() }
  }
}
export const usersRepository = new UsersRepository()
