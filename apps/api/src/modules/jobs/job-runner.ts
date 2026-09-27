import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { expireReadyReservations } from '../reservations/reservation-expiration.service.ts'
import { escalateOverdueTransactions } from '../circulation/circulation-overdue.service.ts'
import { generateNotifications } from '../notifications/notification.worker.ts'

const name = 'operational-minute'

export function authorizedJobToken(value: string | undefined, configured = process.env.JOB_RUNNER_SECRET?.trim()) {
  if (!configured || configured.length < 32 || !value?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(value.slice(7))
  const expected = Buffer.from(configured)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function jobRunnerStatus(database: Pool = db) {
  const [rows] = await database.execute<RowDataPacket[]>('SELECT job_name,last_started_at,lease_until,last_success_at,last_error_at,last_error,run_count,failure_count,last_duration_ms FROM library_job_runs WHERE job_name=?', [name])
  return rows[0] ?? null
}

export async function runOperationalJobs(now = new Date(), database: Pool = db) {
  const started = Date.now()
  const currentMinute = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
  const leaseUntil = new Date(now.getTime() + 5 * 60_000)
  const token = randomUUID()
  const [claim] = await database.execute<ResultSetHeader>(
    `UPDATE library_job_runs SET last_started_at=?,lease_until=?,run_token=?
      WHERE job_name=? AND (lease_until IS NULL OR lease_until<NOW())
        AND (last_success_at IS NULL OR last_success_at<?)`, [now, leaseUntil, token, name, currentMinute])
  if (!claim.affectedRows) return { skipped: true, reason: 'already running or completed this minute' }
  try {
    const expiration = await expireReadyReservations(database, now)
    const overdue = await escalateOverdueTransactions(database, now)
    const notifications = await generateNotifications(database, now)
    await database.execute('UPDATE library_job_runs SET lease_until=NULL,run_token=NULL,last_success_at=NOW(),last_error=NULL,run_count=run_count+1,last_duration_ms=? WHERE job_name=? AND run_token=?', [Date.now() - started, name, token])
    return { skipped: false, expiration, overdue, notifications }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown scheduled job failure'
    await database.execute('UPDATE library_job_runs SET lease_until=NULL,run_token=NULL,last_error_at=NOW(),last_error=?,failure_count=failure_count+1,last_duration_ms=? WHERE job_name=? AND run_token=?', [message, Date.now() - started, name, token])
    await database.execute("INSERT INTO admin_notifications(event_type,message_title,message_body) VALUES ('scheduled_job_failed','Scheduled library job failed',?)", [message.slice(0, 500)])
    throw error
  }
}
