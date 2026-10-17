import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { expireReadyReservations } from '../reservations/reservation-expiration.service.ts'
import { escalateOverdueTransactions } from '../circulation/circulation-overdue.service.ts'
import { generateNotifications } from '../notifications/notification.worker.ts'
import { createAttendanceOperations } from '../attendance/attendance-operations.service.ts'
import { isPostgres } from '../../config/sql-dialect.js'
import { flagUnreturnedInLibrary } from '../circulation/desk-circulation.service.ts'
import { createBookRequestService } from '../reservations/book-request.service.ts'
import { deliverBookRequestEmails } from '../reservations/book-request-email.worker.ts'
import { createCollectionReviewService } from '../catalog/collection-review.service.ts'

const name = 'operational-minute'
const jobNow=isPostgres?"(NOW() AT TIME ZONE 'UTC')":'NOW()'
const jobParameter=isPostgres?"(?::timestamptz AT TIME ZONE 'UTC')":'?'

export function authorizedJobToken(value: string | undefined, configured = process.env.JOB_RUNNER_SECRET?.trim()) {
  if (!configured || configured.length < 32 || !value?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(value.slice(7))
  const expected = Buffer.from(configured)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function jobRunnerStatus(database: Pool = db) {
  const times=['last_started_at','lease_until','last_success_at','last_error_at'].map(column=>isPostgres?`${column} AT TIME ZONE 'UTC' AS ${column}`:column).join(',')
  const [rows] = await database.execute<RowDataPacket[]>(`SELECT job_name,${times},last_error,run_count,failure_count,last_duration_ms FROM library_job_runs WHERE job_name=?`, [name])
  return rows[0] ?? null
}

export async function claimOperationalMinute(now:Date,database:Pool=db){
  const currentMinute = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
  const leaseUntil = new Date(now.getTime() + 5 * 60_000)
  const token = randomUUID()
  const [claim] = await database.execute<ResultSetHeader>(
    `UPDATE library_job_runs SET last_started_at=${jobParameter},lease_until=${jobParameter},run_token=?
      WHERE job_name=? AND (lease_until IS NULL OR lease_until<${jobNow})
        AND (last_success_at IS NULL OR last_success_at<${jobParameter})`, [now, leaseUntil, token, name, currentMinute])
  return {claimed:Boolean(claim.affectedRows),token}
}

export async function runOperationalJobs(now = new Date(), database: Pool = db) {
  const started = Date.now()
  const {claimed,token}=await claimOperationalMinute(now,database)
  if (!claimed) return { skipped: true, reason: 'already running or completed this minute' }
  try {
    const attendance = await createAttendanceOperations(database,()=>now).autoCheckout()
    const inLibrary = isPostgres ? await flagUnreturnedInLibrary(database,now) : {flagged:0}
    const expiration = await expireReadyReservations(database, now)
    const preparation = isPostgres ? await createBookRequestService(database,()=>now).advanceWaiting(now) : {assigned:0}
    const overdue = await escalateOverdueTransactions(database, now)
    const notifications = await generateNotifications(database, now)
    const requestEmails = isPostgres ? await deliverBookRequestEmails(database,now) : {sent:0,failed:0}
    const collection = isPostgres ? await createCollectionReviewService(database).refresh() : {titles:0,shortfalls:0}
    await database.execute(`UPDATE library_job_runs SET lease_until=NULL,run_token=NULL,last_success_at=${jobNow},last_error=NULL,run_count=run_count+1,last_duration_ms=? WHERE job_name=? AND run_token=?`, [Date.now() - started, name, token])
    return { skipped: false, attendance, inLibrary, expiration, preparation, overdue, notifications, requestEmails, collection }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown scheduled job failure'
    await database.execute(`UPDATE library_job_runs SET lease_until=NULL,run_token=NULL,last_error_at=${jobNow},last_error=?,failure_count=failure_count+1,last_duration_ms=? WHERE job_name=? AND run_token=?`, [message, Date.now() - started, name, token])
    await database.execute("INSERT INTO admin_notifications(event_type,message_title,message_body) VALUES ('scheduled_job_failed','Scheduled library job failed',?)", [message.slice(0, 500)])
    throw error
  }
}

/** Local minute runner also recovers missed closing checkouts on startup. */
export function startOperationalJobWorker(database:Pool=db,intervalMs=60_000){
 let running=false
 const run=async()=>{if(running)return;running=true;try{await runOperationalJobs(new Date(),database)}catch(error){console.error('[Library jobs] Operational run failed.',error)}finally{running=false}}
 void run()
 const timer=setInterval(()=>void run(),intervalMs);timer.unref()
 return {run,stop:()=>clearInterval(timer)}
}
