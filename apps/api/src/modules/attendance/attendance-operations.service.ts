import { createHash } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db, dbDriver } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { validateAttendanceCredential } from './attendance-credential.service.ts'
import { attendancePurposes } from './attendance.validation.ts'
import { manilaDate, localTimestamp } from './attendance-intervals.ts'
import { evaluateLibraryState, parseAttendancePolicy, parseOperationalEvent, type AttendancePolicy, type OperationalEvent } from './attendance-operations.policy.ts'

type Query=Pick<PoolConnection,'execute'>
async function rows(q:Query,sql:string,values:any[]=[]){const [r]=await q.execute<RowDataPacket[]>(sql,values);return r}
const fail=(code:string,message:string,status=409)=>new HttpError(status,code,message)
export async function attendancePolicy(q:Query):Promise<AttendancePolicy>{
 const r=(await rows(q,'SELECT * FROM attendance_operation_settings WHERE settings_id=1'))[0]
 return {servicePurposes:r?.service_purposes??['Printing'],preclosingMinutes:r?.preclosing_minutes==null?null:Number(r.preclosing_minutes),configured:Boolean(r?.configured),version:Number(r?.row_version??1)}
}
export async function libraryState(q:Query,now=new Date()) {
 const date=manilaDate(now),weekday=((new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7)+1
 const policy=await attendancePolicy(q),schedule=(await rows(q,'SELECT is_open,opens_at,closes_at FROM library_operating_schedule WHERE day_of_week=?',[weekday]))[0]
 const closed=(await rows(q,'SELECT closed_date FROM library_closed_days WHERE closed_date=?',[date])).length>0
 const base=Number((await rows(q,'SELECT seat_capacity FROM library_profile_settings WHERE settings_id=1'))[0]?.seat_capacity??80)
 const events=await rows(q,"SELECT * FROM library_operational_events WHERE lifecycle_status='Active' AND starts_at<=? AND ends_at>? ORDER BY starts_at,event_id",[now,now]) as OperationalEvent[]
 const state=evaluateLibraryState(now,policy,schedule as any,closed,base,events)
 const occupancy=(await rows(q,`SELECT COUNT(*) FILTER (WHERE COALESCE(seat_visit,NOT(reason_for_visit=ANY(?::text[])))) AS seats,
  COUNT(*) FILTER (WHERE NOT COALESCE(seat_visit,NOT(reason_for_visit=ANY(?::text[])))) AS services FROM attendance_logs WHERE time_out IS NULL`,[policy.servicePurposes,policy.servicePurposes]))[0]
 const current=Number(occupancy?.seats??0),serviceVisits=Number(occupancy?.services??0)
 return {...state,baseCapacity:base,policy,current,serviceVisits,totalInside:current+serviceVisits,available:Math.max(0,state.capacity-current),percentage:state.capacity?Math.round(current/state.capacity*100):0,overCapacity:current>state.capacity}
}

/** Desk service checks share the same lock and event policy as entrance scans. */
export async function requireOperationalService(q:Query,service:'Borrowing'|'Printing',now=new Date()){
 if(dbDriver!=='postgres')return
 await rows(q,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE')
 const state=await libraryState(q,now)
 if(!(service==='Borrowing'?state.allowBorrowing:state.allowPrinting))throw fail('LIBRARY_SERVICE_CLOSED',`${service} is closed for operating hours or the current scheduled event.`)
}

/** Uses intended local cutoff timestamps even when recovery runs after a restart. */
export async function closeAttendanceAtCutoff(q:Query,now=new Date()) {
 const policy=await attendancePolicy(q)
 if(!policy.configured||!policy.preclosingMinutes)return {closed:0}
 const result=await rows(q,`UPDATE attendance_logs al SET
  checked_out_at=GREATEST(COALESCE(al.checked_in_at,al.attendance_date+al.time_in),(al.attendance_date + COALESCE(s.closes_at,TIME '19:00:00')) - (? * INTERVAL '1 minute')),
  time_out=GREATEST(COALESCE(al.checked_in_at,al.attendance_date+al.time_in),(al.attendance_date + COALESCE(s.closes_at,TIME '19:00:00')) - (? * INTERVAL '1 minute'))::time,
  checkout_source='Automatic closing',checked_out_by_user_id=NULL
  FROM library_operating_schedule s
  WHERE s.day_of_week=EXTRACT(ISODOW FROM al.attendance_date) AND al.time_out IS NULL
   AND (al.attendance_date + COALESCE(s.closes_at,TIME '19:00:00'))-(? * INTERVAL '1 minute') <= (?::timestamptz AT TIME ZONE 'Asia/Manila')
  RETURNING al.log_id`,[policy.preclosingMinutes,policy.preclosingMinutes,policy.preclosingMinutes,now])
 // The compatibility adapter wraps UPDATE results as a header.
 return {closed:Number((result as any).affectedRows??0)}
}

export function createAttendanceOperations(pool:Pool=db,clock=()=>new Date()) {
 async function transaction<T>(fn:(c:PoolConnection)=>Promise<T>){const c=await pool.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result}catch(e){await c.rollback();throw e}finally{c.release()}}
 async function receipt(c:Query,r:RowDataPacket,visitor:any,duplicate:boolean){const state=await libraryState(c,clock());const log=(await rows(c,'SELECT checked_in_at,checked_out_at,reason_for_visit FROM attendance_logs WHERE log_id=?',[r.log_id]))[0];return {duplicate,action:r.action,message:duplicate?'This scan was already recorded.':r.action==='Entry'?'Library entry recorded.':'Library exit recorded.',visitor,attendance:{logId:Number(r.log_id),checkedInAt:log.checked_in_at,checkedOutAt:log.checked_out_at,purpose:log.reason_for_visit},occupancy:state}}
 return {
  state:()=>libraryState(pool,clock()),
  async events(){return rows(pool,"SELECT * FROM library_operational_events ORDER BY starts_at DESC,event_id DESC LIMIT 100")},
  async configure(actor:number,body:unknown){const input=parseAttendancePolicy(body);return transaction(async c=>{await requireLibraryActor(c,actor,'library.manage');await rows(c,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');const [r]=await c.execute<any>('UPDATE attendance_operation_settings SET service_purposes=?::jsonb,preclosing_minutes=?,configured=TRUE,row_version=row_version+1,updated_by=?,updated_at=NOW() WHERE settings_id=1 AND row_version=?',[JSON.stringify(input.purposes),input.minutes,actor,input.version]);if(!r.affectedRows)throw fail('ATTENDANCE_POLICY_STALE','The policy changed. Refresh before saving.');return libraryState(c,clock())})},
  async saveEvent(actor:number,eventId:number|null,body:unknown){const b=parseOperationalEvent(body);return transaction(async c=>{await requireLibraryActor(c,actor,'library.manage');await rows(c,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');if(eventId){const[r]=await c.execute<any>(`UPDATE library_operational_events SET title=?,event_kind=?,space_name=?,starts_at=?,ends_at=?,seat_capacity=?,allow_walk_ins=?,allow_borrowing=?,allow_printing=?,updated_by=?,row_version=row_version+1,updated_at=NOW() WHERE event_id=? AND row_version=? AND lifecycle_status='Active'`,[b.title,b.kind,b.space,b.start,b.end,b.capacity,b.allowWalkIns,b.allowBorrowing,b.allowPrinting,actor,eventId,b.version]);if(!r.affectedRows)throw fail('EVENT_STALE','The event changed. Refresh before saving.')}else await c.execute(`INSERT INTO library_operational_events(title,event_kind,space_name,starts_at,ends_at,seat_capacity,allow_walk_ins,allow_borrowing,allow_printing,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,[b.title,b.kind,b.space,b.start,b.end,b.capacity,b.allowWalkIns,b.allowBorrowing,b.allowPrinting,actor]);return libraryState(c,clock())})},
  async cancelEvent(actor:number,eventId:number,version:number){return transaction(async c=>{await requireLibraryActor(c,actor,'library.manage');await rows(c,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');const[r]=await c.execute<any>("UPDATE library_operational_events SET lifecycle_status='Cancelled',row_version=row_version+1,updated_by=?,updated_at=NOW() WHERE event_id=? AND row_version=? AND lifecycle_status='Active'",[actor,eventId,version]);if(!r.affectedRows)throw fail('EVENT_STALE','The event changed. Refresh before cancelling.');return libraryState(c,clock())})},
  async resolve(actor:number,body:unknown){const b=(body??{}) as any;return transaction(async c=>{await requireLibraryActor(c,actor,'desk.operate');await rows(c,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');const visitor=await validateAttendanceCredential(c,b.qr_payload,false,clock());await closeAttendanceAtCutoff(c,clock());const open=(await rows(c,'SELECT log_id,attendance_date,time_in,reason_for_visit FROM attendance_logs WHERE user_id=? AND time_out IS NULL ORDER BY log_id DESC LIMIT 1',[visitor.userId]))[0]??null;return {visitor,openVisit:open,nextAction:open?'Exit':'Entry',purpose:visitor.purpose,occupancy:await libraryState(c,clock())}})},
  async scan(actor:number,body:unknown){const b=(body??{}) as any,request=String(b.request_id??''),payload=String(b.qr_payload??'').trim();if(!/^[A-Za-z0-9_-]{16,64}$/.test(request))throw fail('ATTENDANCE_REQUEST_ID_INVALID','A valid scan request ID is required.',422)
   return transaction(async c=>{
    await requireLibraryActor(c,actor,'desk.operate')
    await rows(c,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE')
    const now=clock(),visitor=await validateAttendanceCredential(c,payload,true,now),digest=createHash('sha256').update(payload).digest('hex')
    const prior=(await rows(c,'SELECT * FROM attendance_scan_receipts WHERE request_id=?',[request]))[0]
    if(prior){if(Number(prior.user_id)!==visitor.userId||Number(prior.actor_account_id)!==actor||prior.payload_digest!==digest)throw fail('SCAN_REQUEST_CONFLICT','This scan identifier belongs to a different scan.');return receipt(c,prior,visitor,true)}
    await closeAttendanceAtCutoff(c,now)
    if(visitor.lastUsedAt&&now.getTime()-localTimestamp(visitor.lastUsedAt)<30000)throw fail('ATTENDANCE_SCAN_COOLDOWN','This QR was just scanned. Wait 30 seconds before scanning again.')
    const open=(await rows(c,'SELECT log_id,reason_for_visit FROM attendance_logs WHERE user_id=? AND time_out IS NULL ORDER BY log_id DESC LIMIT 1 FOR UPDATE',[visitor.userId]))[0]
    const action=open?'Exit':'Entry';if(b.expected_action&&b.expected_action!==action)throw fail('ATTENDANCE_SCAN_CHANGED','The visit changed since scanning. Scan again.')
    const state=await libraryState(c,now);let logId:number
    if(open){logId=Number(open.log_id);await c.execute("UPDATE attendance_logs SET time_out=(?::timestamptz AT TIME ZONE 'Asia/Manila')::time,checked_out_at=(?::timestamptz AT TIME ZONE 'Asia/Manila'),checkout_source='Scan',checked_out_by_user_id=(SELECT user_id FROM accounts WHERE account_id=?) WHERE log_id=?",[now,now,actor,logId])}
    else {
     const purpose=visitor.purpose??String(b.purpose??'');if(!attendancePurposes.includes(purpose as any))throw fail('ATTENDANCE_PURPOSE_REQUIRED','Choose the purpose to record entry.',422)
     if(!state.entryOpen)throw fail('ATTENDANCE_ENTRY_CLOSED',state.state==='Needs configuration'?'The Librarian must configure attendance policy first.':'Entry is closed for operating hours or pre-closing checkout.')
     const isPrinting=['Printing','Photocopy'].includes(purpose),isBorrowing=purpose==='Book Borrowing'
     if(!(isPrinting?state.allowPrinting:isBorrowing?state.allowBorrowing:state.allowWalkIns))throw fail('ATTENDANCE_EVENT_RESTRICTED','This service is restricted during the scheduled event.')
     const seat=!state.policy.servicePurposes.includes(purpose);if(seat&&state.current>=state.capacity)throw fail('LIBRARY_AT_CAPACITY','All available library seats are occupied.')
     const[r]=await c.execute<any>(`INSERT INTO attendance_logs(user_id,attendance_date,time_in,checked_in_at,reason_for_visit,qr_reference,qr_credential_id,scan_method,checked_in_by_user_id,entry_request_id,seat_visit) VALUES (?,?::date,(?::timestamptz AT TIME ZONE 'Asia/Manila')::time,(?::timestamptz AT TIME ZONE 'Asia/Manila'),?,?,?,'Permanent QR',(SELECT user_id FROM accounts WHERE account_id=?),?,?)`,[visitor.userId,manilaDate(now),now,now,purpose,visitor.publicId,visitor.credentialId,actor,request,seat]);logId=Number(r.insertId)
    }
    await c.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,delivered_at) VALUES (?,?,?,'Attendance','Attendance',?,?,'Normal',?,NOW()) ON CONFLICT (user_id,dedupe_key) DO NOTHING`,[visitor.userId,action==='Entry'?'Library check-in':'Library check-out',action==='Entry'?'Your library entry was recorded.':'Your library exit was recorded.',logId,visitor.role==='Faculty'?'/faculty/attendance':visitor.role==='Student'?'/student/attendance':'/staff/attendance',`attendance:${action.toLowerCase()}:${logId}`])
    await c.execute("UPDATE attendance_qr_credentials SET last_used_at=(?::timestamptz AT TIME ZONE 'Asia/Manila'),updated_at=NOW() WHERE credential_id=?",[now,visitor.credentialId])
    await c.execute('INSERT INTO attendance_scan_receipts(request_id,user_id,actor_account_id,credential_id,payload_digest,log_id,action) VALUES (?,?,?,?,?,?,?)',[request,visitor.userId,actor,visitor.credentialId,digest,logId,action])
    return receipt(c,{log_id:logId,action} as RowDataPacket,visitor,false)
   })
  },
  async autoCheckout(){if(dbDriver!=='postgres')return {closed:0};return transaction(async c=>{await rows(c,'SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');return closeAttendanceAtCutoff(c,clock())})},
 }
}
export const attendanceOperations=createAttendanceOperations()
