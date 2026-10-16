import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { isPostgres } from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'
import { manilaDate } from '../attendance/attendance-intervals.ts'
type Query=Pick<PoolConnection,'execute'>|Pick<Pool,'execute'>

export const currentEvidenceSql=`WITH baseline AS (
 SELECT COALESCE(MAX(batch_id),0) id FROM enrollment_import_batches
 WHERE academic_term_id=? AND batch_status='Confirmed' AND roster_scope='Complete'
), evidence AS (
 SELECT DISTINCT ON(r.school_id) r.*,b.source_date,b.academic_term_id FROM enrollment_import_rows r
 JOIN enrollment_import_batches b ON b.batch_id=r.batch_id CROSS JOIN baseline
 WHERE b.academic_term_id=? AND b.batch_status='Confirmed' AND b.batch_id>=baseline.id
 ORDER BY r.school_id,b.batch_id DESC
)`

export async function enrollmentDecision(q:Query,schoolId:string,role:string,now=new Date()) {
 if(!isPostgres||role!=='Student')return {allowed:true,label:role==='Student'?'Enrollment not verified':'Enrollment check not required',enforced:false,evidence:null as RowDataPacket|null}
 const [settings]=await q.execute<RowDataPacket[]>(`SELECT s.*,t.academic_year,t.term_name,t.starts_on::text,t.ends_on::text
 FROM enrollment_settings s LEFT JOIN academic_terms t ON t.academic_term_id=s.current_term_id WHERE s.settings_id=1`)
 const config=settings[0]
 if(!config?.enforcement_enabled)return {allowed:true,label:'Enrollment not verified — roster checks not activated',enforced:false,evidence:null as RowDataPacket|null}
 const today=manilaDate(now),inTerm=(!config.starts_on||today>=config.starts_on)&&(!config.ends_on||today<=config.ends_on)
 const [rows]=await q.execute<RowDataPacket[]>(`${currentEvidenceSql} SELECT * FROM evidence WHERE school_id=?`,[config.current_term_id,config.current_term_id,schoolId])
 const evidence=rows[0]??null,allowed=Boolean(inTerm&&evidence?.enrollment_status==='Enrolled')
 return {allowed,label:allowed?`Enrollment verified — ${config.academic_year}, ${config.term_name}`:!inTerm?'Current semester needs review':'Enrollment could not be confirmed for the current semester',enforced:true,evidence}
}

/** Anonymous registration receives no roster fields or confirmation of another identity. */
export async function requireRegistrationEnrollment(q:Query,schoolId:string,role:string,email?:string) {
 const result=await enrollmentDecision(q,schoolId,role)
 if(!result.allowed||(result.enforced&&result.evidence?.school_email&&email&&result.evidence.school_email.toLowerCase()!==email.toLowerCase()))
  throw new HttpError(422,'ENROLLMENT_NOT_CONFIRMED','Enrollment could not be confirmed with these details for the current semester. Please contact the registrar or library. No account was activated.')
 return result
}
