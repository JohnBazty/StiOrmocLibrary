import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Pool,PoolConnection,RowDataPacket } from 'mysql2/promise'
import { db,dbDriver } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { validateAttendanceCredential } from '../attendance/attendance-credential.service.ts'
import { libraryState } from '../attendance/attendance-operations.service.ts'
import { createCirculationService } from './circulation.service.ts'
import { borrowerEligibility,requireEligible,requireLoanSlot } from './desk-circulation.policy.ts'
import { loadDeskRequest } from './desk-request-context.ts'
import { prepareReturnedCopy } from './returned-copy-preparation.ts'
import { localTimestamp } from '../attendance/attendance-intervals.ts'
import { requestEventStatus, requestLabels } from '../reservations/book-request-events.ts'

export type DeskActor={accountId:number;role:string}
export type UseMode='TakeHome'|'InLibrary'
const problem=(code:string,message:string)=>new HttpError(422,code,message)
const object=(v:unknown)=>v&&typeof v==='object'?v as Record<string,unknown>:{}
export function scanBarcode(v:unknown){const s=typeof v==='string'?v.trim().toUpperCase():'';if(!s||s.length>100||/[\x00-\x1f\x7f]/.test(s))throw problem('DESK_BARCODE_INVALID','Scan a valid physical-copy barcode.');return s}
export function scanMode(v:unknown):UseMode {if(v!=='TakeHome'&&v!=='InLibrary')throw problem('DESK_MODE_REQUIRED','Choose Take-home or In-library use.');return v}
export function confirmationKey(v:unknown){if(typeof v!=='string'||! /^[A-Za-z0-9_-]{16,64}$/.test(v))throw problem('DESK_REQUEST_ID_REQUIRED','A valid confirmation request ID is required.');return v}
export function conditionAssessment(v:Record<string,unknown>){
 const condition=v.condition==null||v.condition===''?null:String(v.condition)
 const note=typeof v.assessmentNote==='string'?v.assessmentNote.trim():''
 if(condition!==null&&!['Good','Worn','Damaged','Lost'].includes(condition))throw problem('DESK_CONDITION_INVALID','Choose a supported physical condition.')
 if(note.length>500||/[\x00-\x1f\x7f]/.test(note))throw problem('DESK_ASSESSMENT_INVALID','The assessment note must be at most 500 characters.')
 if(condition&&['Damaged','Lost'].includes(condition)&&!note)throw problem('DESK_ASSESSMENT_REQUIRED','Describe the condition for staff assessment.')
 return {condition,note:note||null}
}
async function copy(q:PoolConnection,barcode:string){
 const [rows]=await q.execute<RowDataPacket[]>(`SELECT pc.*,t.title,t.record_type,t.lifecycle_status AS title_status,m.material_type FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id LEFT JOIN materials m ON m.material_id=pc.material_id WHERE pc.barcode=? LIMIT 1 FOR UPDATE OF pc,t`,[barcode])
 if(!rows[0]){
  const [research]=await q.execute<RowDataPacket[]>(`SELECT ri.research_inventory_id,ri.title_id,NULL::bigint AS physical_copy_id,NULL::bigint AS material_id,ri.barcode,ri.accession_number,ri.lifecycle_status,INITCAP(ri.availability_status) AS availability_status,CASE ri.condition_state WHEN 'good' THEN 'Good' WHEN 'fair' THEN 'Worn' WHEN 'for_repair' THEN 'Damaged' WHEN 'damaged' THEN 'Damaged' ELSE 'Lost' END AS condition_status,t.title,t.record_type,t.lifecycle_status AS title_status,'Thesis/Manuscript' AS material_type FROM research_inventory ri JOIN titles t ON t.title_id=ri.title_id WHERE ri.barcode=? LIMIT 1 FOR UPDATE OF ri,t`,[barcode])
  if(research[0])return research[0]
  throw problem('DESK_COPY_NOT_FOUND','No physical copy matches this barcode.')
 }
 return rows[0]
}
async function copyBlockers(q:PoolConnection,c:RowDataPacket,userId:number,mode:UseMode,policyId:number,now:Date){
 const blockers:string[]=[]
 if(c.lifecycle_status!=='Active'||c.title_status!=='Active')blockers.push('This title or copy is archived.')
 if(!c.material_id&&!c.research_inventory_id)blockers.push('This copy is not linked to the circulation ledger.')
 if(['Lost','Damaged'].includes(String(c.condition_status))||c.availability_status==='Unavailable')blockers.push('The copy is unavailable or requires condition assessment.')
 const [uses]=await q.execute<RowDataPacket[]>('SELECT use_id FROM in_library_uses WHERE (physical_copy_id=? OR research_inventory_id=?) AND ended_at IS NULL',[c.physical_copy_id,c.research_inventory_id??null])
 if(uses.length)blockers.push('This copy is already assigned for in-library use.')
 const [loans]=await q.execute<RowDataPacket[]>(`SELECT * FROM borrow_transactions WHERE (physical_copy_id=? OR material_id=?) AND transaction_status IN ('Pending','Borrowed','Overdue') FOR UPDATE`,[c.physical_copy_id,c.material_id])
 if(loans.some(l=>l.transaction_status!=='Pending'||Number(l.user_id)!==userId))blockers.push('This copy is already borrowed or held for another user.')
 if(mode==='InLibrary'&&loans.length)blockers.push('A copy held for a take-home request cannot be assigned for in-library use.')
 const [queue]=await q.execute<RowDataPacket[]>(`SELECT r.* FROM reservations r WHERE r.book_title_id=? AND r.reservation_status IN ('pending','approved','ready_for_pickup') ORDER BY queue_position,reserved_at,reservation_id FOR UPDATE`,[c.title_id])
 const assigned=queue.find(r=>Number(r.assigned_physical_copy_id)===Number(c.physical_copy_id))
 const own=queue.find(r=>Number(r.user_id)===userId)
 const claim=assigned??queue.find(r=>!r.assigned_physical_copy_id)
 if(claim&&Number(claim.user_id)!==userId)blockers.push('This copy is held for another user or the waiting queue.')
 if(mode==='InLibrary'&&queue.length)blockers.push('A queued title must be prepared for its waiting borrower.')
 const cartHandover=own?.request_kind==='CartHandover'&&own.reservation_status==='approved'
 if(own&&((!cartHandover&&own.reservation_status!=='ready_for_pickup')||Number(own.assigned_physical_copy_id)!==Number(c.physical_copy_id)))blockers.push('Use the assigned copy. Reservations must first be marked Ready for pickup.')
 if(assigned?.pickup_deadline&&localTimestamp(assigned.pickup_deadline)<=now.getTime())blockers.push('The pickup deadline has expired.')
 if(!['Available','Reserved'].includes(String(c.availability_status)))blockers.push('This physical copy is not available for checkout.')
 if(c.availability_status==='Reserved'&&!loans.length&&!queue.length)blockers.push('This copy is reserved without a matching claim. Ask the Librarian to review it.')
 if(mode==='TakeHome'){
  const [rules]=await q.execute<RowDataPacket[]>('SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type=?',[policyId,c.material_type])
  if(c.record_type!=='Book'||!rules[0]?.is_borrowable)blockers.push('This material is for in-library reading only.')
 }
 return blockers
}
async function verifySelectedRequest(q:PoolConnection,input:Record<string,unknown>,userId:number,c:RowDataPacket,mode:UseMode) {
 if(input.reservationId==null)return
 if(mode!=='TakeHome'||!Number.isSafeInteger(Number(input.reservationId)))throw problem('DESK_REQUEST_INVALID','Choose a valid take-home book request.')
 const [rows]=await q.execute<RowDataPacket[]>(`SELECT assigned_physical_copy_id FROM reservations WHERE reservation_id=? AND user_id=? AND reservation_status IN ('pending','approved','ready_for_pickup')`,[Number(input.reservationId),userId])
 if(!rows.length||Number(rows[0].assigned_physical_copy_id)!==Number(c.physical_copy_id))throw problem('DESK_REQUEST_COPY_MISMATCH','This barcode does not match the selected book request. Scan its assigned copy.')
}
/** Delegate the existing ledger operation into our transaction without an inner commit. */
function transactionPool(q:PoolConnection):Pool{return {getConnection:async()=>({...q,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})} as unknown as Pool}
async function approvedPhoto(q:PoolConnection,accountId:number){
 const [rows]=await q.execute<RowDataPacket[]>(`SELECT storage_path FROM profile_avatar_submissions WHERE account_id=? AND status='Approved' ORDER BY reviewed_at DESC,submission_id DESC LIMIT 1`,[accountId])
 if(!rows[0]||!env.supabase.url||!env.supabase.secretKey)return null
 try{const {data}=await createClient(env.supabase.url,env.supabase.secretKey,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('profile-avatars').createSignedUrl(String(rows[0].storage_path),300);return data?.signedUrl??null}catch{return null}
}
export async function flagUnreturnedInLibrary(q:Pick<PoolConnection,'execute'>,now:Date):Promise<{flagged:number}>{
 if('getConnection' in q){const conn=await (q as Pool).getConnection();try{await conn.beginTransaction();await conn.execute('SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');const result=await flagUnreturnedInLibrary(conn,now);await conn.commit();return result}catch(e){await conn.rollback();throw e}finally{conn.release()}}
 const [result]=await q.execute(`UPDATE in_library_uses SET status='Review',reviewed_at=?,updated_at=NOW() WHERE status='Open' AND ended_at IS NULL AND hand_back_by<=? RETURNING use_id,user_id,COALESCE(physical_copy_id,research_inventory_id) AS physical_copy_id`,[now,now]) as unknown as [{rows:RowDataPacket[]},unknown]
 for(const row of result.rows??[]){await q.execute(`INSERT INTO admin_notifications(event_type,actor_user_id,message_title,message_body) VALUES ('in_library_handback_missing',?,'In-library copy needs review',?)`,[row.user_id,`In-library use #${row.use_id}: copy #${row.physical_copy_id} has not been handed back. Verify its physical location; attendance checkout did not return it.`])}
 return {flagged:result.rows?.length??0}
}
export function createDeskCirculationService(database:Pool=db,clock=()=>new Date()){
 async function transaction<T>(actor:DeskActor,work:(q:PoolConnection)=>Promise<T>){
  if(dbDriver!=='postgres')throw new HttpError(503,'DESK_SCHEMA_UNAVAILABLE','The revised circulation desk requires the Postgres extension.')
  if(!['Librarian','Staff'].includes(actor.role))throw new HttpError(403,'DESK_FORBIDDEN','Only library desk personnel can scan borrowing and returns.')
  const q=await database.getConnection();try{await q.beginTransaction();await q.execute('SELECT settings_id FROM library_profile_settings WHERE settings_id=1 FOR UPDATE');const [actors]=await q.execute<RowDataPacket[]>('SELECT account_id FROM accounts WHERE account_id=? AND role=? AND account_status=\'Active\' FOR UPDATE',[actor.accountId,actor.role]);if(!actors.length)throw new HttpError(403,'DESK_ACTOR_INACTIVE','Your desk account is not active.');const result=await work(q);await q.commit();return result}catch(e){await q.rollback();throw e}finally{q.release()}
 }
 async function receipt(q:PoolConnection,actor:DeskActor,input:Record<string,unknown>,operation:string,run:()=>Promise<any>){
  const key=confirmationKey(input.requestId),digest=createHash('sha256').update(JSON.stringify([operation,input.payload??null,input.barcode,input.expectedId??null,input.reservationId??null,input.transactionId??null,input.expectedCopyId??null,input.kind??null,input.condition??null,input.assessmentNote??null])).digest('hex')
  const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM circulation_scan_receipts WHERE request_id=? FOR UPDATE',[key])
  if(rows[0]){if(Number(rows[0].actor_account_id)!==actor.accountId||rows[0].payload_digest!==digest||rows[0].operation!==operation)throw new HttpError(409,'DESK_REQUEST_REUSED','This confirmation ID belongs to a different transaction.');return {...rows[0].result,replayed:true}}
  const result=await run();await q.execute('INSERT INTO circulation_scan_receipts(request_id,actor_account_id,operation,payload_digest,result) VALUES (?,?,?,?,?::jsonb)',[key,actor.accountId,operation,digest,JSON.stringify(result)]);return result
 }
 async function activeAssignment(q:PoolConnection,c:RowDataPacket){
  const [uses]=await q.execute<RowDataPacket[]>(`SELECT iu.*,u.full_name,u.school_id FROM in_library_uses iu JOIN users u ON u.user_id=iu.user_id WHERE (iu.physical_copy_id=? OR iu.research_inventory_id=?) AND iu.ended_at IS NULL FOR UPDATE OF iu`,[c.physical_copy_id,c.research_inventory_id??null])
  if(uses[0])return {kind:'InLibrary',id:Number(uses[0].use_id),row:uses[0]}
  const [loans]=await q.execute<RowDataPacket[]>(`SELECT bt.*,u.full_name,u.school_id,to_char(bt.due_at,'YYYY-MM-DD"T"HH24:MI:SS')||'+08:00' AS due_iso FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id WHERE (bt.physical_copy_id=? OR bt.material_id=?) AND bt.transaction_status IN ('Borrowed','Overdue') FOR UPDATE OF bt`,[c.physical_copy_id,c.material_id])
  if(!loans[0])throw problem('DESK_NO_ACTIVE_ASSIGNMENT','This copy has no active loan or in-library assignment to return.')
  return {kind:'TakeHome',id:Number(loans[0].transaction_id),row:loans[0]}
 }
 async function borrowerDetails(q:PoolConnection,userId:number,mode:UseMode) {
  const eligibility=await borrowerEligibility(q,userId,clock(),mode);
  if(!eligibility.user)throw problem('DESK_BORROWER_NOT_FOUND','The borrower profile is unavailable.')
  const [requests]=await q.execute<RowDataPacket[]>(`SELECT r.reservation_id,r.request_kind,r.reservation_status,r.assigned_physical_copy_id,t.title,pc.barcode,pc.shelf_location,(r.pickup_deadline AT TIME ZONE 'Asia/Manila') AS deadline FROM reservations r JOIN titles t ON t.title_id=r.book_title_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=r.assigned_physical_copy_id WHERE r.user_id=? AND r.reservation_status IN ('pending','approved','ready_for_pickup') ORDER BY r.reserved_at,r.reservation_id`,[userId]);return {requests:requests.map(r=>({reservationId:Number(r.reservation_id),title:r.title,statusLabel:r.request_kind==='CartHandover'?'Awaiting handover':requestLabels[requestEventStatus(String(r.reservation_status),Boolean(r.assigned_physical_copy_id))],barcode:r.barcode??null,shelfLocation:r.shelf_location??null,pickupDeadline:r.deadline??null})),user:{userId:userId,name:eligibility.user.full_name,schoolId:eligibility.user.school_id,role:eligibility.user.user_role,program:eligibility.user.course_or_strand,photoUrl:eligibility.user?.account_id?await approvedPhoto(q,Number(eligibility.user.account_id)):null},blockers:eligibility.blockers,eligible:!eligibility.blockers.length,enrollment:eligibility.enrollment,activeLoans:eligibility.loans.length,limit:eligibility.limit,hasAttendance:Boolean(eligibility.visit)}
 }
 async function identity(q:PoolConnection,input:Record<string,unknown>,mode:UseMode,confirming=false) {
  if(input.payload)return validateAttendanceCredential(q,input.payload,confirming,clock())
  if(mode!=='TakeHome')throw problem('DESK_MODE_REQUIRED','Pickup requests are for take-home borrowing.')
  return loadDeskRequest(q,input,clock(),confirming)
 }
 return {
  async borrower(actor:DeskActor,body:unknown){const input=object(body),mode=scanMode(input.mode);return transaction(actor,async q=>{const qr=await validateAttendanceCredential(q,input.payload,false,clock());return borrowerDetails(q,qr.userId,mode)})},
  async requestPreview(actor:DeskActor,body:unknown){const input=object(body);return transaction(actor,async q=>{const selected=await loadDeskRequest(q,input,clock()),borrower=await borrowerDetails(q,selected.userId,'TakeHome'),c=await copy(q,selected.barcode),e=await borrowerEligibility(q,selected.userId,clock(),'TakeHome');const blockers=[...e.blockers,...await copyBlockers(q,c,selected.userId,'TakeHome',Number(e.policy.borrowing_policy_version_id),clock())];try{await requireLoanSlot(q,selected.userId,selected.copyId,e.limit)}catch(error){blockers.push(error instanceof Error?error.message:'The loan limit has been reached.')};return {borrower,preview:{copy:{id:selected.copyId,title:c.title,barcode:c.barcode,condition:c.condition_status},blockers,eligible:!blockers.length},reservationId:selected.reservationId,barcode:selected.barcode}})},
  async preview(actor:DeskActor,body:unknown){const input=object(body),mode=scanMode(input.mode),barcode=scanBarcode(input.barcode);return transaction(actor,async q=>{const qr=await identity(q,input,mode),e=await borrowerEligibility(q,qr.userId,clock(),mode),c=await copy(q,barcode),blockers=[...e.blockers,...await copyBlockers(q,c,qr.userId,mode,Number(e.policy.borrowing_policy_version_id),clock())];await verifySelectedRequest(q,input,qr.userId,c,mode);if(mode==='TakeHome')try{await requireLoanSlot(q,qr.userId,Number(c.physical_copy_id),e.limit)}catch(error){blockers.push(error instanceof Error?error.message:'The loan limit has been reached.')};return {copy:{id:Number(c.physical_copy_id??c.research_inventory_id),title:c.title,barcode:c.barcode,condition:c.condition_status},blockers,eligible:!blockers.length}})},
  async checkout(actor:DeskActor,body:unknown){const input=object(body),mode=scanMode(input.mode),barcode=scanBarcode(input.barcode);input.barcode=barcode;return transaction(actor,q=>receipt(q,actor,input,mode,async()=>{const now=clock(),qr=await identity(q,input,mode,true),e=await borrowerEligibility(q,qr.userId,now,mode);requireEligible(e);const c=await copy(q,barcode),blockers=await copyBlockers(q,c,qr.userId,mode,Number(e.policy.borrowing_policy_version_id),now);await verifySelectedRequest(q,input,qr.userId,c,mode);if(blockers.length)throw problem('DESK_COPY_BLOCKED',blockers.join(' '));if(mode==='TakeHome'){const result=await createCirculationService(transactionPool(q),clock).confirmCheckout(actor.accountId,{barcode,userId:qr.userId,reservationId:input.reservationId});return {...result,mode,enrollment:e.enrollment}}
   const handBackBy=e.state.cutoffAt;if(!handBackBy)throw problem('DESK_CUTOFF_UNAVAILABLE','No hand-back time is configured for today.');const [r]=await q.execute(`INSERT INTO in_library_uses(user_id,physical_copy_id,material_id,research_inventory_id,attendance_log_id,started_at,hand_back_by,condition_out,started_by_account_id) VALUES (?,?,?,?,?,?,?,?,?)`,[qr.userId,c.physical_copy_id,c.material_id,c.research_inventory_id??null,e.visit!.log_id,now,handBackBy,c.condition_status,actor.accountId]) as unknown as [{insertId:number},unknown];if(c.research_inventory_id)await q.execute("UPDATE research_inventory SET availability_status='borrowed',row_version=row_version+1,updated_at=NOW() WHERE research_inventory_id=?",[c.research_inventory_id]);else {await q.execute("UPDATE physical_copies SET availability_status='Borrowed',row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?",[c.physical_copy_id]);await q.execute("UPDATE materials SET availability_status='Borrowed',updated_at=NOW() WHERE material_id=?",[c.material_id])};return {useId:r.insertId,mode,title:c.title,barcode:c.barcode,handBackBy,status:'Open',enrollment:e.enrollment}
  }))},
  async returnPreview(actor:DeskActor,body:unknown){const barcode=scanBarcode(object(body).barcode);return transaction(actor,async q=>{const c=await copy(q,barcode),a=await activeAssignment(q,c);return {kind:a.kind,id:a.id,title:c.title,barcode:c.barcode,condition:c.condition_status,borrower:{name:a.row.full_name,schoolId:a.row.school_id},dueAt:a.row.due_iso??a.row.hand_back_by,status:a.row.status??a.row.transaction_status}})},
  async returnCopy(actor:DeskActor,body:unknown){const input=object(body);input.barcode=scanBarcode(input.barcode);const assessment=conditionAssessment(input);return transaction(actor,q=>receipt(q,actor,input,'Return',async()=>{const c=await copy(q,String(input.barcode)),a=await activeAssignment(q,c);if(input.kind!==a.kind||Number(input.expectedId)!==a.id)throw new HttpError(409,'DESK_RETURN_STALE','This copy assignment changed. Scan it again before returning.');if(assessment.condition==='Lost')throw problem('DESK_LOST_INCIDENT','A missing copy cannot be handed back. Use Report lost in the existing incident workflow.');if(assessment.condition){c.condition_status=assessment.condition;await q.execute('UPDATE physical_copies SET condition_status=? WHERE physical_copy_id=?',[assessment.condition,c.physical_copy_id])}let result:Record<string,unknown>;
   if(a.kind==='TakeHome')result=await createCirculationService(transactionPool(q),clock).returnBook(actor.accountId,a.id)
   else {await q.execute("UPDATE in_library_uses SET status='Returned',ended_at=?,condition_in=?,assessment_note=?,returned_by_account_id=?,updated_at=NOW() WHERE use_id=?",[clock(),assessment.condition??c.condition_status,assessment.note,actor.accountId,a.id]);await q.execute("UPDATE physical_copies SET availability_status='Available',row_version=row_version+1,updated_at=NOW() WHERE physical_copy_id=?",[c.physical_copy_id]);await q.execute("UPDATE materials SET availability_status='Available',updated_at=NOW() WHERE material_id=?",[c.material_id]);result={useId:a.id,status:'Returned',...(c.research_inventory_id?{}:await prepareReturnedCopy(q,c as any,clock()))}}
   if(assessment.condition){await q.execute('UPDATE physical_copies SET condition_status=?,availability_status=CASE WHEN ?=\'Damaged\' THEN \'Unavailable\' ELSE availability_status END,updated_at=NOW() WHERE physical_copy_id=?',[assessment.condition,assessment.condition,c.physical_copy_id]);if(assessment.condition==='Damaged')await q.execute("UPDATE materials SET availability_status='Unavailable',updated_at=NOW() WHERE material_id=?",[c.material_id]);await q.execute("INSERT INTO admin_notifications(event_type,actor_user_id,message_title,message_body) VALUES ('return_condition_assessment',?,'Returned copy assessment',?)",[a.row.user_id,`${c.barcode}: ${assessment.condition}. ${assessment.note??''}`])}
   if(c.research_inventory_id){const finalCondition=assessment.condition??c.condition_status;await q.execute('UPDATE research_inventory SET availability_status=?,condition_state=?,row_version=row_version+1,updated_at=NOW() WHERE research_inventory_id=?',[['Damaged','Lost'].includes(finalCondition)?'unavailable':'available',finalCondition==='Damaged'?'damaged':finalCondition==='Lost'?'lost':finalCondition==='Worn'?'fair':'good',c.research_inventory_id])}
   return {...result,kind:a.kind,title:c.title,condition:assessment.condition??c.condition_status,assessmentNeeded:assessment.condition==='Damaged'}
  }))},
  async uses(actor:DeskActor){return transaction(actor,async q=>{await flagUnreturnedInLibrary(q,clock());const [rows]=await q.execute<RowDataPacket[]>(`SELECT iu.use_id,iu.user_id,iu.status,iu.started_at,iu.hand_back_by,iu.ended_at,iu.condition_out,iu.condition_in,iu.assessment_note,COALESCE(pc.barcode,ri.barcode) AS barcode,t.title,u.full_name,u.school_id FROM in_library_uses iu LEFT JOIN physical_copies pc ON pc.physical_copy_id=iu.physical_copy_id LEFT JOIN research_inventory ri ON ri.research_inventory_id=iu.research_inventory_id JOIN titles t ON t.title_id=COALESCE(pc.title_id,ri.title_id) JOIN users u ON u.user_id=iu.user_id ORDER BY (iu.ended_at IS NULL) DESC,iu.started_at DESC LIMIT 100`);return rows})},
  async mine(accountId:number){const [rows]=await database.execute<RowDataPacket[]>(`SELECT iu.use_id,iu.status,iu.started_at,iu.hand_back_by,iu.ended_at,iu.condition_out,iu.condition_in,t.title,COALESCE(pc.barcode,ri.barcode) AS barcode FROM in_library_uses iu JOIN accounts a ON a.user_id=iu.user_id LEFT JOIN physical_copies pc ON pc.physical_copy_id=iu.physical_copy_id LEFT JOIN research_inventory ri ON ri.research_inventory_id=iu.research_inventory_id JOIN titles t ON t.title_id=COALESCE(pc.title_id,ri.title_id) WHERE a.account_id=? ORDER BY iu.started_at DESC LIMIT 100`,[accountId]);return rows},
 }
}
export const deskCirculationService=createDeskCirculationService()
