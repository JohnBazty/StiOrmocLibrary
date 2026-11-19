import { db, type Pool, type RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { printingPaidSql } from '../printing/printing-paid.ts'
import { serviceChargePaidSql } from '../service-charges/service-charges.service.ts'
import { sendSchoolEmail } from '../auth/school-email.sender.ts'

export function urgentSettings(body: unknown) {
 const b=body as Record<string,unknown>
 if(!b||typeof b!=='object'||Array.isArray(b))throw new HttpError(422,'URGENT_SETTINGS','Review the alert settings.')
 const number=(key:string,money=false)=>{if(b[key]===null||b[key]==='')return null;const n=Number(b[key]);if(!Number.isFinite(n)||n<=0||n>(money?999999999:3650)||(!money&&!Number.isInteger(n))||(money&&Math.abs(n*100-Math.round(n*100))>0.00001))throw new HttpError(422,'URGENT_SETTINGS','Enter positive amounts and whole days, or leave a trigger blank.');return n}
 if(!Number.isSafeInteger(b.version)||Number(b.version)<1||typeof b.emailEnabled!=='boolean')throw new HttpError(422,'URGENT_SETTINGS','Refresh the settings and review again.')
 return {amount:number('amount',true),overdueDays:number('overdueDays'),unpaidDays:number('unpaidDays'),emailEnabled:b.emailEnabled,version:Number(b.version)}
}
export function urgentReasons(balance:number,due:Date|null,assessed:Date,settings:{amount:number|null;overdue_days:number|null;unpaid_days:number|null},now=new Date()) {
 const age=(date:Date)=>Math.max(0,Math.floor((now.getTime()-date.getTime())/86400000))
 return {overdueDays:due?age(due):null,unpaidDays:age(assessed),reasons:balance<=0?[]:[settings.amount!==null&&balance>=Number(settings.amount)?'Outstanding amount':null,due&&settings.overdue_days!==null&&age(due)>=settings.overdue_days?'Days overdue':null,settings.unpaid_days!==null&&age(assessed)>=settings.unpaid_days?'Days unpaid':null].filter(Boolean)}
}
export function createUrgentCases(database:Pool=db,send=sendSchoolEmail) {
 const config=async()=>{const [r]=await database.execute<RowDataPacket[]>('SELECT * FROM urgent_case_settings WHERE singleton=TRUE');return r[0]}
 async function list(now=new Date()) {
  const settings=await config()
  // Source amounts and confirmed allocations remain authoritative. No debt is duplicated.
  const [rows]=await database.execute<RowDataPacket[]>(`WITH charges AS (
   SELECT 'Fine:'||f.fine_id AS key,f.user_id,f.fine_type AS kind,f.applied_date AT TIME ZONE 'Asia/Manila' AS assessed_at,
    CASE WHEN f.fine_type='Overdue' THEN bt.due_at AT TIME ZONE 'Asia/Manila' ELSE NULL END AS due_at,
    GREATEST(0,f.fine_amount-COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a JOIN fine_payment_receipts r USING(fine_payment_receipt_id) WHERE a.fine_id=f.fine_id AND r.receipt_status='Issued'),0)-COALESCE((SELECT SUM(amount_adjusted) FROM fine_adjustments WHERE fine_id=f.fine_id),0)) AS balance
   FROM fines f LEFT JOIN borrow_transactions bt USING(transaction_id) WHERE f.payment_status NOT IN ('Paid','Waived','Voided')
   UNION ALL SELECT 'Loan:'||bt.transaction_id,bt.user_id,'Overdue book',bt.borrowed_at AT TIME ZONE 'Asia/Manila',bt.due_at AT TIME ZONE 'Asia/Manila',0
    FROM borrow_transactions bt WHERE bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL AND bt.due_at < (?::timestamptz AT TIME ZONE 'Asia/Manila') AND NOT EXISTS(SELECT 1 FROM fines f WHERE f.transaction_id=bt.transaction_id)
   UNION ALL SELECT 'Lost:'||l.lost_book_report_id,l.user_id,'Replacement',COALESCE(l.verified_at,l.reported_at) AT TIME ZONE 'Asia/Manila',NULL,
    GREATEST(0,l.replacement_charge-COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a JOIN fine_payment_receipts r USING(fine_payment_receipt_id) WHERE a.lost_book_report_id=l.lost_book_report_id AND r.receipt_status='Issued'),0)) FROM lost_book_reports l WHERE l.report_status='Confirmed' AND l.payment_status<>'Paid'
   UNION ALL SELECT 'Printing:'||pr.request_id,pr.user_id,'Printing',pr.created_at AT TIME ZONE 'Asia/Manila',NULL,GREATEST(0,pr.calculated_cost-(${printingPaidSql()})) FROM print_requests pr WHERE pr.job_status<>'Cancelled' AND pr.pricing_review_state='Ready'
   UNION ALL SELECT 'Service:'||c.charge_id,c.user_id,'Service charge',c.created_at,NULL,GREATEST(0,c.amount_assessed-(${serviceChargePaidSql()})) FROM library_service_charges c WHERE c.charge_status='Active'
  ) SELECT q.*,u.full_name,u.school_id,(SELECT MAX(notified_at) FROM urgent_case_notices n WHERE n.source_key=q.key AND n.version=?) AS last_notified_at FROM charges q JOIN users u USING(user_id) WHERE q.balance>0 OR q.kind='Overdue book' ORDER BY assessed_at,key`,[now,settings.version])
  const items=rows.flatMap(row=>{const result=urgentReasons(Number(row.balance),row.due_at?new Date(row.due_at):null,new Date(row.assessed_at),settings as any,now);if(row.kind==='Overdue book')result.unpaidDays=0;if(row.kind==='Overdue book'&&settings.overdue_days!==null&&result.overdueDays!>=Number(settings.overdue_days))result.reasons=['Days overdue'];return result.reasons.length?[{...row,key:String(row.key),balance:Number(row.balance),...result}]:[]})
  return {settings,items}
 }
 return {list,config,
  async save(accountId:number,body:unknown){const input=urgentSettings(body);const c=await database.getConnection();try{await c.beginTransaction();await requireLibraryActor(c,accountId,'library.manage');const [r]=await c.execute<RowDataPacket[]>('SELECT version FROM urgent_case_settings WHERE singleton=TRUE FOR UPDATE');if(Number(r[0].version)!==input.version)throw new HttpError(409,'URGENT_STALE','Settings changed. Refresh and review again.');await c.execute('UPDATE urgent_case_settings SET version=version+1,amount=?,overdue_days=?,unpaid_days=?,email_enabled=?,updated_by=?,updated_at=NOW() WHERE singleton=TRUE',[input.amount,input.overdueDays,input.unpaidDays,input.emailEnabled,accountId]);await c.execute('INSERT INTO urgent_case_events(version,actor_account_id,settings) VALUES(?,?,?::jsonb)',[input.version+1,accountId,JSON.stringify(input)]);await c.commit();return {saved:true}}catch(e){await c.rollback();throw e}finally{c.release()}},
  async notify(now=new Date()) {
   const {settings,items}=await list(now);let inserted=0
   const [recipients]=await database.execute<RowDataPacket[]>("SELECT a.account_id,a.user_id,u.email FROM accounts a JOIN users u USING(user_id) WHERE a.role='Librarian' AND a.account_status='Active' AND u.account_status='Active'")
   for(const person of recipients)for(const item of items){const c=await database.getConnection();try{await c.beginTransaction();const [result]=await c.execute<any>('INSERT INTO urgent_case_notices(account_id,source_key,version) VALUES(?,?,?) ON CONFLICT DO NOTHING',[person.account_id,item.key,settings.version]);if(result.affectedRows){await c.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,action_path,priority,dedupe_key,scheduled_for,delivered_at) VALUES(?,'Urgent library case','A library case needs review. Open the protected priorities list for details.','Fine','Fine','/librarian/fines','Urgent',?,NOW(),NOW()) ON CONFLICT(user_id,dedupe_key) DO NOTHING`,[person.user_id,`urgent:${person.account_id}:${item.key}:${settings.version}`]);inserted++}await c.commit()}catch(e){await c.rollback();throw e}finally{c.release()}}
   // One generic email per recipient/policy version; no balances or identities in email.
   let emailAttempted=false
   if(settings.email_enabled)for(const person of recipients){const active=items.map(i=>String(i.key));const c=await database.getConnection();try{await c.beginTransaction();const [pending]=await c.execute<RowDataPacket[]>('SELECT source_key FROM urgent_case_notices WHERE account_id=? AND version=? AND email_sent_at IS NULL AND email_attempts<5 AND next_attempt_at<=? AND source_key=ANY(?::text[]) FOR UPDATE SKIP LOCKED',[person.account_id,settings.version,now,active]);if(pending.length&&!emailAttempted){emailAttempted=true;try{await send(person.email,'Library cases need review','Sign in to the library personnel portal and open Fines management to review urgent cases. No new penalty has been added.');await c.execute('UPDATE urgent_case_notices SET email_sent_at=NOW() WHERE account_id=? AND version=? AND source_key=ANY(?::text[])',[person.account_id,settings.version,pending.map(p=>p.source_key)])}catch{await c.execute("UPDATE urgent_case_notices SET email_attempts=email_attempts+1,next_attempt_at=NOW()+INTERVAL '30 minutes' WHERE account_id=? AND version=? AND source_key=ANY(?::text[])",[person.account_id,settings.version,pending.map(p=>p.source_key)])}}await c.commit()}catch(e){await c.rollback();throw e}finally{c.release()}}
   return {urgentNotices:inserted}
  }
 }
}
