import { db, type Pool, type PoolConnection, type RowDataPacket } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { HttpError } from '../../core/http-error.ts'
import { paymentId, positiveId } from '../payments/payments.validation.ts'
import { printingPaidSql } from './printing-paid.ts'
import { printBalance } from './printing-cash.rules.ts'
import { notifyStaffRolesSafe } from '../notifications/transaction-notifications.ts'

type Actor={accountId?:number;schoolId?:string;role?:string}
const fail=(message:string,status=409)=>new HttpError(status,'PRINT_PAY_LATER_REVIEW',message)
function reason(value:unknown){const text=String(value??'').trim();if(text.length<3||text.length>1000)throw fail('Enter a reason between 3 and 1,000 characters.',422);return text}
function date(value:unknown){if(value==null||value==='')return null;const text=String(value);const parsed=new Date(`${text}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)throw fail('Choose a valid agreed payment date.',422);return text}

export function createPrintingDeferredService(pool:Pool=db){
  async function transaction<T>(work:(q:PoolConnection)=>Promise<T>){const q=await pool.getConnection();try{await q.beginTransaction();const result=await work(q);await q.commit();return result}catch(error){await q.rollback();throw error}finally{q.release()}}
  async function identity(q:PoolConnection,actor:Actor,manager=false){
    if(manager)await requireLibraryActor(q,positiveId(actor.accountId),'library.manage')
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT a.account_id,a.user_id,a.role FROM accounts a JOIN users u ON u.user_id=a.user_id
      WHERE a.account_id=? AND a.account_status='Active' AND u.account_status='Active' AND u.school_id=?`,[positiveId(actor.accountId),actor.schoolId])
    if(!rows[0]||rows[0].role!==actor.role)throw fail('Sign in again before confirming this request.',403)
    return rows[0]
  }
  async function locked(q:PoolConnection,id:number){const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM print_requests WHERE request_id=? FOR UPDATE',[id]);if(!rows[0])throw fail('This printing request is unavailable.',404);return rows[0]}
  async function event(q:PoolConnection,actor:Actor,id:number,type:string,details:unknown){await q.execute('INSERT INTO print_deferred_events(actor_account_id,request_id,event_type,details) VALUES(?,?,?,?::jsonb)',[actor.accountId,id,type,JSON.stringify(details)])}
  return {
    async approve(actor:Actor,value:unknown,body:Record<string,unknown>){
      const id=positiveId(value),note=reason(body.reason),agreed=date(body.agreed_payment_date),key=paymentId(body.request_key)
      let targetUserId:number|null=null
      const approved=await transaction(async q=>{
        const staff=await identity(q,actor,true),row=await locked(q,id)
        const [existing]=await q.execute<RowDataPacket[]>('SELECT * FROM print_deferred_approvals WHERE request_id=? FOR UPDATE',[id])
        if(existing[0]?.request_key===key){if(existing[0].reason!==note||String(existing[0].agreed_payment_date??'').slice(0,10)!==String(agreed??''))throw fail('This approval reference already has different details.');return existing[0]}
        if(row.job_status!=='Pending'||row.pricing_review_state!=='Ready')throw fail('Approve pay later only before printing, after the final price is accepted.')
        if(Number(row.row_version)!==positiveId(body.version))throw fail('This request changed. Refresh it before approving.')
        const [money]=await q.execute<RowDataPacket[]>(`SELECT ${printingPaidSql()} paid FROM print_requests pr WHERE request_id=?`,[id])
        if(printBalance(row.calculated_cost,money[0].paid)===0n)throw fail('This bill is already paid.')
        const version=Number(existing[0]?.version??0)+1
        await q.execute(`INSERT INTO print_deferred_approvals(request_id,approved_by_user_id,reason,assessed_amount,pricing_snapshot,agreed_payment_date,request_key,version)
          VALUES(?,?,?,?,?::jsonb,?,?,?) ON CONFLICT(request_id) DO UPDATE SET approved_by_user_id=EXCLUDED.approved_by_user_id,approved_at=NOW(),reason=EXCLUDED.reason,
          assessed_amount=EXCLUDED.assessed_amount,pricing_snapshot=EXCLUDED.pricing_snapshot,agreed_payment_date=EXCLUDED.agreed_payment_date,request_key=EXCLUDED.request_key,
          acknowledged_at=NULL,acknowledged_by_account_id=NULL,revoked_at=NULL,revoked_by_user_id=NULL,revocation_reason=NULL,version=EXCLUDED.version`,[id,staff.user_id,note,row.calculated_cost,JSON.stringify(row.pricing_snapshot??null),agreed,key,version])
        await event(q,actor,id,'Approved',{reason:note,agreedPaymentDate:agreed,assessedAmount:row.calculated_cost,version})
        await q.execute('UPDATE print_requests SET row_version=row_version+1,updated_at=NOW() WHERE request_id=?',[id])
        targetUserId=Number(row.user_id)
        return {request_id:id,version,status:'Awaiting acknowledgment'}
      })
      if(targetUserId!==null){
        try {
          await pool.execute(
            `INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
             VALUES (?,'Pay-later printing approved',?,'Printing Update','Print Request',?,CASE WHEN (SELECT user_role FROM users WHERE user_id=?)='Faculty' THEN '/faculty/printing' ELSE '/student/printing' END,'Important',?,NOW(),NOW())
             ON CONFLICT(user_id,dedupe_key) DO NOTHING`,
            [targetUserId,`Request #${id} was approved for pay-later printing. Open Printing to acknowledge the balance before printing starts.`,id,targetUserId,`print-deferred:${id}:approved:${approved.version}`],
          )
        } catch {}
      }
      return approved
    },
    async acknowledge(actor:Actor,value:unknown,body:Record<string,unknown>){
      const id=positiveId(value)
      let targetUserId:number|null=null
      const ack=await transaction(async q=>{
        const owner=await identity(q,actor),row=await locked(q,id)
        if(!['Student','Faculty'].includes(String(owner.role))||Number(row.user_id)!==Number(owner.user_id))throw fail('This printing request is unavailable.',404)
        const [approvals]=await q.execute<RowDataPacket[]>('SELECT * FROM print_deferred_approvals WHERE request_id=? FOR UPDATE',[id]),approval=approvals[0]
        if(!approval||approval.revoked_at||Number(approval.version)!==positiveId(body.version))throw fail('The approval changed. Refresh the bill before confirming.')
        if(row.job_status!=='Pending'||row.pricing_review_state!=='Ready'||Number(approval.assessed_amount)!==Number(row.calculated_cost)||JSON.stringify(approval.pricing_snapshot)!==JSON.stringify(row.pricing_snapshot??null))throw fail('The bill changed. Ask the librarian to review pay later again.')
        if(body.accepted!==true)throw fail('Confirm that you agree to pay the remaining balance.',422)
        if(approval.acknowledged_at)return {request_id:id,status:'Acknowledged',version:approval.version}
        await q.execute('UPDATE print_deferred_approvals SET acknowledged_by_account_id=?,acknowledged_at=NOW() WHERE request_id=?',[actor.accountId,id])
        await event(q,actor,id,'Acknowledged',{version:approval.version,assessedAmount:approval.assessed_amount})
        await q.execute('UPDATE print_requests SET row_version=row_version+1,updated_at=NOW() WHERE request_id=?',[id])
        targetUserId=Number(row.user_id)
        return {request_id:id,status:'Acknowledged',version:approval.version}
      })
      if(targetUserId!==null){
        await notifyStaffRolesSafe(pool,{key:`print-deferred:${id}:ack:${ack.version}`,title:'Pay-later printing acknowledged',body:`Request #${id} pay-later agreement was acknowledged and is ready to print.`,type:'Printing Update',sourceType:'Print Request',sourceId:id,personUserId:targetUserId,librarianPath:'/librarian/printing',staffPath:'/staff/printing',priority:'Normal'})
      }
      return ack
    },
    async revoke(actor:Actor,value:unknown,body:Record<string,unknown>){
      const id=positiveId(value),note=reason(body.reason)
      let targetUserId:number|null=null,revokedVersion=0
      const revoked=await transaction(async q=>{const staff=await identity(q,actor,true),row=await locked(q,id)
        if(row.job_status!=='Pending')throw fail('Printing has already started. Its approval history stays recorded.')
        const [result]=await q.execute<any>(`UPDATE print_deferred_approvals SET revoked_at=NOW(),revoked_by_user_id=?,revocation_reason=?,version=version+1
          WHERE request_id=? AND version=? AND revoked_at IS NULL RETURNING version`,[staff.user_id,note,id,positiveId(body.version)])
        if(!result.rows?.[0])throw fail('This approval changed. Refresh before trying again.')
        await event(q,actor,id,'Revoked',{reason:note,version:result.rows[0].version})
        await q.execute('UPDATE print_requests SET row_version=row_version+1,updated_at=NOW() WHERE request_id=?',[id])
        targetUserId=Number(row.user_id);revokedVersion=Number(result.rows[0].version)
        return {request_id:id,status:'Revoked'}
      })
      if(targetUserId!==null){
        try {
          await pool.execute(
            `INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
             VALUES (?,'Pay-later printing revoked',?,'Printing Update','Print Request',?,CASE WHEN (SELECT user_role FROM users WHERE user_id=?)='Faculty' THEN '/faculty/printing' ELSE '/student/printing' END,'Important',?,NOW(),NOW())
             ON CONFLICT(user_id,dedupe_key) DO NOTHING`,
            [targetUserId,`Pay-later approval for Request #${id} was revoked: ${note}`,id,targetUserId,`print-deferred:${id}:revoked:${revokedVersion}`],
          )
        } catch {}
      }
      return revoked
    },
  }
}
export const printingDeferredService=createPrintingDeferredService()
