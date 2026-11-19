import {randomUUID} from 'node:crypto'
import bcrypt from 'bcrypt'
import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from '../../config/db.js'
import {db} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import {requireLibraryActor} from '../../core/library-permissions.ts'
import {assertNewPassword} from '../auth/password-recovery.service.ts'
import {createActiveAccount} from '../auth/registration.service.ts'
import {sendSchoolEmail} from '../auth/school-email.sender.ts'
import {normalizeOwnerEmail,ownershipToken,ownershipDigest,matchesOwnershipToken,ownershipSetupUrl} from './ownership-transfer.policy.ts'

const object=(value:unknown)=>value&&typeof value==='object'?value as Record<string,unknown>:{}
const invalid=()=>new HttpError(422,'OWNERSHIP_INVITATION_INVALID','This invitation is invalid, expired, replaced or already used. Ask the current administrator for a new invitation.')
const changed=()=>new HttpError(409,'OWNERSHIP_CHANGED','Ownership or account details changed. Review the recipient again.')
function version(value:unknown){const n=Number(value);if(typeof value!=='number'||!Number.isSafeInteger(n)||n<1)throw changed();return n}
function grant(body:unknown){const b=object(body),id=String(b.invitation_id??''),token=String(b.setup_token??'');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||!/^[a-f0-9]{64}$/.test(token))throw invalid();return {id,token}}

export function createOwnershipTransfer(database:Pool=db,hasher=bcrypt,clock=()=>new Date(),send=sendSchoolEmail){
 async function tx<T>(work:(q:PoolConnection)=>Promise<T>){const q=await database.getConnection();try{await q.beginTransaction();const value=await work(q);await q.commit();return value}catch(e){await q.rollback();throw e}finally{q.release()}}
 async function designation(q:PoolConnection){const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM library_ownership WHERE singleton=TRUE FOR UPDATE');if(!rows[0])throw new HttpError(503,'OWNERSHIP_NOT_READY','Administrator ownership is not ready.');return rows[0]}
 async function account(q:PoolConnection,id:number){const [rows]=await q.execute<RowDataPacket[]>(`SELECT a.*,u.email,u.full_name,u.account_status AS user_status,u.user_role FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a,u`,[id]);return rows[0]}
 async function owner(q:PoolConnection,actor:number){
  await requireLibraryActor(q,actor,'library.manage')
  const o=await designation(q)
  if(Number(o.owner_account_id)!==actor)throw new HttpError(403,'OWNER_REQUIRED','Only the current administrator owner can transfer ownership.')
  const a=await account(q,actor)
  if(!a||a.role!=='Librarian'||a.account_status!=='Active'||a.user_status!=='Active')throw changed()
  return {o,a}
 }
 async function recipient(q:PoolConnection,email:string){
  const [rows]=await q.execute<RowDataPacket[]>('SELECT a.account_id FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id WHERE LOWER(u.email)=? LIMIT 2',[email])
  if(rows.length>1||(rows[0]&&!rows[0].account_id))throw new HttpError(409,'OWNER_RECIPIENT_CONFLICT','This email needs its existing library identity reviewed before ownership can be transferred.')
  if(!rows.length)return null
  const a=await account(q,Number(rows[0].account_id))
  if(!a||a.account_status!=='Active'||a.user_status!=='Active'||String(a.email).toLowerCase()!==email||!['Student','Faculty','Staff','Librarian','Admin'].includes(a.role))throw new HttpError(422,'OWNER_RECIPIENT_INACTIVE','Choose an active account, or a new Ormoc school email.')
  return a
 }
 async function event(q:PoolConnection,kind:string,actor:number,id:string|null,previous:number|null,next:number|null){await q.execute('INSERT INTO ownership_transfer_events(invitation_id,event_type,actor_account_id,previous_owner_id,new_owner_id)VALUES(?,?,?,?,?)',[id,kind,actor,previous,next])}
 async function cancelPending(q:PoolConnection,actor:number){
  const [rows]=await q.execute<ResultSetHeader>("UPDATE ownership_transfer_invitations SET status='Cancelled',mail_status=CASE WHEN mail_status='Pending' THEN 'Skipped' ELSE mail_status END,lease_token=NULL,lease_until=NULL WHERE status='Pending' RETURNING invitation_id",[])
  for(const row of rows.rows)await event(q,'Cancelled',actor,row.invitation_id,actor,null)
  return rows.affectedRows
 }
 async function load(q:PoolConnection,id:string,token:string){
  const o=await designation(q)
  const [rows]=await q.execute<RowDataPacket[]>('SELECT * FROM ownership_transfer_invitations WHERE invitation_id=? FOR UPDATE',[id])
  const invitation=rows[0]
  if(!invitation||invitation.status!=='Pending'||new Date(invitation.expires_at)<=clock()||!matchesOwnershipToken(invitation.token_hash,id,token)||Number(o.owner_account_id)!==Number(invitation.owner_account_id)||Number(o.row_version)!==Number(invitation.ownership_version))throw invalid()
  const a=await account(q,Number(o.owner_account_id))
  if(!a||a.role!=='Librarian'||a.account_status!=='Active'||a.user_status!=='Active'||Number(a.auth_version)!==Number(invitation.owner_auth_version))throw invalid()
  let target:RowDataPacket|null
  try{target=await recipient(q,normalizeOwnerEmail(invitation.recipient_email))}catch{throw invalid()}
  if((target?Number(target.account_id):null)!==(invitation.target_account_id==null?null:Number(invitation.target_account_id))||(target?Number(target.auth_version):null)!==(invitation.target_auth_version==null?null:Number(invitation.target_auth_version))||(target?.role??null)!==invitation.target_role)throw invalid()
  return {o,a,invitation,target}
 }
 async function revoke(q:PoolConnection,id:number,userId:number){
  await q.execute('UPDATE library_login_sessions SET revoked_at=NOW() WHERE account_id=? AND revoked_at IS NULL',[id])
  await q.execute('UPDATE login_otp_challenges SET consumed_at=NOW(),code_hash=NULL WHERE account_id=? AND consumed_at IS NULL',[id])
  await q.execute('DELETE FROM login_device_switches WHERE account_id=?',[id])
  await q.execute('UPDATE account_recovery_challenges SET code_hash=NULL,reset_token_hash=NULL,reset_expires_at=NULL WHERE account_id=?',[id])
  await q.execute(`DELETE FROM auth_sessions WHERE session_data::json->'user'->>'id'=?`,[String(userId)])
 }
 return {
  async state(actor:number){return tx(async q=>{
   await requireLibraryActor(q,actor,'library.manage')
   const o=await designation(q)
   if(Number(o.owner_account_id)!==actor)return {canTransfer:false,version:Number(o.row_version),pending:null}
   const [rows]=await q.execute<RowDataPacket[]>("SELECT invitation_id,recipient_email,expires_at,mail_status FROM ownership_transfer_invitations WHERE status='Pending' AND expires_at>? LIMIT 1",[clock()])
   return {canTransfer:true,version:Number(o.row_version),pending:rows[0]?{id:rows[0].invitation_id,email:rows[0].recipient_email,expiresAt:rows[0].expires_at,mailStatus:rows[0].mail_status}:null}
  })},
  async preview(actor:number,body:unknown){const input=object(body),email=normalizeOwnerEmail(input.email);return tx(async q=>{
   const {o,a}=await owner(q,actor),target=await recipient(q,email)
   if(email===String(a.email).toLowerCase()||Number(target?.account_id)===actor)throw new HttpError(422,'OWNER_SELF_TRANSFER','Choose another person’s Ormoc school email.')
   return {email,version:Number(o.row_version),targetVersion:target?Number(target.auth_version):null,targetRole:target?.role??null,name:target?.full_name??null,createsAccount:!target}
  })},
  async invite(actor:number,body:unknown){
   const input=object(body),email=normalizeOwnerEmail(input.email),expected=version(input.version)
   const password=typeof input.current_password==='string'?input.current_password:''
   if(!password||Buffer.byteLength(password)>72)throw new HttpError(422,'OWNER_PASSWORD_REQUIRED','Enter your current administrator password.')
   ownershipSetupUrl(randomUUID(),'0'.repeat(64))
   const result=await tx(async q=>{
    const {o,a}=await owner(q,actor),now=clock()
    if(Number(o.row_version)!==expected)throw changed()
    if(o.reauth_locked_until&&new Date(o.reauth_locked_until)>now)return {error:new HttpError(429,'OWNER_REAUTH_PAUSED','Wait 15 minutes before confirming another ownership invitation. Normal login remains available.')}
    if(!await hasher.compare(password,a.password_hash)){
     const attempts=o.reauth_locked_until?1:Number(o.failed_reauth)+1
     await q.execute('UPDATE library_ownership SET failed_reauth=?,reauth_locked_until=? WHERE singleton=TRUE',[attempts,attempts>=5?new Date(+now+15*60_000):null])
     return {error:new HttpError(attempts>=5?429:422,attempts>=5?'OWNER_REAUTH_PAUSED':'OWNER_PASSWORD_INCORRECT',attempts>=5?'Wait 15 minutes before confirming another ownership invitation.':'Your administrator password is incorrect.')}
    }
    const target=await recipient(q,email)
    if(email===String(a.email).toLowerCase()||Number(target?.account_id)===actor)throw new HttpError(422,'OWNER_SELF_TRANSFER','Choose another person’s Ormoc school email.')
    if(input.targetVersion!==(target?Number(target.auth_version):null)||input.targetRole!==(target?.role??null))throw changed()
    if(o.last_invited_at&&new Date(o.last_invited_at).getTime()+60_000>+now)throw new HttpError(429,'OWNER_INVITE_WAIT','Wait one minute before sending another invitation.')
    await cancelPending(q,actor)
    const id=randomUUID(),token=ownershipToken(id,Number(a.auth_version)),next=Number(o.row_version)+1,expires=new Date(+now+24*60*60_000)
    await q.execute(`INSERT INTO ownership_transfer_invitations(invitation_id,owner_account_id,owner_auth_version,ownership_version,recipient_email,target_account_id,target_auth_version,target_role,token_hash,expires_at)VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,actor,a.auth_version,next,email,target?.account_id??null,target?.auth_version??null,target?.role??null,ownershipDigest(id,token),expires])
    await q.execute('UPDATE library_ownership SET row_version=?,failed_reauth=0,reauth_locked_until=NULL,last_invited_at=?,updated_at=NOW() WHERE singleton=TRUE',[next,now])
    await event(q,'Invited',actor,id,actor,target?.account_id??null)
    return {data:{version:next,message:'Invitation queued for the recipient’s Outlook mailbox. You keep ownership until they finish setup.'}}
   })
   if(result.error)throw result.error
   return result.data!
  },
  async cancel(actor:number,body:unknown){const expected=version(object(body).version);return tx(async q=>{const {o}=await owner(q,actor);if(Number(o.row_version)!==expected)throw changed();if(!await cancelPending(q,actor))throw changed();await q.execute('UPDATE library_ownership SET row_version=row_version+1,updated_at=NOW() WHERE singleton=TRUE');return {message:'Invitation cancelled. You remain the administrator owner.'}})},
  async setupPreview(body:unknown){const {id,token}=grant(body);return tx(async q=>{const {invitation,target}=await load(q,id,token);return {email:invitation.recipient_email,name:target?.full_name??null,requiresName:!target,previousRole:target?.role??null}})},
  async complete(body:unknown){
   const input=object(body),{id,token}=grant(body)
   assertNewPassword(input.password,input.confirm_password)
   const snapshot=await tx(q=>load(q,id,token))
   const name=typeof input.full_name==='string'?input.full_name.trim().replace(/\s+/g,' '):''
   if(!snapshot.target&&(!name||name.length>150||/[\x00-\x1f\x7f]/.test(name)))throw new HttpError(422,'OWNER_NAME_INVALID','Enter your name, up to 150 characters.')
   if(snapshot.target&&await hasher.compare(input.password,snapshot.target.password_hash))throw new HttpError(422,'PASSWORD_UNCHANGED','Choose a new administrator password different from your current password.')
   const hash=await hasher.hash(input.password,12)
   return tx(async q=>{
    const {o,a,invitation,target}=await load(q,id,token)
    let next:number,userId:number
    if(target){
     next=Number(target.account_id);userId=Number(target.user_id)
     await q.execute("UPDATE accounts SET role='Librarian',password_hash=?,must_change_password=FALSE,auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?",[hash,next])
     await q.execute("UPDATE users SET user_role='Librarian',role_id=(SELECT role_id FROM roles WHERE role_name='Librarian' LIMIT 1),password_hash=?,auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?",[hash,userId])
    }else{
     const words=name.split(' ')
     next=await createActiveAccount(q,{school_id:`OWNER-${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`,email:invitation.recipient_email,first_name:words[0],last_name:words.slice(1).join(' '),program_strand:null,year_grade_level:null,requested_role:'Librarian',password_hash:hash},name)
     const created=await account(q,next);userId=Number(created!.user_id)
    }
    // Switch the designation first. Database guards then permit retirement of the outgoing identity.
    await q.execute('UPDATE library_ownership SET owner_account_id=?,row_version=row_version+1,failed_reauth=0,reauth_locked_until=NULL,updated_at=NOW() WHERE singleton=TRUE',[next])
    await q.execute("UPDATE accounts SET account_status='Deactivated',auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?",[a.account_id])
    await q.execute("UPDATE users SET account_status='Deactivated',auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?",[a.user_id])
    await revoke(q,Number(a.account_id),Number(a.user_id));await revoke(q,next,userId)
    await q.execute("UPDATE ownership_transfer_invitations SET status='Accepted',accepted_at=?,accepted_account_id=?,lease_token=NULL,lease_until=NULL,mail_status=CASE WHEN mail_status='Pending' THEN 'Skipped' ELSE mail_status END WHERE invitation_id=?",[clock(),next,id])
    await event(q,'Accepted',next,id,Number(o.owner_account_id),next)
    await q.execute("INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,reason)VALUES(?,?,'Deactivated','Active','Deactivated','Administrator ownership transferred after verified email setup.')",[a.account_id,next])
    await q.execute("INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,changed_fields,reason)VALUES(?,?,'ProfileUpdated','Active','Active','role,password','Accepted administrator ownership through the dedicated email invitation.')",[next,next])
    return {message:'Administrator account ready. The previous administrator no longer has admin or Staff access. Sign in with your Ormoc email and new password.'}
   })
  },
  async deliver(){
   const lease=randomUUID(),now=clock()
   const claimed=await tx(async q=>{
    const [rows]=await q.execute<RowDataPacket[]>("SELECT invitation_id,owner_auth_version FROM ownership_transfer_invitations WHERE status='Pending' AND mail_status='Pending' AND mail_attempts<3 AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?) LIMIT 1 FOR UPDATE SKIP LOCKED",[now,now])
    for(const row of rows)await q.execute('UPDATE ownership_transfer_invitations SET mail_attempts=mail_attempts+1,lease_token=?,lease_until=? WHERE invitation_id=?',[lease,new Date(+now+90_000),row.invitation_id])
    return rows
   })
   let sent=0,skipped=0,failed=0
   for(const row of claimed){
    const token=ownershipToken(row.invitation_id,Number(row.owner_auth_version))
    try{
     const {invitation}=await tx(q=>load(q,row.invitation_id,token))
     await send(invitation.recipient_email,'Library administrator ownership invitation',`You have been invited to become the library administrator. Open this link to review and create your password:\n${ownershipSetupUrl(row.invitation_id,token)}\n\nThe link expires in 24 hours and works once. Ownership changes only when you finish setup. The previous administrator then loses admin and Staff access. If this was unexpected, ignore it and contact the library. Never share this link.`)
     await database.execute("UPDATE ownership_transfer_invitations SET mail_status='Sent',lease_token=NULL,lease_until=NULL WHERE invitation_id=? AND lease_token=? AND status='Pending'",[row.invitation_id,lease]);sent++
    }catch(error){
     if(error instanceof HttpError&&error.code==='OWNERSHIP_INVITATION_INVALID'){
      await database.execute("UPDATE ownership_transfer_invitations SET mail_status='Skipped',lease_token=NULL,lease_until=NULL WHERE invitation_id=? AND lease_token=?",[row.invitation_id,lease]);skipped++
     }else{
      await database.execute("UPDATE ownership_transfer_invitations SET mail_status=CASE WHEN mail_attempts>=3 THEN 'Failed' ELSE 'Pending' END,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE invitation_id=? AND lease_token=?",[new Date(+clock()+60_000),row.invitation_id,lease]);failed++
     }
    }
   }
   return {sent,skipped,failed}
  }
 }
}
export const ownershipTransfer=createOwnershipTransfer()
