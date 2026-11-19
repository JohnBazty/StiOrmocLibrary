import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { validateAttendanceCredential } from './attendance-credential.service.ts'
import { attendancePurposes } from './attendance.validation.ts'
import { closeAttendanceAtCutoff, createAttendanceOperations, libraryState } from './attendance-operations.service.ts'

const TTL_MS=120_000
const failure=(code:string,message:string,status=409)=>new HttpError(status,code,message)
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
const id=(value:unknown)=>{
  if(typeof value!=='string'||! /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value))throw failure('ATTENDANCE_REQUEST_INVALID','Choose the current attendance request.',422)
  return value
}
function input(value:unknown,keys:string[]){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw failure('ATTENDANCE_REQUEST_INVALID','Review the attendance request.',422)
  return value as Record<string,unknown>
}
const visitorFields=`u.user_id,u.full_name,u.school_id,u.user_role,u.account_status,u.course_or_strand,u.section`

export function createAttendanceConfirmationService(pool:Pool=db,clock=()=>new Date()){
  const operations=createAttendanceOperations(pool,clock)
  async function transaction<T>(run:(q:PoolConnection)=>Promise<T>){
    const q=await pool.getConnection()
    try{await q.beginTransaction();await q.execute('SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');const result=await run(q);await q.commit();return result}
    catch(error){await q.rollback();if((error as {code?:string}).code==='42P01')throw failure('ATTENDANCE_CONFIRMATION_SETUP_REQUIRED','User confirmation is not ready. Ask the Librarian to finish setup.',503);throw error}
    finally{q.release()}
  }
  async function account(q:Pick<PoolConnection,'execute'>,accountId:number){
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT a.account_id,a.user_id,a.role,a.account_status,u.account_status AS user_status
      FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`,[accountId])
    const row=rows[0]
    if(!row||row.account_status!=='Active'||row.user_status!=='Active')throw failure('ATTENDANCE_ACCOUNT_INACTIVE','Sign in with an active library account.',403)
    return row
  }
  async function expire(q:Pick<PoolConnection,'execute'>,userId:number){
    await q.execute("UPDATE attendance_confirmation_requests SET status='Expired',completed_at=? WHERE user_id=? AND status='Pending' AND expires_at<=?",[clock(),userId,clock()])
  }
  async function details(q:Pick<PoolConnection,'execute'>,row:RowDataPacket){
    const [people]=await q.execute<RowDataPacket[]>(`SELECT ${visitorFields} FROM users u WHERE u.user_id=?`,[row.user_id])
    const person=people[0]
    const expired=row.status==='Pending'&&new Date(row.expires_at).getTime()<=clock().getTime()
    return {confirmationId:String(row.confirmation_id),action:row.action as 'Entry'|'Exit',state:expired?'Expired':String(row.status),
      expiresAt:new Date(row.expires_at).toISOString(),purpose:row.selected_purpose??'',
      visitor:{name:String(person?.full_name??'Library visitor'),schoolId:String(person?.school_id??''),role:String(person?.user_role??'')},
      occupancy:await libraryState(q,clock()),result:row.status==='Confirmed'?row.result:null}
  }
  async function owned(q:PoolConnection,accountId:number,confirmationId:unknown,byScanner=false){
    await account(q,accountId)
    if(byScanner)await requireLibraryActor(q,accountId,'desk.operate')
    const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM attendance_confirmation_requests WHERE confirmation_id=?::uuid AND ${byScanner?'actor_account_id':'account_id'}=? FOR UPDATE`,[id(confirmationId),accountId])
    if(!rows[0])throw failure('ATTENDANCE_REQUEST_NOT_FOUND','This attendance request is unavailable.',404)
    await expire(q,Number(rows[0].user_id))
    if(rows[0].status==='Pending'&&new Date(rows[0].expires_at).getTime()<=clock().getTime())rows[0].status='Expired'
    return rows[0]
  }
  return {
    async create(actor:number,body:unknown){
      const b=input(body,['qr_payload','request_id']),request=String(b.request_id??''),payload=typeof b.qr_payload==='string'?b.qr_payload.trim():''
      if(!/^[A-Za-z0-9_-]{16,64}$/.test(request)||!payload||payload.length>2048)throw failure('ATTENDANCE_REQUEST_INVALID','Scan a valid QR and try again.',422)
      return transaction(async q=>{
        await requireLibraryActor(q,actor,'desk.operate')
        const visitor=await validateAttendanceCredential(q,payload,false,clock())
        const [owners]=await q.execute<RowDataPacket[]>(`SELECT account_id FROM accounts WHERE user_id=? AND account_status='Active' ORDER BY account_id LIMIT 1`,[visitor.userId])
        if(!owners[0])throw failure('ATTENDANCE_ACCOUNT_UNAVAILABLE','This visitor needs an active sign-in account.',422)
        const [prior]=await q.execute<RowDataPacket[]>('SELECT * FROM attendance_confirmation_requests WHERE request_key=? OR ?=ANY(retry_keys) FOR UPDATE',[request,request])
        if(prior[0]){
          if(Number(prior[0].actor_account_id)!==actor||prior[0].payload_digest!==digest(payload))throw failure('SCAN_REQUEST_CONFLICT','This scan request belongs to a different visitor.')
          await expire(q,visitor.userId)
          return details(q,prior[0])
        }
        await closeAttendanceAtCutoff(q,clock())
        await expire(q,visitor.userId)
        const [visits]=await q.execute<RowDataPacket[]>('SELECT log_id FROM attendance_logs WHERE user_id=? AND time_out IS NULL ORDER BY log_id DESC LIMIT 1',[visitor.userId])
        const open=visits[0]?.log_id??null,action=open?'Exit':'Entry'
        const [pending]=await q.execute<RowDataPacket[]>("SELECT * FROM attendance_confirmation_requests WHERE user_id=? AND status='Pending' FOR UPDATE",[visitor.userId])
        if(pending[0]&&Number(pending[0].actor_account_id)===actor&&Number(pending[0].credential_id)===visitor.credentialId&&Number(pending[0].expected_log_id??0)===Number(open??0)){
          if(pending[0].retry_keys.length>=30)throw failure('ATTENDANCE_REQUEST_PENDING','This visitor already has a confirmation waiting. Ask them to finish it first.')
          // Remember every coalesced scan key: a delayed retry after confirmation
          // must return that result, never create the opposite attendance action.
          await q.execute('UPDATE attendance_confirmation_requests SET retry_keys=array_append(retry_keys,?) WHERE confirmation_id=?::uuid',[request,pending[0].confirmation_id])
          return details(q,pending[0])
        }
        await q.execute("UPDATE attendance_confirmation_requests SET status='Cancelled',completed_at=? WHERE user_id=? AND status='Pending'",[clock(),visitor.userId])
        const [credentials]=await q.execute<RowDataPacket[]>('SELECT secret_hash FROM attendance_qr_credentials WHERE credential_id=?',[visitor.credentialId])
        if(!credentials[0]?.secret_hash)throw failure('ATTENDANCE_QR_INVALID','Scan the current attendance QR.',422)
        const confirmationId=randomUUID(),now=clock()
        await q.execute(`INSERT INTO attendance_confirmation_requests(confirmation_id,request_key,actor_account_id,account_id,user_id,credential_id,credential_fingerprint,payload_digest,action,expected_log_id,created_at,expires_at)
          VALUES (?::uuid,?,?,?,?,?,?,?,?,?,?,?)`,[confirmationId,request,actor,Number(owners[0].account_id),visitor.userId,visitor.credentialId,digest(credentials[0].secret_hash),digest(payload),action,open,now,new Date(now.getTime()+TTL_MS)])
        const [created]=await q.execute<RowDataPacket[]>('SELECT * FROM attendance_confirmation_requests WHERE confirmation_id=?::uuid',[confirmationId])
        return details(q,created[0])
      })
    },
    async pending(accountId:number){
      const person=await account(pool,accountId)
      try{
        const [rows]=await pool.execute<RowDataPacket[]>("SELECT * FROM attendance_confirmation_requests WHERE account_id=? AND user_id=? AND status='Pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1",[accountId,Number(person.user_id),clock()])
        return {enabled:true,request:rows[0]?await details(pool,rows[0]):null}
      }catch(error){if((error as {code?:string}).code==='42P01')return {enabled:false,request:null};throw error}
    },
    read:(actor:number,confirmationId:unknown)=>transaction(async q=>details(q,await owned(q,actor,confirmationId,true))),
    cancel:(actor:number,confirmationId:unknown,byScanner=false)=>transaction(async q=>{
      const row=await owned(q,actor,confirmationId,byScanner)
      if(row.status==='Pending'){await q.execute("UPDATE attendance_confirmation_requests SET status='Cancelled',completed_at=? WHERE confirmation_id=?::uuid",[clock(),row.confirmation_id]);row.status='Cancelled'}
      return details(q,row)
    }),
    async confirm(accountId:number,confirmationId:unknown,body:unknown){
      const b=input(body,['purpose'])
      return transaction(async q=>{
        const row=await owned(q,accountId,confirmationId)
        if(row.status==='Confirmed')return details(q,row)
        if(row.status!=='Pending')throw failure('ATTENDANCE_REQUEST_CLOSED','This request ended. Ask the entrance staff to scan your QR again.')
        await requireLibraryActor(q,Number(row.actor_account_id),'desk.operate')
        const owner=await account(q,accountId)
        if(Number(owner.user_id)!==Number(row.user_id))throw failure('ATTENDANCE_REQUEST_NOT_FOUND','This attendance request is unavailable.',404)
        const [credentials]=await q.execute<RowDataPacket[]>(`SELECT c.credential_id,c.public_id,c.secret_hash,c.credential_status,c.issued_at,c.last_used_at,${visitorFields}
          FROM attendance_qr_credentials c JOIN users u ON u.user_id=c.user_id WHERE c.credential_id=? AND c.user_id=? FOR UPDATE OF c`,[row.credential_id,row.user_id])
        const c=credentials[0]
        if(!c||c.credential_status!=='Active'||c.account_status!=='Active'||digest(c.secret_hash)!==row.credential_fingerprint)throw failure('ATTENDANCE_QR_REVOKED','Your QR changed. Ask the entrance staff to scan it again.',422)
        const purpose=row.action==='Entry'?String(b.purpose??''):''
        if(row.action==='Entry'&&!attendancePurposes.includes(purpose as never))throw failure('ATTENDANCE_PURPOSE_REQUIRED','Choose the purpose of your visit.',422)
        const visitor={credentialId:Number(c.credential_id),userId:Number(c.user_id),publicId:String(c.public_id),schoolId:String(c.school_id),name:String(c.full_name),role:String(c.user_role),program:c.course_or_strand??null,section:c.section??null,issuedAt:c.issued_at,lastUsedAt:c.last_used_at,purpose:null}
        const result=await operations.recordConfirmedScan(q,Number(row.actor_account_id),{purpose,expected_action:String(row.action),expected_visit_id:row.expected_log_id==null?null:Number(row.expected_log_id)},visitor,String(row.confirmation_id),String(row.payload_digest))
        await q.execute("UPDATE attendance_confirmation_requests SET status='Confirmed',selected_purpose=?,result=?::jsonb,completed_at=? WHERE confirmation_id=?::uuid",[purpose||result.attendance.purpose,JSON.stringify(result),clock(),row.confirmation_id])
        row.status='Confirmed';row.result=result;row.selected_purpose=purpose||result.attendance.purpose
        return details(q,row)
      })
    },
  }
}
export const attendanceConfirmations=createAttendanceConfirmationService()
