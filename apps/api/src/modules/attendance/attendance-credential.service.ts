import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { attendancePurposes, type AttendancePurpose } from './attendance.validation.ts'
import { isPostgres } from '../../config/sql-dialect.js'

type Executor = Pool | PoolConnection
export type AttendanceCredential = {
  credentialId: number
  userId: number
  publicId: string
  payload: string
  issuedAt: Date
}

const prefix = 'STILIB.ATTENDANCE.1'
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
const randomToken = (bytes: number) => randomBytes(bytes).toString('base64url')
const credentialSecret = (publicId: string, userId: number, version: number) =>
  createHmac('sha256', env.attendanceQr.secret).update(`${publicId}:${userId}:${version}`, 'utf8').digest('base64url')

function payload(publicId: string, secret: string) {
  return `${prefix}.${publicId}.${secret}`
}

export function purposeAttendanceQr(base: string, purpose: AttendancePurpose, now = new Date()) {
  if (!attendancePurposes.includes(purpose)) throw new HttpError(422,'ATTENDANCE_PURPOSE_REQUIRED','Choose a valid visit purpose.')
  const parsed = parseAttendanceQr(base)
  const unsigned = `STILIB.ATTENDANCE.2.${parsed.publicId}.${parsed.secret}.${attendancePurposes.indexOf(purpose)}.${Math.floor(now.getTime()/1000)+900}`
  return `${unsigned}.${createHmac('sha256',env.attendanceQr.secret).update(unsigned).digest('base64url')}`
}

export function parseAttendanceQr(value: unknown, now = new Date()) {
  const text = String(value ?? '').trim()
  const purposeMatch = /^STILIB\.ATTENDANCE\.2\.([A-Za-z0-9_-]{16,40})\.([A-Za-z0-9_-]{32,80})\.([0-5])\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(text)
  if (purposeMatch) {
    const expected = createHmac('sha256',env.attendanceQr.secret).update(text.slice(0,text.lastIndexOf('.'))).digest()
    const supplied = Buffer.from(purposeMatch[5],'base64url')
    if (expected.length !== supplied.length || !timingSafeEqual(expected,supplied)) throw new HttpError(422,'ATTENDANCE_QR_INVALID','The visit purpose QR is invalid.')
    const expires = Number(purposeMatch[4])
    if (expires <= Math.floor(now.getTime()/1000) || expires > Math.floor(now.getTime()/1000)+900) throw new HttpError(422,'ATTENDANCE_QR_EXPIRED','This visit QR has expired. Generate a new one or use your permanent pass.')
    return {publicId:purposeMatch[1],secret:purposeMatch[2],payload:text,purpose:attendancePurposes[Number(purposeMatch[3])] as AttendancePurpose}
  }
  const match = /^STILIB\.ATTENDANCE\.1\.([A-Za-z0-9_-]{16,40})\.([A-Za-z0-9_-]{32,80})$/.exec(text)
  if (!match) throw new HttpError(422, 'ATTENDANCE_QR_INVALID', 'This is not a valid STI Library attendance QR code.')
  return { publicId: match[1], secret: match[2], payload: text, purpose: null }
}

export async function issueAttendanceCredential(executor: Executor, userId: number): Promise<AttendanceCredential> {
  const [existing] = await executor.execute<RowDataPacket[]>(
    `SELECT credential_id,user_id,public_id,credential_version,issued_at,credential_status
       FROM attendance_qr_credentials WHERE user_id=? LIMIT 1`, [userId],
  )
  if (existing[0]?.credential_status === 'Active') {
    const version = Number(existing[0].credential_version)
    const publicId = String(existing[0].public_id)
    const secret = credentialSecret(publicId, userId, version)
    return { credentialId: Number(existing[0].credential_id), userId, publicId, payload: payload(publicId, secret), issuedAt: new Date(existing[0].issued_at) }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicId = randomToken(12)
    const version = Number(existing[0]?.credential_version ?? 0) + 1
    const secret = credentialSecret(publicId, userId, version)
    try {
      if (existing[0]) {
        await executor.execute(
          `UPDATE attendance_qr_credentials
              SET public_id=?,secret_hash=?,credential_status='Active',credential_version=credential_version+1,
                  issued_at=NOW(),last_used_at=NULL,revoked_at=NULL,updated_at=NOW()
            WHERE user_id=?`, [publicId, digest(secret), userId],
        )
        return { credentialId: Number(existing[0].credential_id), userId, publicId, payload: payload(publicId, secret), issuedAt: new Date() }
      }
      const [result] = await executor.execute(
        `INSERT INTO attendance_qr_credentials(user_id,public_id,secret_hash,credential_version,credential_status,issued_at)
         VALUES (?,?,?,?, 'Active',NOW())`, [userId, publicId, digest(secret), version],
      ) as [{ insertId: number }, unknown]
      return { credentialId: Number(result.insertId), userId, publicId, payload: payload(publicId, secret), issuedAt: new Date() }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY' || attempt === 2) throw error
    }
  }
  throw new HttpError(500, 'ATTENDANCE_QR_ISSUE_FAILED', 'Unable to issue an attendance pass.')
}

export async function validateAttendanceCredential(executor: Executor, value: unknown, lock = false, now = new Date()) {
  const parsed = parseAttendanceQr(value, now)
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT c.credential_id,c.user_id,c.secret_hash,c.credential_status,c.issued_at,${isPostgres?`to_char(c.last_used_at,'YYYY-MM-DD"T"HH24:MI:SS.MS')`:'c.last_used_at'} AS last_used_at,
            u.school_id,u.full_name,u.user_role,u.account_status,u.course_or_strand,u.section
       FROM attendance_qr_credentials c
       JOIN users u ON u.user_id=c.user_id
      WHERE c.public_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [parsed.publicId],
  )
  const row = rows[0]
  const stored = row?.secret_hash as Buffer | undefined
  const supplied = digest(parsed.secret)
  if (!row || !stored || stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
    throw new HttpError(422, 'ATTENDANCE_QR_INVALID', 'This attendance QR code is invalid or no longer recognized.')
  }
  if (row.credential_status !== 'Active') throw new HttpError(422, 'ATTENDANCE_QR_REVOKED', 'This attendance QR code has been revoked.')
  if (row.account_status !== 'Active') throw new HttpError(403, 'ATTENDANCE_ACCOUNT_INACTIVE', 'This library account is not active.')
  return {
    credentialId: Number(row.credential_id), userId: Number(row.user_id), publicId: parsed.publicId,
    schoolId: String(row.school_id), name: String(row.full_name), role: String(row.user_role),
    program: row.course_or_strand ? String(row.course_or_strand) : null,
    section: row.section ? String(row.section) : null, issuedAt: row.issued_at, lastUsedAt: row.last_used_at, purpose: parsed.purpose,
  }
}

export const attendanceCredentialFormat = { prefix }
