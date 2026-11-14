import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Pool } from '../../config/db.js'
import type { Attempt } from './payments.preview.ts'
import type { FundsLedger } from './money-out.rules.ts'
import { paymentError } from './payments.validation.ts'

/** A fenced, renewable lease survives serverless restarts and transaction pooling.
 * Saves commit before provider calls, retaining evidence when a response is lost.
 * Use a separate small pool: desk transactions may already hold the school pool.
 */
export function createHostedPaymentStore(database: Pool) {
  const context = new AsyncLocalStorage<string>()
  async function load<T>(column: 'attempts' | 'funds'): Promise<T> {
    const [rows] = await database.execute<Array<Record<string, T>>>(`SELECT ${column} FROM hosted_payment_preview WHERE singleton=true`)
    if (!rows[0]) throw paymentError('Payment records are unavailable.', 'PAYMENT_STORAGE_UNAVAILABLE', 503)
    return rows[0][column]
  }
  async function save(column: 'attempts' | 'funds', value: unknown) {
    const token = context.getStore()
    if (!token) throw paymentError('Payment update needs a lock.', 'PAYMENT_STORAGE_LOCK_REQUIRED', 409)
    const [result] = await database.execute<{ affectedRows: number }>(`UPDATE hosted_payment_preview SET ${column}=?::jsonb,
      lease_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp()
      WHERE singleton=true AND lease_owner=?::uuid AND lease_until>clock_timestamp()`, [JSON.stringify(value), token])
    if (result.affectedRows !== 1) throw paymentError('Another update is in progress. Check the saved payment.', 'PAYMENT_STORAGE_LOCK_LOST', 409)
  }
  async function locked<T>(run: () => Promise<T>): Promise<T> {
    if (context.getStore()) return run()
    const token = randomUUID()
    const [claimed] = await database.execute<{ affectedRows: number }>(`UPDATE hosted_payment_preview
      SET lease_owner=?::uuid,lease_until=clock_timestamp()+interval '120 seconds'
      WHERE singleton=true AND (lease_owner IS NULL OR lease_until<=clock_timestamp())`, [token])
    if (claimed.affectedRows !== 1) throw paymentError('Another payment is updating. Please try again shortly.', 'PAYMENT_STORAGE_BUSY', 409)
    try { return await context.run(token, run) }
    finally { await database.execute('UPDATE hosted_payment_preview SET lease_owner=NULL,lease_until=NULL WHERE singleton=true AND lease_owner=?::uuid', [token]) }
  }
  return { locked, attempts: { load: () => load<Attempt[]>('attempts'), save: (value: Attempt[]) => save('attempts', value) },
    funds: { load: () => load<FundsLedger>('funds'), save: (value: FundsLedger) => save('funds', value) } }
}
