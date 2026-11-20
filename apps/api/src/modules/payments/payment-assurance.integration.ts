import { createPrintingPaymentAssurance, type AssuranceAttempt } from '../printing/payment-assurance.service.ts'
import { createPrintingPaymentAssuranceRouters } from '../printing/payment-assurance.routes.ts'
import { createServiceChargesService } from '../service-charges/service-charges.service.ts'
import { createServiceChargesRouters } from '../service-charges/service-charges.routes.ts'
import { localPaymentPreview } from './payments.preview.ts'
import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { paymentError } from './payments.validation.ts'
import { guardCounterPayment } from './payments.guard.ts'

export async function databaseAssuranceAttempt(
  pool: Pick<Pool, 'execute'>,
  actor: { accountId?: number },
  id: string,
  staff: boolean,
): Promise<AssuranceAttempt> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM online_payment_attempts WHERE payment_id = ?${staff ? '' : ' AND account_id = ?'} LIMIT 1`,
    staff ? [id] : [id, Number(actor.accountId ?? 0)],
  )
  const row = rows[0]
  if (!row) throw paymentError('The connected payment record is unavailable.', 'PAYMENT_NOT_FOUND', 404)
  const kind = row.print_request_id != null ? 'Printing' : row.fine_id != null ? 'Fine' : row.lost_book_report_id != null ? 'LostBook' : 'Other'
  const targetId = Number(row.print_request_id ?? row.fine_id ?? row.lost_book_report_id ?? row.service_charge_id ?? 0)
  return {
    paymentId: String(row.payment_id),
    accountId: Number(row.account_id),
    userId: Number(row.user_id),
    kind,
    targetId,
    state: String(row.state),
    channelCode: String(row.channel_code),
    principalCentavos: Number(row.principal_centavos),
    feeCentavos: Number(row.fee_centavos),
    totalCentavos: Number(row.total_centavos),
    providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : undefined,
    providerSessionId: row.provider_session_id ? String(row.provider_session_id) : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    confirmedAt: row.confirmed_at
      ? (row.confirmed_at instanceof Date ? row.confirmed_at.toISOString() : String(row.confirmed_at))
      : (row.state === 'Succeeded' && row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)) : undefined),
  }
}

export const paymentAssuranceRouters=createPrintingPaymentAssuranceRouters(createPrintingPaymentAssurance(db,{
  attempt:async(actor,id,staff)=>{
    if(localPaymentPreview)return localPaymentPreview.assuranceAttempt(actor,id,staff)
    return databaseAssuranceAttempt(db,actor,id,staff)
  },
}))
export const serviceChargeRouters=createServiceChargesRouters(createServiceChargesService(db,{
  withLock:run=>localPaymentPreview?localPaymentPreview.moneyOut.withPrintingLock(run):run(),
  credits:actor=>localPaymentPreview?['Student','Faculty'].includes(String(actor.role))?localPaymentPreview.credits(actor):localPaymentPreview.staffCredits(actor):Promise.resolve([]),
  guard:async(q,id)=>{
    await guardCounterPayment(q,{kind:'Other',targetId:id})
    // A private capture also needs review before receiving counter cash or cancelling its bill.
    if(localPaymentPreview&&await localPaymentPreview.hasAppliedCredit('Other',id))throw paymentError('Review the existing payment first.')
  },
}))
