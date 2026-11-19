import { randomUUID } from 'node:crypto'
import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { isInstitutionalEmail } from './auth.validation.js'
import { sendSchoolEmail } from './school-email.sender.ts'
import { recoveryDigest } from './password-recovery.service.ts'
import { passwordResetUrl, resetLinkLifetime, resetLinkToken, resetRecipientHash } from './password-reset-links.policy.ts'

const message='If an active account matches, a password-reset link will be sent to its saved school email. Check your inbox and junk folder. The link expires in 15 minutes. If it does not arrive, wait one minute and try again or contact the library.'
export function createPasswordResetLinks(database:Pool=db,send=sendSchoolEmail,clock=()=>new Date(),origin?:string) {
 async function transaction<T>(work:(q:PoolConnection)=>Promise<T>){const q=await database.getConnection();try{await q.beginTransaction();const value=await work(q);await q.commit();return value}catch(e){await q.rollback();throw e}finally{q.release()}}
 return {
  async request(body:unknown){
   const input=body&&typeof body==='object'?body as Record<string,unknown>:{}
   const identifier=typeof input.identifier==='string'?input.identifier.trim():''
   if(!identifier||identifier.length>254)throw new HttpError(422,'AUTH_VALIDATION_FAILED','Enter your School ID or registered school email.')
   // Validate server configuration without depending on account existence or a request Host header.
   passwordResetUrl(randomUUID(),'0'.repeat(64),origin)
   await transaction(async q=>{
    const [accounts]=await q.execute<RowDataPacket[]>(`SELECT a.account_id,a.auth_version,u.email FROM accounts a JOIN users u ON u.user_id=a.user_id
      WHERE (UPPER(a.school_id)=? OR LOWER(u.email)=?) AND a.role IN ('Student','Faculty','Staff','Librarian','Admin')
      AND a.account_status='Active' AND u.account_status='Active' FOR UPDATE OF a,u`,[identifier.toUpperCase(),identifier.toLowerCase()])
    const account=accounts[0]
    if(!account||!isInstitutionalEmail(account.email))return
    const now=clock()
    const [previous]=await q.execute<RowDataPacket[]>('SELECT * FROM account_recovery_challenges WHERE account_id=? FOR UPDATE',[account.account_id])
    if(previous[0]&&(new Date(previous[0].code_sent_at).getTime()+60_000>+now||new Date(previous[0].locked_until).getTime()>+now))return
    const id=randomUUID(),token=resetLinkToken(id,Number(account.auth_version)),expires=new Date(+now+resetLinkLifetime)
    await q.execute(`INSERT INTO account_recovery_challenges(account_id,public_id,account_version,code_hash,code_expires_at,code_sent_at,code_attempts,reset_token_hash,reset_expires_at)
      VALUES(?,?,?,NULL,?,?,0,?,?) ON CONFLICT(account_id) DO UPDATE SET public_id=EXCLUDED.public_id,account_version=EXCLUDED.account_version,
      code_hash=NULL,code_expires_at=EXCLUDED.code_expires_at,code_sent_at=EXCLUDED.code_sent_at,reset_token_hash=EXCLUDED.reset_token_hash,
      reset_expires_at=EXCLUDED.reset_expires_at,code_attempts=CASE WHEN account_recovery_challenges.locked_until<=EXCLUDED.code_sent_at THEN 0 ELSE account_recovery_challenges.code_attempts END,
      locked_until=NULL,updated_at=NOW()`,[account.account_id,id,account.auth_version,expires,now,recoveryDigest(id,token),expires])
    await q.execute('INSERT INTO password_reset_link_deliveries(public_id,account_id,account_version,recipient_hash)VALUES(?,?,?,?)',[id,account.account_id,account.auth_version,resetRecipientHash(id,account.email)])
   })
   return {message}
  },
  async deliver(){
   const now=clock(),lease=randomUUID()
   const rows=await transaction(async q=>{
    const [pending]=await q.execute<RowDataPacket[]>(`SELECT public_id FROM password_reset_link_deliveries WHERE status='Pending' AND attempts<3 AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY created_at LIMIT 3 FOR UPDATE SKIP LOCKED`,[now,now])
    for(const row of pending)await q.execute('UPDATE password_reset_link_deliveries SET attempts=attempts+1,lease_token=?,lease_until=? WHERE public_id=?',[lease,new Date(+now+90_000),row.public_id])
    return pending
   })
   let sent=0,failed=0,skipped=0
   await Promise.all(rows.map(async row=>{
    const [records]=await database.execute<RowDataPacket[]>(`SELECT a.auth_version,u.email,c.reset_token_hash,c.reset_expires_at,d.recipient_hash,d.account_version
      FROM password_reset_link_deliveries d JOIN accounts a ON a.account_id=d.account_id JOIN users u ON u.user_id=a.user_id
      JOIN account_recovery_challenges c ON c.account_id=a.account_id AND c.public_id=d.public_id
      WHERE d.public_id=? AND d.lease_token=? AND d.status='Pending' AND a.account_status='Active' AND u.account_status='Active'
      AND a.role IN ('Student','Faculty','Staff','Librarian','Admin') AND c.account_version=a.auth_version`,[row.public_id,lease])
    const current=records[0]
    const token=current?resetLinkToken(row.public_id,Number(current.auth_version)):''
    if(!current||!isInstitutionalEmail(current.email)||Number(current.account_version)!==Number(current.auth_version)||new Date(current.reset_expires_at)<=clock()||current.recipient_hash!==resetRecipientHash(row.public_id,current.email)||current.reset_token_hash!==recoveryDigest(row.public_id,token)){
     await database.execute("UPDATE password_reset_link_deliveries SET status='Skipped',lease_until=NULL,lease_token=NULL WHERE public_id=? AND lease_token=?",[row.public_id,lease]);skipped++;return
    }
    try{
     await send(current.email,'Library password reset',`Open this link to create a new library password:\n${passwordResetUrl(row.public_id,token,origin)}\n\nThis link expires 15 minutes after your request and works once. If you did not request this, ignore this email. Your password has not changed. Never share this link.`)
     await database.execute("UPDATE password_reset_link_deliveries SET status='Sent',sent_at=?,lease_until=NULL,lease_token=NULL WHERE public_id=? AND lease_token=?",[clock(),row.public_id,lease]);sent++
    }catch{
     await database.execute("UPDATE password_reset_link_deliveries SET status=CASE WHEN attempts>=3 THEN 'Failed' ELSE 'Pending' END,next_attempt_at=?,lease_until=NULL,lease_token=NULL WHERE public_id=? AND lease_token=?",[new Date(+clock()+60_000),row.public_id,lease]);failed++
    }
   }))
   return {sent,failed,skipped}
  }
 }
}
export const passwordResetLinks=createPasswordResetLinks()
