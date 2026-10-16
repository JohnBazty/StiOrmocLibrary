import { createHash } from 'node:crypto'
import type { Pool,PoolConnection,RowDataPacket,ResultSetHeader } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { manilaDate } from '../attendance/attendance-intervals.ts'
import { currentEvidenceSql } from './enrollment-policy.ts'
import { parseEnrollmentFile } from './enrollment-parser.ts'

const fail=(message:string,code='ENROLLMENT_INPUT_INVALID')=>new HttpError(422,code,message)
const object=(value:unknown)=>value&&typeof value==='object'?value as Record<string,unknown>:{}
const text=(v:unknown)=>typeof v==='string'?v.trim().replace(/\s+/g,' '):''
const id=(v:unknown)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw fail('Choose a valid record.');return n}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const day=(v:unknown,optional=false)=>{const s=text(v);if(!s&&optional)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw fail('Choose a valid date.');return s}
const bool=(v:unknown)=>v===true||v==='true'
const termSelect='SELECT academic_term_id AS id,academic_year,term_name,starts_on::text,ends_on::text,is_active FROM academic_terms'
type EnrollmentReviewRow=RowDataPacket & {
 account_id:number;school_id:string;account_status:string;auth_version:number;user_id:number|null;
 full_name:string|null;course_or_strand:string|null;section:string|null;program_strand:string|null;
 year_grade_level:string|null;row_id:number|null;batch_id:number|null;enrollment_status:string|null;
 program:string|null;year_level:string|null;official_section:string|null;complete_roster:boolean;
}

export function createEnrollmentService(database:Pool=db,clock=()=>new Date()) {
 async function run<T>(actor:number,write:boolean,work:(q:PoolConnection)=>Promise<T>) {
  const q=await database.getConnection()
  try {await q.beginTransaction();if(write)await q.execute('SELECT settings_id FROM enrollment_settings WHERE settings_id=1 FOR UPDATE');await requireLibraryActor(q,id(actor),'library.manage');const result=await work(q);await q.commit();return result}
  catch(error){await q.rollback();throw error}finally{q.release()}
 }
 async function event(q:PoolConnection,actor:number,action:string,term:number|null,account:number|null,batch:number|null,before:unknown,after:unknown) {
  await q.execute('INSERT INTO enrollment_review_events(actor_account_id,action,academic_term_id,account_id,batch_id,before_data,after_data) VALUES(?,?,?,?,?,?::jsonb,?::jsonb)',[actor,action,term,account,batch,JSON.stringify(before),JSON.stringify(after)])
 }
 async function settings(q:PoolConnection) {const [r]=await q.execute<RowDataPacket[]>('SELECT * FROM enrollment_settings WHERE settings_id=1');return r[0]}
 async function term(q:PoolConnection,value:unknown) {const [r]=await q.execute<RowDataPacket[]>(`${termSelect} WHERE academic_term_id=?`,[id(value)]);if(!r[0])throw fail('Choose an existing school year and semester.');return r[0]}
 async function batch(q:PoolConnection,value:unknown) {const [r]=await q.execute<RowDataPacket[]>('SELECT *,source_date::text AS source_day FROM enrollment_import_batches WHERE batch_id=?',[id(value)]);if(!r[0])throw new HttpError(404,'ENROLLMENT_BATCH_NOT_FOUND','This roster preview was not found.');return r[0]}
 async function reviewRows(q:PoolConnection,termId:number,search='') {
  const [rows]=await q.execute<EnrollmentReviewRow[]>(`${currentEvidenceSql}
   SELECT a.account_id,a.school_id,a.account_status,a.auth_version,a.user_id,u.full_name,u.course_or_strand,u.section,
    sp.program_strand,sp.year_grade_level,e.row_id,e.batch_id,e.enrollment_status,e.program,e.year_level,e.section AS official_section,
    (SELECT id FROM baseline)>0 AS complete_roster
   FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id LEFT JOIN student_profiles sp ON sp.account_id=a.account_id
   LEFT JOIN evidence e ON e.school_id=a.school_id WHERE a.role='Student'
    AND POSITION(LOWER(?) IN LOWER(CONCAT(a.school_id,' ',COALESCE(u.full_name,''))))>0 ORDER BY a.school_id LIMIT 5001`,[termId,termId,search])
  if(rows.length>5000)throw fail('Search a student name or ID to narrow this review.')
  return rows.map(r=>({...r,reviewToken:digest(r),classification:r.enrollment_status==='Not Enrolled'?'Not enrolled':r.enrollment_status==='Enrolled'?(r.program!==(r.program_strand??r.course_or_strand??'')||r.year_level!==(r.year_grade_level??'')||r.official_section&&(r.official_section!==r.section)?'School details changed':'Still enrolled'):r.complete_roster?'Not in complete roster':'Needs verification'}))
 }
 return {
  async overview(actor:number) {return run(actor,false,async q=>{const [terms]=await q.execute<RowDataPacket[]>(`${termSelect} ORDER BY created_at DESC,academic_term_id DESC`);const [batches]=await q.execute<RowDataPacket[]>(`SELECT batch_id,academic_term_id,filename,source_date::text,roster_scope,batch_status,student_count,error_count,warning_count,confirmed_at FROM enrollment_import_batches ORDER BY batch_id DESC LIMIT 100`);return {settings:await settings(q),terms,batches}})},
  async saveTerm(actor:number,body:unknown) {
   const input=object(body),year=text(input.academicYear),name=text(input.termName),starts=day(input.startsOn,true),ends=day(input.endsOn,true)
   if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))-Number(year.slice(0,4))!==1||!name||name.length>100)throw fail('Enter a school year such as 2026-2027 and a semester name.')
   if(starts&&ends&&starts>ends)throw fail('The starting date must be before the ending date.')
   return run(actor,true,async q=>{
    if(input.id){const original=await term(q,input.id);if(original.academic_year!==year||original.term_name!==name)throw fail('Retain the term identity. Create a new term for a different school year or semester.');await q.execute('UPDATE academic_terms SET starts_on=?,ends_on=?,updated_at=NOW() WHERE academic_term_id=?',[starts,ends,original.id]);await event(q,actor,'Term dates updated',Number(original.id),null,null,original,{starts,ends});return {id:Number(original.id)}}
    const [prior]=await q.execute<RowDataPacket[]>('SELECT academic_term_id FROM academic_terms WHERE academic_year=? AND term_name=?',[year,name]);if(prior.length)throw fail('This school year and semester already exists. Choose it from the list.')
    const [saved]=await q.execute<ResultSetHeader>('INSERT INTO academic_terms(academic_year,term_name,starts_on,ends_on,is_active) VALUES(?,?,?,?,0)',[year,name,starts,ends]);await event(q,actor,'Term created',Number(saved.insertId),null,null,null,{year,name,starts,ends});return {id:Number(saved.insertId)}
   })
  },
  async configure(actor:number,body:unknown) {const input=object(body);return run(actor,true,async q=>{
   const before=await settings(q);if(Number(before.row_version)!==id(input.version))throw new HttpError(409,'ENROLLMENT_CHANGED','Enrollment settings changed. Refresh before saving.')
   const selected=await term(q,input.termId),enabled=bool(input.enabled)
   if(enabled){const [full]=await q.execute<RowDataPacket[]>("SELECT batch_id FROM enrollment_import_batches WHERE academic_term_id=? AND roster_scope='Complete' AND batch_status='Confirmed' LIMIT 1",[selected.id]);if(!full.length)throw fail('Confirm a complete school roster for this semester before activating enrollment checks.');const today=manilaDate(clock());if(selected.starts_on&&today<selected.starts_on||selected.ends_on&&today>selected.ends_on)throw fail('This semester is outside its recorded dates. Review the dates or choose the current semester.')}
   await q.execute('UPDATE academic_terms SET is_active=CASE WHEN academic_term_id=? THEN 1 ELSE 0 END',[selected.id])
   await q.execute('UPDATE enrollment_settings SET current_term_id=?,enforcement_enabled=?,row_version=row_version+1,updated_by=?,updated_at=NOW() WHERE settings_id=1',[selected.id,enabled,actor])
   await event(q,actor,enabled?'Enrollment checks activated':'Enrollment settings saved',Number(selected.id),null,null,before,{termId:Number(selected.id),enabled})
   return {termId:Number(selected.id),enabled}
  })},
  async stage(actor:number,file:{buffer:Buffer;originalname:string},body:unknown) {
   const input=object(body),termId=id(input.termId),sourceDate=day(input.sourceDate)!,scope=text(input.scope),listedEnrolled=bool(input.listedEnrolled)
   if(!['Complete','Partial'].includes(scope)||!bool(input.official))throw fail('Confirm that this is an approved registrar list and choose complete school or partial roster.')
   if(sourceDate>manilaDate(clock()))throw fail('The registrar list date cannot be in the future.')
   const selected=await run(actor,false,q=>term(q,termId))
   const parsed=await parseEnrollmentFile(file,{academicYear:selected.academic_year,termName:selected.term_name,listedEnrolled})
   const configHash=digest({termId,sourceDate,scope,listedEnrolled})
   return run(actor,true,async q=>{
    const [existing]=await q.execute<RowDataPacket[]>('SELECT batch_id,config_sha256 FROM enrollment_import_batches WHERE academic_term_id=? AND file_sha256=?',[termId,parsed.fingerprint])
    if(existing[0]){if(existing[0].config_sha256!==configHash)throw fail('This exact file was already previewed with different declarations. Review the saved preview or upload a corrected registrar file.');return {batchId:Number(existing[0].batch_id),replayed:true}}
    if(selected.starts_on&&sourceDate<selected.starts_on||selected.ends_on&&sourceDate>selected.ends_on)throw fail('The list date falls outside the selected semester. Check the term and file.')
    const [saved]=await q.execute<ResultSetHeader>(`INSERT INTO enrollment_import_batches(academic_term_id,filename,file_sha256,config_sha256,source_date,roster_scope,listed_enrolled,student_count,error_count,warning_count,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[termId,file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu,'_').slice(0,255),parsed.fingerprint,configHash,sourceDate,scope,listedEnrolled,parsed.rows.length,parsed.errors,parsed.warnings,actor])
    await q.execute(`INSERT INTO enrollment_import_rows(batch_id,source_sheet,source_row,school_id,student_name,program,year_level,section,school_email,enrollment_status,errors,warnings)
     SELECT ?,v->>'sheet',(v->>'row')::int,LEFT(v->'data'->>'schoolId',50),LEFT(v->'data'->>'name',200),LEFT(v->'data'->>'program',150),LEFT(v->'data'->>'yearLevel',50),LEFT(v->'data'->>'section',100),LEFT(v->'data'->>'email',255),COALESCE(NULLIF(v->'data'->>'status',''),'Unknown'),v->'errors',v->'warnings' FROM jsonb_array_elements(?::jsonb) v`,[saved.insertId,JSON.stringify(parsed.rows)])
    return {batchId:Number(saved.insertId),replayed:false}
   })
  },
  async preview(actor:number,batchId:number,page=1) {return run(actor,false,async q=>{const saved=await batch(q,batchId);const offset=(id(page)-1)*50;const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM enrollment_import_rows WHERE batch_id=? ORDER BY source_sheet,source_row LIMIT 50 OFFSET ?`,[saved.batch_id,offset]);const [counts]=await q.execute<RowDataPacket[]>(`SELECT COUNT(*) FILTER(WHERE a.account_id IS NULL) unmatched FROM enrollment_import_rows r LEFT JOIN accounts a ON a.school_id=r.school_id WHERE r.batch_id=?`,[saved.batch_id]);return {batch:saved,rows,unmatched:Number(counts[0].unmatched),page,pages:Math.ceil(Number(saved.student_count)/50)}})},
  async confirm(actor:number,batchId:number,body:unknown) {return run(actor,true,async q=>{
   const saved=await batch(q,batchId);if(saved.batch_status==='Confirmed')return {batchId:Number(saved.batch_id),replayed:true}
   if(!bool(object(body).reviewed))throw fail('Review the roster summary and confirm that this file belongs to the selected semester.')
   if(Number(saved.error_count)>0)throw fail('Fix the marked rows in the source file and upload a corrected copy. Nothing from this preview has been applied.')
   const [latest]=await q.execute<RowDataPacket[]>("SELECT MAX(source_date)::text day FROM enrollment_import_batches WHERE academic_term_id=? AND batch_status='Confirmed'",[saved.academic_term_id]);if(latest[0]?.day&&saved.source_day<latest[0].day)throw fail('A newer registrar list is already confirmed for this semester. Request an updated file.')
   const [newer]=await q.execute<RowDataPacket[]>("SELECT batch_id FROM enrollment_import_batches WHERE academic_term_id=? AND batch_status='Confirmed' AND batch_id>? LIMIT 1",[saved.academic_term_id,saved.batch_id]);if(newer.length)throw fail('A more recent preview was already confirmed. Upload a fresh file to avoid replacing newer evidence.')
   await q.execute("UPDATE enrollment_import_batches SET batch_status='Confirmed',confirmed_by=?,confirmed_at=NOW() WHERE batch_id=?",[actor,saved.batch_id]);await event(q,actor,'Roster confirmed',Number(saved.academic_term_id),null,Number(saved.batch_id),null,{scope:saved.roster_scope,students:Number(saved.student_count)})
   return {batchId:Number(saved.batch_id),replayed:false}
  })},
  async review(actor:number,search='',page=1) {return run(actor,false,async q=>{const config=await settings(q);if(!config.current_term_id)return {items:[],total:0,page:1,pages:1};const rows=await reviewRows(q,Number(config.current_term_id),search.slice(0,100));return {items:rows.slice((id(page)-1)*50,id(page)*50),total:rows.length,page,pages:Math.max(1,Math.ceil(rows.length/50))}})},
  async applyReview(actor:number,body:unknown) {const input=object(body);if(!Array.isArray(input.decisions)||!input.decisions.length||input.decisions.length>100)throw fail('Select between 1 and 100 students to review.');return run(actor,true,async q=>{
   const config=await settings(q);if(!config.current_term_id)throw fail('Select the current semester first.')
   const current=await reviewRows(q,Number(config.current_term_id)),seen=new Set<number>()
   for(const value of input.decisions as unknown[]) {
    const change=object(value),accountId=id(change.accountId);if(seen.has(accountId))throw fail('A student was selected twice.');seen.add(accountId)
    const row=current.find(r=>Number(r.account_id)===accountId)
    if(!row||row.reviewToken!==change.reviewToken)throw new HttpError(409,'ENROLLMENT_REVIEW_STALE','A student or roster changed. Refresh and review the latest details.')
    const action=text(change.action);if(!['Activate','Deactivate','Update details'].includes(action))throw fail('Choose an account review action.')
    if(row.account_status==='Archived'||!row.user_id)throw fail('An archived or unlinked account needs a separate account-management review.')
    if(action==='Deactivate'&&!['Not enrolled','Not in complete roster'].includes(row.classification))throw fail('This roster does not establish non-enrollment. Keep the account unchanged and verify with the registrar.')
    if(action!=='Deactivate'&&row.enrollment_status!=='Enrolled')throw fail('Confirm current enrollment before activation or school-detail updates.')
    const next=action==='Activate'?'Active':action==='Deactivate'?'Deactivated':row.account_status
    const [locked]=await q.execute<RowDataPacket[]>('SELECT account_status,auth_version FROM accounts WHERE account_id=? FOR UPDATE',[accountId]);if(Number(locked[0]?.auth_version)!==Number(row.auth_version)||locked[0]?.account_status!==row.account_status)throw new HttpError(409,'ENROLLMENT_REVIEW_STALE','This account changed. Refresh before confirming.')
    if(action==='Update details') {
     const [profiles]=await q.execute<RowDataPacket[]>('SELECT student_profile_id FROM student_profiles WHERE account_id=? FOR UPDATE',[accountId]);if(!profiles[0])throw fail('The student profile must be linked before updating official school details.')
     await q.execute('UPDATE student_profiles SET program_strand=?,year_grade_level=?,updated_at=NOW() WHERE account_id=?',[row.program,row.year_level,accountId])
     await q.execute("UPDATE users SET course_or_strand=?,section=CASE WHEN ?='' THEN section ELSE ? END,updated_at=NOW() WHERE user_id=?",[row.program,row.official_section,row.official_section,row.user_id])
    } else if(next!==row.account_status) {
     await q.execute('UPDATE accounts SET account_status=?,auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?',[next,accountId]);await q.execute('UPDATE users SET account_status=?,auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?',[next,row.user_id])
    }
    await q.execute('INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,changed_fields,reason) VALUES(?,?,?,?,?,?,?)',[accountId,actor,action==='Update details'?'Profile Updated':next==='Active'?'Activated':'Deactivated',row.account_status,next,action==='Update details'?'program_strand,year_grade_level,section':null,'Librarian-confirmed semester enrollment review.'])
    await event(q,actor,action,Number(config.current_term_id),accountId,row.batch_id?Number(row.batch_id):null,row,{status:next,program:action==='Update details'?row.program:row.program_strand,yearLevel:action==='Update details'?row.year_level:row.year_grade_level})
   }
   return {reviewed:seen.size}
  })},
 }
}
export const enrollmentService=createEnrollmentService()
