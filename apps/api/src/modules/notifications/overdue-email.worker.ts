import { randomUUID } from 'node:crypto'
import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { requireVerificationSender, sendSchoolEmail } from '../auth/school-email.sender.ts'
import { SYSTEM_SHORT_NAME } from '../../config/branding.ts'

export const schoolEmail = (address: string) => /^[^\s@]+@(ormoc\.sti\.edu\.ph|sti\.edu)$/i.test(address) && address.length <= 191
export const loanDueInstantSql = "(bt.due_at AT TIME ZONE 'Asia/Manila')"
export const eligibleEmailLoanSql = `bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL
  AND ${loanDueInstantSql}<NOW() AND u.account_status='Active' AND a.account_status='Active' AND a.role IN ('Student','Faculty')`

async function sendWithinBudget(send: typeof sendSchoolEmail, recipient: string, subject: string, body: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([send(recipient,subject,body),new Promise<void>((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Email acceptance could not be confirmed in time.')),12_000)
    })])
  } finally { if(timer)clearTimeout(timer) }
}

/** Only staff-created rows are dispatched by the existing operational runner. */
export async function deliverDeskReminderEmails(database: Pool = db, now = new Date(), send = sendSchoolEmail, senderReady: (address: string) => unknown = requireVerificationSender) {
  const q = await database.getConnection(), token = randomUUID()
  let claimed: RowDataPacket[] = []
  try {
    await q.beginTransaction()
    // A crashed/timeout send may already have reached the provider. Never resend it blindly.
    await q.execute(`UPDATE desk_overdue_email_deliveries SET status='Unconfirmed',lease_until=NULL,lease_token=NULL,
      last_error='Delivery could not be confirmed. Check the dedicated mailbox before sending again.'
      WHERE status='Sending' AND lease_until<=?`, [now])
    const [rows] = await q.execute<RowDataPacket[]>(`SELECT delivery_id FROM desk_overdue_email_deliveries
      WHERE status='Pending' ORDER BY delivery_id LIMIT 5 FOR UPDATE SKIP LOCKED`)
    for (const row of rows) await q.execute(`UPDATE desk_overdue_email_deliveries SET status='Sending',lease_token=?,lease_until=? WHERE delivery_id=?`,
      [token,new Date(now.getTime()+5*60_000),row.delivery_id])
    await q.commit(); claimed = rows
  } catch (error) { await q.rollback(); throw error } finally { q.release() }
  let overdueEmailsSent=0,overdueEmailsCancelled=0,overdueEmailsUnconfirmed=0,overdueEmailsFailed=0
  // Five independent recipients run together under a 12-second acceptance budget.
  // A late provider response stays Unconfirmed; it never creates another automatic send.
  await Promise.all(claimed.map(async row => {
    const [current] = await database.execute<RowDataPacket[]>(`SELECT d.recipient,u.full_name,COALESCE(t.title,m.title) title,bt.due_at
      FROM desk_overdue_email_deliveries d JOIN borrow_transactions bt ON bt.transaction_id=d.transaction_id
      JOIN users u ON u.user_id=bt.user_id JOIN accounts a ON a.user_id=u.user_id JOIN materials m ON m.material_id=bt.material_id
      LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
      WHERE d.delivery_id=? AND d.lease_token=? AND d.status='Sending' AND ${eligibleEmailLoanSql}
        AND COALESCE(bt.renewal_count,0)=d.renewal_count AND LOWER(u.email)=LOWER(d.recipient)`, [row.delivery_id,token])
    const loan=current[0]
    if (!loan || !schoolEmail(String(loan.recipient))) {
      await database.execute(`UPDATE desk_overdue_email_deliveries SET status='Cancelled',lease_until=NULL,lease_token=NULL,
        last_error='The loan or school email changed before sending.' WHERE delivery_id=? AND lease_token=?`,[row.delivery_id,token])
      overdueEmailsCancelled++; return
    }
    try { senderReady(String(loan.recipient)) } catch {
      await database.execute(`UPDATE desk_overdue_email_deliveries SET status='Failed',lease_until=NULL,lease_token=NULL,
        last_error='The dedicated email sender needs attention.' WHERE delivery_id=? AND lease_token=?`,[row.delivery_id,token])
      overdueEmailsFailed++; return
    }
    try {
      const due = new Date(loan.due_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
      await sendWithinBudget(send,String(loan.recipient),`${SYSTEM_SHORT_NAME} — Overdue book reminder`,
        `Hello ${loan.full_name},\n\nYour borrowed book "${loan.title}" was due on ${due} (Philippine time). Please return it to the library.\n\nSign in to the library website and open Borrowing history to review your loan. If you have already returned the book, please contact the library counter.\n\n${SYSTEM_SHORT_NAME}`)
      await database.execute(`UPDATE desk_overdue_email_deliveries SET status='Sent',sent_at=?,lease_until=NULL,lease_token=NULL,last_error=NULL
        WHERE delivery_id=? AND lease_token=? AND status='Sending'`,[now,row.delivery_id,token])
      overdueEmailsSent++
    } catch {
      // Do not leak provider responses or falsely certify failure after a network timeout.
      await database.execute(`UPDATE desk_overdue_email_deliveries SET status='Unconfirmed',lease_until=NULL,lease_token=NULL,
        last_error='Delivery could not be confirmed. Check the dedicated mailbox before sending again.'
        WHERE delivery_id=? AND lease_token=? AND status='Sending'`,[row.delivery_id,token])
      overdueEmailsUnconfirmed++
    }
  }))
  let overdueEmailSenderReady=true
  try { senderReady('configuration-check@ormoc.sti.edu.ph') } catch { overdueEmailSenderReady=false }
  return {overdueEmailsSent,overdueEmailsCancelled,overdueEmailsUnconfirmed,overdueEmailsFailed,overdueEmailSenderReady}
}
