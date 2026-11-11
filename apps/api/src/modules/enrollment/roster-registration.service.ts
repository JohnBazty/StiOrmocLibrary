import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { normalizeSchoolId } from '../auth/account-auth.validation.ts'
import { createActiveAccount } from '../auth/registration.service.ts'
import { sendSchoolVerificationCode } from '../auth/school-email.sender.ts'
import { activeEnrollmentSemester, enrollmentEnabled, linkSemesterMember, lockEnrollment, rosterStudent } from './enrollment-policy.ts'

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const codeTtl=600_000
const invalid=()=>new HttpError(422,'ROSTER_CODE_INVALID','The code is incorrect, expired or already used. Request a new code or contact the library.')
const notOpen=()=>new HttpError(409,'ROSTER_REGISTRATION_CLOSED','Student registration is paused until the next semester starts.')
const digest=(purpose:string,id:string,value:string)=>createHmac('sha256',env.jwt.secret).update(`roster:${purpose}:${id}:${value}`).digest('hex')
function equal(a:unknown,b:string){return typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))}
const object=(value:unknown)=>value&&typeof value==='object'?value as Record<string,unknown>:{}

export function createRosterRegistration(database:Pool=db,sendCode=sendSchoolVerificationCode,enabled=enrollmentEnabled) {
  async function run<T>(work:(q:PoolConnection)=>Promise<T>){
    if(!enabled())throw notOpen()
    const q=await database.getConnection()
    try{await q.beginTransaction();const started=await lockEnrollment(q);if(!started)throw notOpen();const data=await work(q);await q.commit();return data}
    catch(e){await q.rollback();throw e}finally{q.release()}
  }
  async function current(q:PoolConnection,challengeId:string) {
    const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM enrollment_signup_challenges WHERE challenge_id=? FOR UPDATE',[challengeId])
    const row=rows[0], term=await activeEnrollmentSemester(q)
    if(!row||!term||Number(row.semester_id)!==Number(term.semester_id)||+new Date(row.expires_at)<=Date.now())throw invalid()
    const student=await rosterStudent(q,Number(term.semester_id),String(row.school_id))
    if(!student||Number(student.roster_id)!==Number(row.roster_id)||student.school_email!==row.school_email)throw invalid()
    return {row,student}
  }
  return {
    async begin(body:unknown){
      const schoolId=normalizeSchoolId(object(body).school_id)
      if(!/^[A-Z0-9][A-Z0-9._-]{2,49}$/.test(schoolId))throw new HttpError(422,'STUDENT_ID_INVALID','Enter a valid Student ID.')
      const challengeId=randomUUID(),code=String(randomInt(0,1_000_000)).padStart(6,'0')
      const target=await run(async q=>{
        const term=await activeEnrollmentSemester(q)
        if(!term)throw notOpen()
        const student=await rosterStudent(q,Number(term.semester_id),schoolId)
        if(!student?.school_email)return null
        // Lock the per-ID challenge before changing it. Never return roster identity to anonymous callers.
        const [existing]=await q.execute<RowDataPacket[]>(`SELECT 1 FROM accounts WHERE school_id=?
          UNION ALL SELECT 1 FROM users WHERE LOWER(email)=? LIMIT 1`,[schoolId,student.school_email])
        if(existing.length)return null
        const timestamp=new Date()
        const [saved]=await q.execute<ResultSetHeader>(`INSERT INTO enrollment_signup_challenges
          (challenge_id,semester_id,roster_id,school_id,school_email,code_hash,sent_at,expires_at)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT (school_id) DO UPDATE SET challenge_id=EXCLUDED.challenge_id,semester_id=EXCLUDED.semester_id,
            roster_id=EXCLUDED.roster_id,school_email=EXCLUDED.school_email,code_hash=EXCLUDED.code_hash,
            grant_hash=NULL,sent_at=EXCLUDED.sent_at,expires_at=EXCLUDED.expires_at,
            attempts=CASE WHEN enrollment_signup_challenges.expires_at<=EXCLUDED.sent_at THEN 0 ELSE enrollment_signup_challenges.attempts END
          WHERE enrollment_signup_challenges.sent_at<=EXCLUDED.sent_at-INTERVAL '1 minute'
            AND (enrollment_signup_challenges.expires_at<=EXCLUDED.sent_at OR
              (enrollment_signup_challenges.grant_hash IS NULL AND enrollment_signup_challenges.attempts<5))
          RETURNING school_email`,[challengeId,term.semester_id,student.roster_id,schoolId,student.school_email,digest('code',challengeId,code),timestamp,new Date(+timestamp+codeTtl)])
        return saved.affectedRows ? String(student.school_email) : null
      })
      if(target){
        try{await sendCode(target,code)}
        catch{await database.execute('UPDATE enrollment_signup_challenges SET code_hash=NULL WHERE challenge_id=?',[challengeId])}
      }
      return {challengeId}
    },
    async verify(body:unknown){
      const input=object(body),challengeId=String(input.challenge_id??''),code=String(input.code??'')
      if(!uuid.test(challengeId)||!/^\d{6}$/.test(code))throw invalid()
      const grant=randomBytes(32).toString('hex')
      const ok=await run(async q=>{
        const {row}=await current(q,challengeId)
        if(!row.code_hash||row.grant_hash||Number(row.attempts)>=5)return false
        if(!equal(row.code_hash,digest('code',challengeId,code))){
          await q.execute('UPDATE enrollment_signup_challenges SET attempts=attempts+1 WHERE challenge_id=?',[challengeId])
          return false
        }
        await q.execute('UPDATE enrollment_signup_challenges SET code_hash=NULL,grant_hash=?,expires_at=? WHERE challenge_id=?',
          [digest('grant',challengeId,grant),new Date(Date.now()+codeTtl),challengeId])
        return true
      })
      if(!ok)throw invalid()
      return {grant}
    },
    async complete(body:unknown){
      const input=object(body),challengeId=String(input.challenge_id??''),grant=String(input.grant??'')
      if(!uuid.test(challengeId)||! /^[a-f0-9]{64}$/.test(grant))throw invalid()
      const password=typeof input.password==='string'?input.password:''
      if(password.length<8||Buffer.byteLength(password)>72||password!==input.confirm_password)
        throw new HttpError(422,'ROSTER_PASSWORD_INVALID','Use a password of at least 8 characters and enter it twice. The password must fit within 72 bytes.')
      // Validate the grant before the costly hash, then validate it again under the lifecycle lock.
      await run(async q=>{const {row}=await current(q,challengeId);if(!equal(row.grant_hash,digest('grant',challengeId,grant)))throw invalid()})
      const passwordHash=await bcrypt.hash(password,12)
      return run(async q=>{
        const {row,student}=await current(q,challengeId)
        if(!equal(row.grant_hash,digest('grant',challengeId,grant)))throw invalid()
        const accountId=await createActiveAccount(q,{
          school_id:student.school_id,email:student.school_email,first_name:student.first_name,last_name:student.last_name,
          program_strand:student.program,year_grade_level:student.year_level,requested_role:'Student',password_hash:passwordHash,
        },student.student_name)
        await linkSemesterMember(q,Number(row.semester_id),accountId,student.school_id,student.student_name)
        await q.execute("UPDATE registration_requests SET status='Completed',password_hash=NULL,code_hash=NULL,updated_at=NOW() WHERE school_id=? AND requested_role='Student' AND status IN ('PendingEmail','PendingApproval')",[student.school_id])
        await q.execute('DELETE FROM enrollment_signup_challenges WHERE challenge_id=?',[challengeId])
        return {status:'Active',schoolId:String(student.school_id)}
      })
    },
  }
}
export const rosterRegistration=createRosterRegistration()
