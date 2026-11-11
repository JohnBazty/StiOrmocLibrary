import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { expireReadyReservations } from '../reservations/reservation-expiration.service.ts'
import { escalateOverdueTransactions } from '../circulation/circulation-overdue.service.ts'
import { generateNotifications } from '../notifications/notification.worker.ts'
import { createAttendanceOperations } from '../attendance/attendance-operations.service.ts'
import { flagUnreturnedInLibrary } from '../circulation/desk-circulation.service.ts'
import { createBookRequestService } from '../reservations/book-request.service.ts'
import { deliverBookRequestEmails } from '../reservations/book-request-email.worker.ts'
import { createCollectionReviewService } from '../catalog/collection-review.service.ts'
import { createEnrollmentService } from '../enrollment/enrollment.service.ts'
import {createPaymentOperations} from '../payments/payments.operations.ts'

const name = 'operational-minute'
const jobNow="(NOW() AT TIME ZONE 'UTC')"
const jobParameter="(?::timestamptz AT TIME ZONE 'UTC')"

export function authorizedJobToken(value: string | undefined, configured = process.env.JOB_RUNNER_SECRET?.trim()) {
  if (!configured || configured.length < 32 || !value?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(value.slice(7))
  const expected = Buffer.from(configured)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function jobRunnerStatus(database: Pool = db) {
  const times=['last_started_at','lease_until','last_success_at','last_error_at'].map(column=>`${column} AT TIME ZONE 'UTC' AS ${column}`).join(',')
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

export async function runPaymentRecovery(database:Pool=db,recover=()=>createPaymentOperations(database).recover()){
  try{return await recover()}
  catch{return {failed:true,code:'PAYMENT_RECOVERY_FAILED',message:'Payment recovery needs attention. Check Online payments.'}}
}

export async function runOperationalJobs(now = new Date(), database: Pool = db) {
  const started = Date.now()
  const {claimed,token}=await claimOperationalMinute(now,database)
  if (!claimed) return { skipped: true, reason: 'already running or completed this minute' }
  try {
    // Payment recovery has its own durable leases; an outage must not stop circulation jobs.
    const payments=await runPaymentRecovery(database)
    await createEnrollmentService(database).closeDue()
    const attendance = await createAttendanceOperations(database,()=>now).autoCheckout()
    const inLibrary = await flagUnreturnedInLibrary(database,now)
    const expiration = await expireReadyReservations(database, now)
    const preparation = await createBookRequestService(database,()=>now).advanceWaiting(now)
    const overdue = await escalateOverdueTransactions(database, now)
    const notifications = await generateNotifications(database, now)
    const requestEmails = await deliverBookRequestEmails(database,now)
    const collection = await createCollectionReviewService(database).refresh()
    const paymentFailure='failed' in payments&&payments.failed
    await database.execute(`UPDATE library_job_runs SET lease_until=NULL,run_token=NULL,last_success_at=${jobNow},last_error=?,
      last_error_at=CASE WHEN ? THEN ${jobNow} ELSE last_error_at END,failure_count=failure_count+?,run_count=run_count+1,last_duration_ms=? WHERE job_name=? AND run_token=?`,
      [paymentFailure?'Payment recovery needs attention. Check Online payments.':null,Boolean(paymentFailure),paymentFailure?1:0,Date.now()-started,name,token])
    return { skipped: false, payments, attendance, inLibrary, expiration, preparation, overdue, notifications, requestEmails, collection }
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
