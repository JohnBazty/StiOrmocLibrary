import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { closeAttendanceAtCutoff, libraryState } from '../attendance/attendance-operations.service.ts'
import { manilaDate, nextDate } from '../attendance/attendance-intervals.ts'
import { exactLoanDeadline } from './exact-loan-deadline.ts'

export async function borrowingPolicy(q: PoolConnection, now: Date) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT * FROM borrowing_policy_versions WHERE effective_on<=?::date ORDER BY effective_on DESC,borrowing_policy_version_id DESC LIMIT 1`,[manilaDate(now)])
  if (!rows[0]) throw new HttpError(503,'BORROW_POLICY_UNAVAILABLE','No approved borrowing policy is effective today.')
  return rows[0]
}

/** A not-yet-due loan affects end-of-term clearance, not the desk's explicit hold. */
export async function borrowerEligibility(q: PoolConnection,userId:number,now:Date,mode='TakeHome') {
  if(mode !== 'Online') await closeAttendanceAtCutoff(q,now)
  const [users]=await q.execute<RowDataPacket[]>(`SELECT u.user_id,u.full_name,u.school_id,u.user_role,u.account_status,u.course_or_strand,u.section,a.account_id,a.account_status AS login_status FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id WHERE u.user_id=? ORDER BY a.account_id LIMIT 1 FOR UPDATE OF u`,[userId])
  const user=users[0]; const blockers:string[]=[]
  if (!user?.account_id) blockers.push('This user has no linked sign-in account.')
  if (!user || user.account_status!=='Active' || user.login_status!=='Active') blockers.push('The account must be approved and active.')
  if (!['Student','Faculty','Staff','Librarian'].includes(String(user?.user_role))) blockers.push('This account is not eligible to borrow.')
  const [visits]=await q.execute<RowDataPacket[]>(`SELECT log_id,seat_visit,reason_for_visit FROM attendance_logs WHERE user_id=? AND checked_out_at IS NULL AND time_out IS NULL AND attendance_date=?::date ORDER BY log_id DESC LIMIT 1 FOR UPDATE`,[userId,manilaDate(now)])
  if (mode !== 'Online' && !visits[0]) blockers.push('Check in at the library entrance before borrowing.')
  if (mode==='InLibrary'&&visits[0]&&(visits[0].seat_visit===false || visits[0].reason_for_visit==='Printing')) blockers.push('In-library reading requires a seat-counted visit. End the Printing visit and check in for reading first.')
  const [loans]=await q.execute<RowDataPacket[]>(`SELECT transaction_id,physical_copy_id,reservation_id,transaction_status FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Pending','Borrowed','Overdue')`,[userId])
  const [overdue]=await q.execute<RowDataPacket[]>(`SELECT transaction_id FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Borrowed','Overdue') AND (transaction_status='Overdue' OR due_at < (?::timestamptz AT TIME ZONE 'Asia/Manila')) LIMIT 1`,[userId,now])
  if(overdue.length)blockers.push('Return overdue books before borrowing another material.')
  const [fines]=await q.execute<RowDataPacket[]>(`SELECT SUM(GREATEST(f.fine_amount-COALESCE(p.paid,0)-COALESCE(x.adjusted,0),0)) AS balance FROM fines f LEFT JOIN (SELECT a.fine_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' GROUP BY a.fine_id) p ON p.fine_id=f.fine_id LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) AS adjusted FROM fine_adjustments GROUP BY fine_id) x ON x.fine_id=f.fine_id WHERE f.user_id=? AND f.payment_status IN ('Accruing','Unpaid','Partially Paid')`,[userId])
  const [loss]=await q.execute<RowDataPacket[]>(`SELECT SUM(GREATEST(l.replacement_charge-COALESCE(p.paid,0),0)) AS balance FROM lost_book_reports l LEFT JOIN (SELECT a.lost_book_report_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' GROUP BY a.lost_book_report_id) p ON p.lost_book_report_id=l.lost_book_report_id WHERE l.user_id=? AND l.report_status='Confirmed' AND l.payment_status NOT IN ('Paid','Waived')`,[userId])
  const balance=Number(fines[0]?.balance??0)+Number(loss[0]?.balance??0)
  if(balance>0)blockers.push(`Settle the outstanding library balance of ₱${balance.toFixed(2)} before borrowing.`)
  const [holds]=await q.execute<RowDataPacket[]>(`SELECT override_status,reason FROM clearance_overrides WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>(?::timestamptz AT TIME ZONE 'Asia/Manila')) ORDER BY applied_at DESC,clearance_override_id DESC LIMIT 1`,[userId,now])
  if(holds[0]?.override_status==='Not Cleared')blockers.push(`An explicit library hold is active: ${holds[0].reason}`)
  const policy=await borrowingPolicy(q,now)
  const limit=user?.user_role==='Student'?Number(policy.student_max_active_books):user?.user_role==='Faculty'&&policy.faculty_max_active_books!=null?Number(policy.faculty_max_active_books):null
  const state=await libraryState(q,now)
  if(mode !== 'Online' && !state.allowBorrowing)blockers.push('The library is not accepting borrowing at this time.')
  return {user,visit:visits[0]??null,blockers,balance,loans,limit,policy,state,enrollment:'Enrollment not verified'}
}
export function requireEligible(result:Awaited<ReturnType<typeof borrowerEligibility>>) {
  if(result.blockers.length)throw new HttpError(422,'CIRCULATION_ELIGIBILITY_BLOCKED',result.blockers.join(' '),{blockers:result.blockers})
}
export async function requireLoanSlot(q:PoolConnection,userId:number,copyId:number,limit:number|null) {
  if(limit===null)return
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT (SELECT COUNT(*) FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Pending','Borrowed','Overdue') AND physical_copy_id IS DISTINCT FROM ?) + (SELECT COUNT(*) FROM reservations r WHERE r.user_id=? AND r.reservation_status IN ('pending','approved','ready_for_pickup') AND NOT EXISTS (SELECT 1 FROM borrow_transactions bt WHERE bt.reservation_id=r.reservation_id AND bt.transaction_status IN ('Pending','Borrowed','Overdue')) AND r.assigned_physical_copy_id IS DISTINCT FROM ?) AS commitments`,[userId,copyId,userId,copyId])
  if(Number(rows[0]?.commitments)>=limit)throw new HttpError(422,'STUDENT_BORROW_LIMIT_REACHED',`The approved borrowing limit is ${limit} active books or requests.`,{limit})
}
export async function policyDueDate(q:PoolConnection,now:Date,policy:RowDataPacket) {
  const [schedule]=await q.execute<RowDataPacket[]>('SELECT day_of_week,is_open FROM library_operating_schedule')
  const [closed]=await q.execute<RowDataPacket[]>('SELECT to_char(closed_date,\'YYYY-MM-DD\') AS closed_date FROM library_closed_days WHERE closed_date>=?::date AND closed_date<=?::date',[manilaDate(now),nextDate(manilaDate(now),731)])
  const closures=new Set(closed.map(r=>String(r.closed_date)))
  const open=new Set(schedule.filter(r=>Boolean(r.is_open)).map(r=>Number(r.day_of_week)))
  try { return exactLoanDeadline(now, Number(policy.borrowing_days), open, closures) }
  catch { throw new HttpError(503,'BORROW_CALENDAR_UNAVAILABLE','The borrowing period or operating calendar needs Librarian review.') }
}
