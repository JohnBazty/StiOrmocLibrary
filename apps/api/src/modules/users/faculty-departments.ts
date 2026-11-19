import type {Pool,RowDataPacket} from '../../config/db.js'
import {db} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import {requireLibraryActor} from '../../core/library-permissions.ts'
export function parseFacultyDepartment(value:unknown){
 if(typeof value!=='string'||value.length>150||/[\x00-\x1f\x7f]/.test(value))throw new HttpError(422,'DEPARTMENT_INVALID','Enter a department of up to 150 characters.')
 return value.trim()||null
}
export function createFacultyDepartmentsService(database:Pool=db){
 async function run(actor:number,target:unknown,body?:Record<string,unknown>){
 const id=Number(target);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'ACCOUNT_INVALID','Choose a Faculty account.')
 const department=body?parseFacultyDepartment(body.department):undefined
 if(body&&body.expectedDepartment!==null&&typeof body.expectedDepartment!=='string')throw new HttpError(422,'DEPARTMENT_INVALID','Reload the account before saving.')
 const q=await database.getConnection()
 try{
 await q.beginTransaction();await requireLibraryActor(q,actor,'library.manage')
 const [accounts]=await q.execute<RowDataPacket[]>('SELECT role,account_status FROM accounts WHERE account_id=? FOR UPDATE',[id])
 if(accounts[0]?.role!=='Faculty')throw new HttpError(422,'FACULTY_REQUIRED','Choose a Faculty account.')
 const [rows]=await q.execute<RowDataPacket[]>('SELECT department FROM faculty_department_assignments WHERE account_id=?',[id])
 const previous=rows[0]?.department??null
 if(body){
 if(previous!==body.expectedDepartment)throw new HttpError(409,'DEPARTMENT_CHANGED','Another librarian changed this department. Reload the account before saving.')
 if(department!==previous){
 if(department===null)await q.execute('DELETE FROM faculty_department_assignments WHERE account_id=?',[id])
 else await q.execute(`INSERT INTO faculty_department_assignments(account_id,department,updated_by)VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET department=EXCLUDED.department,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[id,department,actor])
 await q.execute(`INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,changed_fields,reason)VALUES(?,?,'ProfileUpdated',?,?,?,?)`,[id,actor,accounts[0].account_status,accounts[0].account_status,'faculty_department',`Faculty department: ${previous??'Not assigned'} → ${department??'Not assigned'}`])
 }
 }
 await q.commit();return {department:body?department:previous}
 }catch(error){await q.rollback();throw error}finally{q.release()}
 }
 return {read:(actor:number,id:unknown)=>run(actor,id),save:(actor:number,id:unknown,body:Record<string,unknown>)=>run(actor,id,body)}
}
export const facultyDepartmentsService=createFacultyDepartmentsService()
