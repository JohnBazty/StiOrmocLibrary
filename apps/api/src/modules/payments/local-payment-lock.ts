import { createHash } from 'node:crypto'
import type { Pool } from '../../config/db.js'
import { paymentError } from './payments.validation.ts'

const pathKey=createHash('sha256').update(new URL('../../../../../output/local-payment-tests/',import.meta.url).href).digest().readInt32BE(0)

/** Transaction advisory locks work through Supabase transaction pooling and release on a crash.
 * Only SELECT and transaction control: no school rows change.
 */
export async function withLocalPaymentLock<T>(database:Pool,run:()=>Promise<T>):Promise<T> {
  const connection=await database.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.execute<Array<{held:boolean}>>('SELECT pg_try_advisory_xact_lock(20261112,?) AS held',[pathKey])
    if(!rows[0]?.held)throw paymentError('Another API is updating payment records. Wait, then check the saved request.','LOCAL_PAYMENT_LOCKED',409)
    const result=await run()
    await connection.commit()
    return result
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
