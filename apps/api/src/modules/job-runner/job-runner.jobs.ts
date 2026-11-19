import {createOwnershipTransfer} from '../users/ownership-transfer.service.ts'
import {createPasswordResetLinks} from '../auth/password-reset-links.service.ts'
import {createWebPush} from '../notifications/web-push.ts'
import {createDocumentRetention} from '../printing/document-retention.ts'
import { createUrgentCases } from '../fines/urgent-cases.ts'
import { createPrintingPhaseOneService } from '../printing/printing-phase-one.service.ts'
import type { Pool } from '../../config/db.js'
import { db } from '../../config/db.js'
import { createAttendanceOperations } from '../attendance/attendance-operations.service.ts'
import { createCollectionReviewService } from '../catalog/collection-review.service.ts'
import { escalateOverdueTransactions } from '../circulation/circulation-overdue.service.ts'
import { flagUnreturnedInLibrary } from '../circulation/desk-circulation.service.ts'
import { createEnrollmentService } from '../enrollment/enrollment.service.ts'
import { generateNotifications } from '../notifications/notification.worker.ts'
import { deliverDeskReminderEmails } from '../notifications/overdue-email.worker.ts'
import { deliverBookRequestEmails } from '../reservations/book-request-email.worker.ts'
import { createBookRequestService } from '../reservations/book-request.service.ts'
import { createBorrowingScheduleService, parseScheduleCursor } from '../reservations/borrowing-schedule.service.ts'
import { expireReadyReservations } from '../reservations/reservation-expiration.service.ts'
import { parseOverdueCursor } from './job-runner.rules.ts'
import { createPaymentOperations } from '../payments/payments.operations.ts'
import { localPaymentPreview } from '../payments/payments.preview.ts'

/** Run order for `all`, kept from the earlier single chain. Only these names are accepted by the internal route. */
export const JOB_NAMES = [
  'enrollment-close',
  'password-reset-emails',
  'ownership-emails',
  'attendance-auto-checkout',
  'in-library-unreturned',
  'reservation-expiration',
  'book-request-advance',
  'borrowing-schedules',
  'circulation-overdue',
  'notifications',
  'book-request-emails',
  'collection-review-refresh',
  'payment-recovery',
  'printing-analysis-cleanup',
  'announcement-push',
  'printing-document-expiry',
] as const

export type JobName = (typeof JOB_NAMES)[number]
export type JobOutput = { result: Record<string, number | boolean>; cursor?: string | null }
export type JobHandlers = Record<JobName, (context: { cursor: string | null }) => Promise<JobOutput>>

export const isJobName = (value: string): value is JobName => (JOB_NAMES as readonly string[]).includes(value)

/** Keeps only top-level counts and flags, so a job's stored result stays small and holds no personal data. */
function counts(value: unknown): Record<string, number | boolean> {
  if (typeof value === 'number' || typeof value === 'boolean') return { value }
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'number' || typeof item === 'boolean')) as Record<string, number | boolean>
}

export function createJobHandlers(database: Pool = db, clock = () => new Date(), recoverPayments: () => Promise<unknown> = async () => ({ ...await createPaymentOperations(database).recover(), ...(database === db && localPaymentPreview ? await localPaymentPreview.moneyOut.recover() : {}) })): JobHandlers {
  return {
    'ownership-emails':async()=>({result:counts(await createOwnershipTransfer(database).deliver())}),
    'password-reset-emails':async()=>({result:counts(await createPasswordResetLinks(database).deliver())}),
    'enrollment-close': async () => ({ result: counts({ closed: await createEnrollmentService(database).closeDue() }) }),
    'attendance-auto-checkout': async () => ({ result: counts(await createAttendanceOperations(database, clock).autoCheckout()) }),
    'in-library-unreturned': async () => ({ result: counts(await flagUnreturnedInLibrary(database, clock())) }),
    'reservation-expiration': async () => ({ result: counts(await expireReadyReservations(database, clock())) }),
    'book-request-advance': async () => ({ result: counts(await createBookRequestService(database, clock).advanceWaiting(clock())) }),
    'borrowing-schedules': async ({cursor}) => {
      const {nextCursor,...result}=await createBorrowingScheduleService(database,clock).process(parseScheduleCursor(cursor))
      return {result:counts(result),cursor:nextCursor}
    },
    'circulation-overdue': async ({ cursor }) => {
      const after = parseOverdueCursor(cursor)
      if (cursor && !after) console.warn('[Job runner] circulation-overdue cursor could not be read; the scan restarts from the oldest loan.')
      const { nextCursor, ...result } = await escalateOverdueTransactions(database, clock(), undefined, after)
      return { result: counts(result), cursor: nextCursor ? JSON.stringify(nextCursor) : null }
    },
    notifications: async () => ({ result: counts({...await generateNotifications(database, clock()),...await createUrgentCases(database).notify(clock()),...await deliverDeskReminderEmails(database, clock())}) }),
    'book-request-emails': async () => ({ result: counts(await deliverBookRequestEmails(database, clock())) }),
    'collection-review-refresh': async () => ({ result: counts(await createCollectionReviewService(database).refresh()) }),
    'announcement-push':async()=>({result:counts(await createWebPush(database).deliver(clock()))}),
    'printing-document-expiry':async()=>({result:counts(await createDocumentRetention(database).cleanup(clock()))}),
    'printing-analysis-cleanup': async () => ({result:{removed:await createPrintingPhaseOneService(database).cleanupExpired()}}),
    'payment-recovery': async () => {
      try { return { result: counts(await recoverPayments()) } }
      catch { throw Object.assign(new Error('Payment recovery needs attention. Check Online payments.'), { code: 'PAYMENT_RECOVERY_FAILED' }) }
    },
  }
}
