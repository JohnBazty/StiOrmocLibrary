import { randomUUID } from 'node:crypto'
import { db,type Pool,type PoolConnection,type RowDataPacket,type ResultSetHeader } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { centavos,paymentId,positiveId } from '../payments/payments.validation.ts'
import { normalizePaymentProof,paymentProofStorage,type ProofStorage } from './payment-proof.storage.ts'

export type AssuranceActor={accountId?:number;role?:string}
export type AssuranceAttempt={paymentId:string;accountId:number;userId:number;kind:string;targetId:number;state:string;channelCode:string;principalCentavos:number;feeCentavos:number;totalCentavos:number;providerPaymentId?:string;providerSessionId?:string;createdAt:string;confirmedAt?:string}
type Dependencies={attempt(actor:AssuranceActor,id:string,staff:boolean):Promise<AssuranceAttempt>;storage?:ProofStorage}
const publicColumns='proof_id,request_id,payment_id,external_reference,declared_amount,mime_type,byte_size,review_status,review_reason,version,created_at,reviewed_at'
const fail=(status:number,code:string,message:string)=>new HttpError(status,code,message)
const missing=()=>fail(404,'PAYMENT_PROOF_NOT_FOUND','The payment proof was not found.')
function reference(value:unknown){if(typeof value!=='string'||!/^[-a-z\d_:]{3,80}$/i.test(value.trim()))throw fail(422,'PAYMENT_PROOF_REFERENCE_INVALID','Enter the payment reference shown on the receipt.');return value.trim().toLowerCase()}
function reviewInput(body:Record<string,unknown>){
 const version=positiveId(body.version),status=body.status,reason=typeof body.reason==='string'?body.reason.trim():''
 if(!['Verified','Rejected'].includes(String(status))||reason.length<3||reason.length>1000)throw fail(422,'PAYMENT_PROOF_REVIEW_INVALID','Choose a review result and enter a short reason.')
 return{version,status:status as 'Verified'|'Rejected',reason}
}
function publicProof(row:RowDataPacket){const{storage_key:_,sha256:__,user_id:___,request_key:____,reviewed_by_user_id:_____,...safe}=row;return safe}
function pesos(amount:bigint){return `${amount/100n}.${String(amount%100n).padStart(2,'0')}`}
export function createPrintingPaymentAssurance(pool:Pool=db,deps:Dependencies){
 const storage=deps.storage??paymentProofStorage
 async function identity(q:Pick<PoolConnection,'execute'>,actor:AssuranceActor,staff:boolean){
  const[rows]=await q.execute<RowDataPacket[]>(`SELECT a.account_id,a.user_id,a.role,a.account_status,u.account_status user_status,u.full_name,u.school_id
   FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`,[positiveId(actor.accountId)])
  const row=rows[0],allowed=staff?['Librarian','Staff']:['Student','Faculty']
  if(!row||row.account_status!=='Active'||row.user_status!=='Active'||row.role!==actor.role||!allowed.includes(row.role))throw fail(403,'PAYMENT_PROOF_FORBIDDEN','Your account cannot perform this action.')
  return{accountId:Number(row.account_id),userId:Number(row.user_id),name:String(row.full_name),schoolId:String(row.school_id)}
 }
 function checkAttempt(attempt:AssuranceAttempt,owner:{accountId:number;userId:number},staff:boolean){
  if(attempt.kind!=='Printing'||attempt.channelCode!=='GCASH'||(!staff&&(attempt.accountId!==owner.accountId||attempt.userId!==owner.userId)))throw missing()
  return attempt
 }
 async function ownedAttempt(actor:AssuranceActor,id:unknown,staff:boolean){
  const owner=await identity(pool,actor,staff),attempt=await deps.attempt(actor,paymentId(id),staff)
  return{owner,attempt:checkAttempt(attempt,owner,staff)}
 }
 async function scopedProof(actor:AssuranceActor,id:unknown,staff:boolean){
  const owner=await identity(pool,actor,staff)
  const[rows]=await pool.execute<RowDataPacket[]>(`SELECT * FROM print_payment_proofs WHERE proof_id=?${staff?'':' AND user_id=?'}`,[paymentId(id),...staff?[]:[owner.userId]])
  if(!rows[0])throw missing()
  return{owner,proof:rows[0]}
 }
 return{
  async list(actor:AssuranceActor,id:unknown,staff=false){
   const{attempt}=await ownedAttempt(actor,id,staff)
   const[rows]=await pool.execute<RowDataPacket[]>(`SELECT ${publicColumns} FROM print_payment_proofs WHERE payment_id=? AND user_id=? ORDER BY created_at DESC,proof_id`,[attempt.paymentId,attempt.userId])
   return rows.map(publicProof)
  },
  async upload(actor:AssuranceActor,id:unknown,body:Record<string,unknown>,file?:Express.Multer.File){
   const{owner,attempt}=await ownedAttempt(actor,id,false)
   if(!['Active','Review','Succeeded'].includes(attempt.state))throw fail(409,'PAYMENT_PROOF_PAYMENT_UNAVAILABLE','Complete checkout before attaching payment proof.')
   const key=paymentId(body.request_key)
   const rawRef=typeof body.external_reference==='string'&&body.external_reference.trim()?body.external_reference:(attempt.providerPaymentId??attempt.paymentId)
   const rawAmount=body.declared_amount!==undefined&&String(body.declared_amount).trim()!==''?body.declared_amount:pesos(BigInt(attempt.totalCentavos))
   const external=reference(rawRef),amount=centavos(rawAmount)
   const image=await normalizePaymentProof(file),q=await pool.getConnection();let stored:string|undefined
   try{
    await q.beginTransaction()
    const[requests]=await q.execute<RowDataPacket[]>('SELECT request_id FROM print_requests WHERE request_id=? AND user_id=? FOR UPDATE',[attempt.targetId,owner.userId])
    if(!requests[0])throw missing()
    const[existing]=await q.execute<RowDataPacket[]>('SELECT * FROM print_payment_proofs WHERE user_id=? AND request_key=?',[owner.userId,key])
    if(existing[0]){
     const row=existing[0]
     if(row.payment_id!==attempt.paymentId||reference(row.external_reference)!==external||centavos(row.declared_amount)!==amount||row.sha256!==image.sha256)throw fail(409,'PAYMENT_PROOF_RETRY_CHANGED','This upload changed. Review the receipt and submit it again.')
     await q.commit();return publicProof(row)
    }
    const[active]=await q.execute<RowDataPacket[]>("SELECT proof_id FROM print_payment_proofs WHERE payment_id=? AND review_status<>'Rejected'",[attempt.paymentId])
    if(active.length)throw fail(409,'PAYMENT_PROOF_EXISTS','Payment proof is already attached. View its review status.')
    const proofId=randomUUID();stored=`payment-proofs/${proofId}.png`
    await storage.put(stored,image.contents)
    const[result]=await q.execute<ResultSetHeader>(`INSERT INTO print_payment_proofs(proof_id,request_id,user_id,payment_id,external_reference,declared_amount,storage_key,mime_type,byte_size,sha256,request_key)
     VALUES(?,?,?,?,?,?,?,'image/png',?,?,?) RETURNING ${publicColumns}`,[proofId,attempt.targetId,owner.userId,attempt.paymentId,external,pesos(amount),stored,image.contents.length,image.sha256,key])
    await q.execute(`INSERT INTO print_proof_events(proof_id,actor_account_id,event_type,details) VALUES(?,?,'Uploaded',?::jsonb)`,[proofId,owner.accountId,JSON.stringify({paymentId:attempt.paymentId,requestId:attempt.targetId})])
    await q.commit();stored=undefined;return publicProof(result.rows[0])
   }catch(error){
    await q.rollback();if(stored)await storage.remove(stored)
    if((error as {code?:string}).code==='23505')throw fail(409,'PAYMENT_PROOF_EXISTS','This payment proof was already recorded. Refresh its status.')
    throw error
   }finally{q.release()}
  },
  async image(actor:AssuranceActor,id:unknown,staff=false){const{proof}=await scopedProof(actor,id,staff);return storage.read(String(proof.storage_key))},
  async review(actor:AssuranceActor,id:unknown,body:Record<string,unknown>){
   const{owner,proof}=await scopedProof(actor,id,true),input=reviewInput(body)
   // Resolve private provider evidence before database locks, matching checkout's outer-lock order.
   const attempt=checkAttempt(await deps.attempt(actor,String(proof.payment_id),true),owner,true)
   const q=await pool.getConnection()
   try{
    await q.beginTransaction()
    const[rows]=await q.execute<RowDataPacket[]>('SELECT * FROM print_payment_proofs WHERE proof_id=? FOR UPDATE',[proof.proof_id]),row=rows[0]
    if(!row)throw missing()
    if(Number(row.version)!==input.version||row.review_status!=='Pending')throw fail(409,'PAYMENT_PROOF_CHANGED','The proof was already reviewed. Refresh its status.')
    if(input.status==='Verified'){
     if(attempt.state!=='Succeeded'||!attempt.providerPaymentId)throw fail(409,'PAYMENT_PROOF_NOT_CONFIRMED','Xendit has not confirmed this payment. Check its status first.')
     const refMatches=reference(row.external_reference)===reference(attempt.providerPaymentId)||reference(row.external_reference)===reference(attempt.paymentId)
     if(attempt.userId!==Number(row.user_id)||attempt.targetId!==Number(row.request_id)||centavos(row.declared_amount)!==BigInt(attempt.totalCentavos)||!refMatches)throw fail(409,'PAYMENT_PROOF_MISMATCH','The receipt amount or reference does not match the confirmed payment.')
    }
    const[updated]=await q.execute<ResultSetHeader>(`UPDATE print_payment_proofs SET review_status=?,review_reason=?,reviewed_by_user_id=?,reviewed_at=NOW(),version=version+1 WHERE proof_id=? RETURNING ${publicColumns}`,[input.status,input.reason,owner.userId,row.proof_id])
    await q.execute('INSERT INTO print_proof_events(proof_id,actor_account_id,event_type,details) VALUES(?,?,?,?::jsonb)',[row.proof_id,owner.accountId,input.status,JSON.stringify({reason:input.reason,previousVersion:input.version,providerConfirmed:input.status==='Verified'})])
    await q.commit();return publicProof(updated.rows[0])
   }catch(error){await q.rollback();if((error as {code?:string}).code==='23505')throw fail(409,'PAYMENT_PROOF_REFERENCE_USED','This receipt reference has already been verified.');throw error}finally{q.release()}
  },
  async paymentRecord(actor:AssuranceActor,id:unknown,staff=false){
   const{attempt}=await ownedAttempt(actor,id,staff)
   if(attempt.state!=='Succeeded'||!attempt.providerPaymentId)throw fail(409,'PAYMENT_RECORD_UNAVAILABLE','A payment record is available after Xendit confirms payment.')
   const[users]=await pool.execute<RowDataPacket[]>('SELECT full_name,school_id FROM users WHERE user_id=?',[attempt.userId])
   if(!users[0])throw missing()
   return{...attempt,payerName:String(users[0].full_name),schoolId:String(users[0].school_id)}
  },
 }
}
