import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import type { PaymentTarget } from './payments.repository.ts'
import { localPaymentPreview } from './payments.preview.ts'

/** Call after locking the obligation. Avoid locking attempts here: checkout locks them before the obligation. */
export async function guardCounterPayment(connection: Pick<PoolConnection,'execute'>, target: PaymentTarget) {
  if (localPaymentPreview) await localPaymentPreview.moneyOut.guard(target.kind,target.targetId)
  const [tables] = await connection.execute<RowDataPacket[]>("SELECT to_regclass('online_payment_attempts') IS NOT NULL AS installed")
  if (!tables[0]?.installed) return
  const column = {Printing:'print_request_id',Fine:'fine_id',LostBook:'lost_book_report_id'}[target.kind]
  const [active] = await connection.execute<RowDataPacket[]>(`SELECT payment_id,state FROM online_payment_attempts
    WHERE ${column}=? AND (state IN ('Creating','Active','Review') OR
      (state='Prepared' AND (expires_at>clock_timestamp() OR provider_session_id IS NOT NULL))) LIMIT 1`,[target.targetId])
  if (active[0]) throw new HttpError(409,'ONLINE_PAYMENT_ACTIVE',
    'An online payment is in progress. Check or cancel it in Online payments before changing this bill.',
    {paymentId:active[0].payment_id})
}
