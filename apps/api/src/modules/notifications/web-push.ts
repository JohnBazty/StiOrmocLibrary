import {createPrivateKey,sign} from 'node:crypto'
import {request} from 'node:https'
import type {Pool,RowDataPacket} from '../../config/db.js'
import {db} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'

export function validPushEndpoint(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2048)return false
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(
  ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)
  ||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))}catch{return false}
}
export function vapidHeaders(endpoint:string,privateJwk:string,publicKey:string,subject:string,now=new Date()) {
 const encode=(o:unknown)=>Buffer.from(JSON.stringify(o)).toString('base64url')
 const unsigned=`${encode({typ:'JWT',alg:'ES256'})}.${encode({aud:new URL(endpoint).origin,exp:Math.floor(now.getTime()/1000)+43200,sub:subject})}`
 const signature=sign('sha256',Buffer.from(unsigned),{key:createPrivateKey({key:JSON.parse(privateJwk),format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url')
 return {Authorization:`vapid t=${unsigned}.${signature}, k=${publicKey}`,TTL:'300','Content-Length':'0'}
}
export function pushConfiguration(){return {publicKey:process.env.WEB_PUSH_PUBLIC_KEY??'',privateKey:process.env.WEB_PUSH_PRIVATE_JWK??'',subject:process.env.WEB_PUSH_SUBJECT??'https://sti-ormoc-smart-library.vercel.app'}}
/** Empty Web Push payload deliberately keeps names, titles and balances off lock screens. No redirects. */
export async function sendPush(endpoint:string):Promise<number>{
 if(!validPushEndpoint(endpoint))return 410
 const config=pushConfiguration()
 return new Promise((resolve,reject)=>{const req=request(endpoint,{method:'POST',headers:vapidHeaders(endpoint,config.privateKey,config.publicKey,config.subject)},res=>{res.resume();resolve(res.statusCode??503)});req.setTimeout(4000,()=>req.destroy(new Error('Push service timed out')));req.on('error',()=>reject(new Error('Push service unavailable')));req.end()})
}
export function createWebPush(database:Pool=db,send=sendPush){
 const owner=async(accountId:number)=>{const [rows]=await database.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=? AND account_status=\'Active\' AND user_id IS NOT NULL',[accountId]);if(!rows[0])throw new HttpError(403,'PUSH_ACCOUNT_UNAVAILABLE','Sign in with an active library account.');return rows[0]}
 return {
  async status(accountId:number,input:Record<string,unknown>){const [rows]=await database.execute<RowDataPacket[]>('SELECT device_id FROM web_push_devices WHERE account_id=? AND endpoint=? AND active',[accountId,typeof input.endpoint==='string'?input.endpoint.slice(0,2048):'']);return {enabled:rows.length>0}},
  async subscribe(accountId:number,input:Record<string,unknown>){
   await owner(accountId)
   if(!pushConfiguration().publicKey||!pushConfiguration().privateKey)throw new HttpError(503,'PUSH_UNAVAILABLE','Device notifications are not configured yet.')
   if(!validPushEndpoint(input.endpoint))throw new HttpError(422,'PUSH_ENDPOINT_INVALID','This browser notification service is not supported.')
   await database.execute(`INSERT INTO web_push_devices(account_id,endpoint) VALUES (?,?) ON CONFLICT(endpoint) DO UPDATE SET account_id=EXCLUDED.account_id,active=TRUE,created_at=CASE WHEN web_push_devices.account_id<>EXCLUDED.account_id OR NOT web_push_devices.active THEN NOW() ELSE web_push_devices.created_at END,updated_at=NOW()`,[accountId,input.endpoint]);return {enabled:true}
  },
  async unsubscribe(accountId:number,input:Record<string,unknown>){if(typeof input.endpoint!=='string')throw new HttpError(422,'PUSH_ENDPOINT_INVALID','Choose this device to disable notifications.');await database.execute('UPDATE web_push_devices SET active=FALSE,updated_at=NOW() WHERE account_id=? AND endpoint=?',[accountId,input.endpoint]);return {enabled:false}},
  async deliver(now=new Date()){
   if(!pushConfiguration().privateKey||!pushConfiguration().publicKey)return {accepted:0,retired:0,failed:0,configured:false}
   // The existing recipient notification is the audience authority. Only post-opt-in announcements qualify.
   await database.execute(`INSERT INTO web_push_deliveries(device_id,announcement_id,revision_number,next_attempt_at)
    SELECT DISTINCT s.device_id,a.announcement_id,r.revision_number,?::timestamptz FROM web_push_devices s
    JOIN accounts ac ON ac.account_id=s.account_id AND ac.account_status='Active'
    JOIN users u ON u.user_id=ac.user_id AND u.account_status='Active'
    JOIN notifications n ON n.user_id=u.user_id AND n.source_type='Announcement' AND n.deleted_at IS NULL
    JOIN announcements a ON a.announcement_id=n.source_id AND a.announcement_status='Published' AND a.archived_at IS NULL
    JOIN LATERAL (SELECT MAX(revision_number) revision_number FROM announcement_revisions WHERE announcement_id=a.announcement_id) r ON r.revision_number IS NOT NULL
    WHERE s.active AND a.published_at>=s.created_at AND (a.expires_at IS NULL OR a.expires_at>?)
    AND (n.expires_at IS NULL OR n.expires_at>?) ON CONFLICT DO NOTHING`,[now,now,now])
   const q=await database.getConnection();let accepted=0,retired=0,failed=0,rows:RowDataPacket[]=[]
   try{await q.beginTransaction();const [claimed]=await q.execute<RowDataPacket[]>(`SELECT d.delivery_id,s.device_id,s.endpoint FROM web_push_deliveries d
    JOIN web_push_devices s ON s.device_id=d.device_id AND s.active
    JOIN accounts ac ON ac.account_id=s.account_id AND ac.account_status='Active'
    JOIN users u ON u.user_id=ac.user_id AND u.account_status='Active'
    JOIN announcements a ON a.announcement_id=d.announcement_id AND a.announcement_status='Published' AND a.archived_at IS NULL
    WHERE d.state='Pending' AND d.next_attempt_at<=? AND (a.expires_at IS NULL OR a.expires_at>?) AND a.published_at>=s.created_at
    AND EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=u.user_id AND n.source_type='Announcement' AND n.source_id=a.announcement_id AND n.deleted_at IS NULL AND (n.expires_at IS NULL OR n.expires_at>?))
    ORDER BY d.next_attempt_at,d.delivery_id LIMIT 5 FOR UPDATE OF d,s SKIP LOCKED`,[now,now,now])
    rows=claimed
    for(const row of rows){await q.execute(`UPDATE web_push_deliveries SET next_attempt_at=?::timestamptz+INTERVAL '2 minutes' WHERE delivery_id=?`,[now,row.delivery_id])}
    await q.commit()
   }catch(e){await q.rollback();throw e}finally{q.release()}
   for(const row of rows){let code=503;try{code=await send(String(row.endpoint))}catch{/* A failed transport is retried without storing provider errors or endpoints in logs. */}
    const state=code>=200&&code<300?'Accepted':[404,410].includes(code)?'Retired':'Pending'
    if(state==='Retired'){await database.execute('UPDATE web_push_devices SET active=FALSE,updated_at=NOW() WHERE device_id=?',[row.device_id]);retired++}else if(state==='Accepted')accepted++;else failed++
    await database.execute(`UPDATE web_push_deliveries SET attempts=attempts+1,state=CASE WHEN ?='Pending' AND attempts>=4 THEN 'Failed' ELSE ? END,accepted_at=CASE WHEN ?='Accepted' THEN ?::timestamptz ELSE NULL END,next_attempt_at=?::timestamptz+INTERVAL '5 minutes'*power(2,LEAST(attempts,5)) WHERE delivery_id=?`,[state,state,state,now,now,row.delivery_id])
   }
   return {accepted,retired,failed,configured:true}
  },
 }
}
