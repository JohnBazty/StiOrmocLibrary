import type { Pool } from '../../config/db.js'
import { db } from '../../config/db.js'
import { createAttendanceOperations } from '../attendance/attendance-operations.service.ts'
import { createCollectionReviewService } from '../catalog/collection-review.service.ts'
import { escalateOverdueTransactions } from '../circulation/circulation-overdue.service.ts'
import { flagUnreturnedInLibrary } from '../circulation/desk-circulation.service.ts'
import { createEnrollmentService } from '../enrollment/enrollment.service.ts'
import { generateNotifications } from '../notifications/notification.worker.ts'
import { deliverBookRequestEmails } from '../reservations/book-request-email.worker.ts'
import { createBookRequestService } from '../reservations/book-request.service.ts'
import { expireReadyReservations } from '../reservations/reservation-expiration.service.ts'
import { parseOverdueCursor } from './job-runner.rules.ts'
import { createPaymentOperations } from '../payments/payments.operations.ts'
import { localPaymentPreview } from '../payments/payments.preview.ts'

/** Run order for `all`, kept from the earlier single chain. Only these names are accepted by the internal route. */
export const JOB_NAMES = [
  'enrollment-close',
  'attendance-auto-checkout',
  'in-library-unreturned',
  'reservation-expiration',
  'book-request-advance',
  'circulation-overdue',
  'notifications',
  'book-request-emails',
  'collection-review-refresh',
  'payment-recovery',
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
    'enrollment-close': async () => ({ result: counts({ closed: await createEnrollmentService(database).closeDue() }) }),
    'attendance-auto-checkout': async () => ({ result: counts(await createAttendanceOperations(database, clock).autoCheckout()) }),
    'in-library-unreturned': async () => ({ result: counts(await flagUnreturnedInLibrary(database, clock())) }),
    'reservation-expiration': async () => ({ result: counts(await expireReadyReservations(database, clock())) }),
    'book-request-advance': async () => ({ result: counts(await createBookRequestService(database, clock).advanceWaiting(clock())) }),
    'circulation-overdue': async ({ cursor }) => {
      const after = parseOverdueCursor(cursor)
      if (cursor && !after) console.warn('[Job runner] circulation-overdue cursor could not be read; the scan restarts from the oldest loan.')
      const { nextCursor, ...result } = await escalateOverdueTransactions(database, clock(), undefined, after)
      return { result: counts(result), cursor: nextCursor ? JSON.stringify(nextCursor) : null }
    },
    notifications: async () => ({ result: counts(await generateNotifications(database, clock())) }),
    'book-request-emails': async () => ({ result: counts(await deliverBookRequestEmails(database, clock())) }),
    'collection-review-refresh': async () => ({ result: counts(await createCollectionReviewService(database).refresh()) }),
    'payment-recovery': async () => {
      try { return { result: counts(await recoverPayments()) } }
      catch { throw Object.assign(new Error('Payment recovery needs attention. Check Online payments.'), { code: 'PAYMENT_RECOVERY_FAILED' }) }
    },
  }
}
