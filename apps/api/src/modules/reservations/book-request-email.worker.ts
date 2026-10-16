import { randomUUID } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { sendSchoolEmail } from '../auth/school-email.sender.ts'

/** Claim a short batch, commit, then send. SMTP never runs inside a circulation transaction. */
export async function deliverBookRequestEmails(database:Pool=db,now=new Date(),send=sendSchoolEmail) {
  const q=await database.getConnection(),token=randomUUID()
  let claimed:RowDataPacket[]=[]
  try {
    await q.beginTransaction()
    await q.execute(`UPDATE book_request_email_deliveries SET status='Failed',lease_until=NULL,lease_token=NULL,
      last_error='Email delivery was interrupted. In-app notice remains available.'
      WHERE status='Sending' AND lease_until<=? AND attempts>=5`,[now])
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM book_request_email_deliveries
      WHERE ((status IN ('Pending','Failed') AND next_attempt_at<=?) OR (status='Sending' AND lease_until<=?))
        AND attempts<5 ORDER BY delivery_id LIMIT 10 FOR UPDATE SKIP LOCKED`,[now,now])
    for(const row of rows) await q.execute(`UPDATE book_request_email_deliveries SET status='Sending',attempts=attempts+1,
      lease_until=?,lease_token=? WHERE delivery_id=?`,[new Date(now.getTime()+5*60_000),token,row.delivery_id])
    await q.commit();claimed=rows
  } catch(e) {await q.rollback();throw e} finally {q.release()}
  let sent=0,failed=0
  for(const row of claimed) {
    try {
      await send(String(row.recipient),String(row.subject),String(row.message_body))
      const [result]=await database.execute<ResultSetHeader>(`UPDATE book_request_email_deliveries SET status='Sent',sent_at=?,
        lease_until=NULL,lease_token=NULL,last_error=NULL WHERE delivery_id=? AND lease_token=?`,[now,row.delivery_id,token])
      sent+=result.affectedRows
    } catch {
      // No provider payload, address or credential is returned to the browser/logs.
      await database.execute(`UPDATE book_request_email_deliveries SET status='Failed',lease_until=NULL,lease_token=NULL,
        next_attempt_at=?,last_error='Email provider unavailable. In-app notice remains available.' WHERE delivery_id=? AND lease_token=?`,
        [new Date(now.getTime()+Math.min(60,2**Number(row.attempts))*60_000),row.delivery_id,token])
      failed++
    }
  }
  return {sent,failed}
}
