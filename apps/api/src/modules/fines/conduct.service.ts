import { createHash } from 'node:crypto'
import { db, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { conductAction } from './conduct-policy.ts'
import { refreshClearance, type FineActor } from './fines.service.ts'

export const conductCategories = ['Noise', 'Eating or food', 'Other conduct'] as const
function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpError(422,'CONDUCT_INPUT',`Enter ${label} (${min}–${max} characters).`)
  return value.trim()
}
function manager(actor: FineActor) {
  if (!['Librarian','Admin'].includes(String(actor.role))) throw new HttpError(403,'CONDUCT_PERMISSION','Only the librarian can record or review violations.')
}
function account(actor: FineActor) {
  if (!Number.isSafeInteger(actor.accountId) || Number(actor.accountId)<1) throw new HttpError(401,'CONDUCT_LOGIN','Sign in again.')
  return actor.accountId!
}
export function conductInput(body: unknown) {
  if(!body || typeof body!=='object' || Array.isArray(body))throw new HttpError(422,'CONDUCT_INPUT','Enter the incident details before reviewing.')
  const b = body as Record<string,unknown>
  const category = text(b.category,'a violation category',2,80)
  if (!(conductCategories as readonly string[]).includes(category)) throw new HttpError(422,'CONDUCT_CATEGORY','Choose a listed violation category.')
  const incidentAt = new Date(String(b.incidentAt ?? ''))
  if (!Number.isFinite(incidentAt.getTime()) || incidentAt.getTime()>Date.now()+60_000) throw new HttpError(422,'CONDUCT_DATE','Enter a valid incident date and time, no later than now.')
  const priorWarnings = b.priorWarnings === undefined ? null : Number(b.priorWarnings)
  if (priorWarnings!==null && (!Number.isInteger(priorWarnings)||priorWarnings<0||priorWarnings>3)) throw new HttpError(422,'CONDUCT_REVIEW','Prior warnings must be between zero and three.')
  const amount = b.amount===undefined || b.amount==='' ? null : Number(b.amount)
  if (amount!==null && (!Number.isFinite(amount)||amount<=0||amount>999999.99||Math.abs(amount*100-Math.round(amount*100))>0.000001)) throw new HttpError(422,'CONDUCT_AMOUNT','Enter a positive fine amount with at most two decimal places.')
  return {schoolId:text(b.schoolId,'the school ID',3,50),category,incidentAt:incidentAt.toISOString(),location:typeof b.location==='string'?text(b.location||'Library','the location',1,150):'Library',details:text(b.details,'what happened',10,1000),priorWarnings,reviewReason:typeof b.reviewReason==='string'?b.reviewReason.trim():'',amount}
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
type Executor = Pool | PoolConnection
export function createConductService(database: Pool = db) {
  async function prepare(ex: Executor, input: ReturnType<typeof conductInput>, lock=false) {
    const [users]=await ex.execute<RowDataPacket[]>(`SELECT user_id,full_name,school_id,user_role FROM users WHERE school_id=? AND user_role IN ('Student','Faculty') AND account_status='Active' ${lock?'FOR UPDATE':''}`,[input.schoolId])
    const user=users[0]
    if (!user) throw new HttpError(404,'CONDUCT_PERSON','No active student or faculty account matches that school ID.')
    const [reviews]=await ex.execute<RowDataPacket[]>('SELECT prior_warnings FROM conduct_students WHERE user_id=? AND category=?',[user.user_id,input.category])
    const [counts]=await ex.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM conduct_incidents WHERE user_id=? AND category=? AND voided_at IS NULL',[user.user_id,input.category])
    const needsReview=user.user_role==='Student'&&!reviews[0]
    if (needsReview && (input.priorWarnings===null || input.reviewReason.length<10 || input.reviewReason.length>1000)) throw new HttpError(422,'CONDUCT_FIRST_REVIEW','Review the student’s lifetime warning history for this category. Confirm a new entrant with no prior warnings, or enter the warnings already used, with a reason.')
    const count=Number(counts[0].count)+(user.user_role==='Student'?Number(reviews[0]?.prior_warnings??input.priorWarnings):3)
    const action=conductAction(count)
    if (action==='Eligible for fine review' && input.amount===null) throw new HttpError(422,'CONDUCT_FINE_REQUIRED','Three warnings have been used, or this person is faculty. Enter the normal librarian-assessed fine amount.')
    const snapshot={userId:Number(user.user_id),role:String(user.user_role),name:String(user.full_name),schoolId:String(user.school_id),category:input.category,previousCount:count,action,amount:action==='Eligible for fine review'?input.amount:null,needsReview}
    return {...snapshot,reviewToken:hash({input,snapshot})}
  }
  return {
    async preview(actor: FineActor, body: unknown) {manager(actor);account(actor);return prepare(database,conductInput(body))},
    async record(actor: FineActor, body: unknown) {
      manager(actor);const actorId=account(actor);const input=conductInput(body);const b=body as Record<string,unknown>
      const requestKey=text(b.requestKey,'the request reference',36,36)
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestKey)) throw new HttpError(422,'CONDUCT_KEY','Refresh the review and try again.')
      const payloadHash=hash(input);const c=await database.getConnection()
      try {
        await c.beginTransaction()
        // Serialize retries across people as well as concurrent incidents for one person.
        await c.execute('SELECT account_id FROM accounts WHERE account_id=? FOR UPDATE',[actorId])
        const [saved]=await c.execute<RowDataPacket[]>('SELECT incident_id,payload_hash,action,fine_id FROM conduct_incidents WHERE recorded_by_account_id=? AND request_key=?',[actorId,requestKey])
        if(saved[0]) {if(saved[0].payload_hash!==payloadHash) throw new HttpError(409,'CONDUCT_RETRY_CHANGED','This reference was used for different incident details. Review again.');await c.commit();return saved[0]}
        const preview=await prepare(c,input,true)
        if(preview.reviewToken!==b.reviewToken) throw new HttpError(409,'CONDUCT_STALE','The warning history or incident changed. Review the current result before saving.')
        if(preview.needsReview) await c.execute('INSERT INTO conduct_students(user_id,category,prior_warnings,reason,reviewed_by_account_id) VALUES(?,?,?,?,?)',[preview.userId,input.category,input.priorWarnings,input.reviewReason,actorId])
        let fineId:number|null=null
        if(preview.action==='Eligible for fine review') {
          const [staff]=await c.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actorId])
          if(!staff[0]?.user_id) throw new HttpError(422,'CONDUCT_PROFILE','Your library profile is not linked. Contact the librarian.')
          const [fine]=await c.execute<ResultSetHeader>(`INSERT INTO fines(transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,applied_date,finalized_at,notes,updated_at) VALUES(NULL,?,'Infraction',?,'Unpaid','Manual',1,?,NOW(),NOW(),?,NOW())`,[preview.userId,input.amount,input.amount,`${input.category}: ${input.details}`])
          fineId=Number(fine.insertId)
          await c.execute("INSERT INTO fine_infractions(fine_id,category,incident_at,incident_location,details,issued_by_user_id) VALUES(?,?,?::timestamptz AT TIME ZONE 'Asia/Manila',?,?,?)",[fineId,input.category,input.incidentAt,input.location,input.details,staff[0].user_id])
          await refreshClearance(c,preview.userId)
        }
        const action=fineId?'Fine issued':preview.action
        const [incident]=await c.execute<ResultSetHeader>('INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,fine_id,recorded_by_account_id,request_key,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',[preview.userId,input.category,input.incidentAt,input.location,input.details,action,fineId,actorId,requestKey,payloadHash])
        await c.execute("INSERT INTO conduct_events(incident_id,actor_account_id,event_type,reason) VALUES(?,?,'Recorded',?)",[incident.insertId,actorId,input.details])
        await c.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at) VALUES(?,?,?,'Fine','Fine',?,?,'Important',?,NOW(),NOW()) ON CONFLICT(user_id,dedupe_key) DO NOTHING`,[preview.userId,'Library violation recorded',`${input.category}: ${action}.${fineId?` Fine: PHP ${input.amount!.toFixed(2)}.`:' This warning does not block borrowing or clearance.'}`,fineId??incident.insertId,preview.role==='Faculty'?'/faculty/fines':'/student/fines',`conduct:${incident.insertId}:recorded`])
        await c.commit();return {incident_id:Number(incident.insertId),action,fine_id:fineId}
      } catch(e) {await c.rollback();throw e} finally {c.release()}
    },
    async list(actor: FineActor, query: Record<string,unknown>, own=false) {
      const actorId=account(actor);if(!own)manager(actor)
      const page=Math.max(1,Math.min(100000,Number(query.page)||1));const search=typeof query.search==='string'?query.search.trim().slice(0,100):''
      const params:unknown[]=[];const where:string[]=[]
      if(own){where.push('i.user_id=(SELECT user_id FROM accounts WHERE account_id=?)');params.push(actorId)}
      if(search){where.push('(u.full_name ILIKE ? OR u.school_id ILIKE ?)');params.push(`%${search}%`,`%${search}%`)}
      if(query.category){if(!(conductCategories as readonly unknown[]).includes(query.category))throw new HttpError(422,'CONDUCT_CATEGORY','Choose a listed category.');where.push('i.category=?');params.push(query.category)}
      for(const name of ['from','to']) if(query[name]) {
        const value=String(query[name]);const instant=new Date(`${value}T00:00:00+08:00`)
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(instant.getTime())||new Date(instant.getTime()+28800000).toISOString().slice(0,10)!==value)throw new HttpError(422,'CONDUCT_FILTER_DATE','Choose a valid date range.')
        where.push(name==='from'?'i.incident_at>=?::timestamptz':"i.incident_at<(?::timestamptz + INTERVAL '1 day')");params.push(`${value}T00:00:00+08:00`)
      }
      if(query.from&&query.to&&String(query.from)>String(query.to))throw new HttpError(422,'CONDUCT_FILTER_RANGE','The end date must follow the start date.')
      const limit=query.export===true?20000:25
      const sql=where.length?`WHERE ${where.join(' AND ')}`:''
      const [items]=await database.execute<RowDataPacket[]>(`SELECT i.incident_id,i.category,i.incident_at,i.recorded_at,i.details,i.location,i.action,i.fine_id,i.voided_at,u.full_name,u.school_id,f.fine_amount,f.payment_status,a.school_id AS recorded_by,
        COALESCE((SELECT json_agg(json_build_object('type',e.event_type,'reason',e.reason,'at',e.created_at) ORDER BY e.event_id) FROM conduct_events e WHERE e.incident_id=i.incident_id),'[]') AS events,
        COUNT(*) OVER() AS total FROM conduct_incidents i JOIN users u ON u.user_id=i.user_id JOIN accounts a ON a.account_id=i.recorded_by_account_id LEFT JOIN fines f ON f.fine_id=i.fine_id ${sql} ORDER BY i.incident_id DESC LIMIT ? OFFSET ?`,[...params,limit,query.export===true?0:(Math.trunc(page)-1)*25])
      if(query.export===true&&Number(items[0]?.total??0)>20000)throw new HttpError(422,'CONDUCT_EXPORT_LIMIT','Narrow the filters to at most 20,000 records before exporting.')
      return {items,total:Number(items[0]?.total??0),page:Math.trunc(page)}
    },
    async event(actor: FineActor, id: unknown, body: unknown) {
      manager(actor);const actorId=account(actor);const incidentId=Number(id);const b=(body??{}) as Record<string,unknown>
      if(!Number.isSafeInteger(incidentId)||incidentId<1)throw new HttpError(422,'CONDUCT_ID','Choose a valid record.')
      if(!['Correction','Resolved','Voided'].includes(String(b.type)))throw new HttpError(422,'CONDUCT_EVENT','Choose a correction, resolution or void.')
      const reason=text(b.reason,'the reason',10,1000);const c=await database.getConnection()
      try {await c.beginTransaction();
        // Same person-first lock order as record; void never rewrites later financial history.
        const [rows]=await c.execute<RowDataPacket[]>('SELECT user_id FROM conduct_incidents WHERE incident_id=?',[incidentId])
        if(!rows[0])throw new HttpError(404,'CONDUCT_NOT_FOUND','Violation record not found.')
        await c.execute('SELECT user_id FROM users WHERE user_id=? FOR UPDATE',[rows[0].user_id])
        const [records]=await c.execute<RowDataPacket[]>('SELECT fine_id,voided_at FROM conduct_incidents WHERE incident_id=? FOR UPDATE',[incidentId])
        if(b.type==='Voided'){
          if(records[0].fine_id)throw new HttpError(409,'CONDUCT_FINE_VOID','Use the normal fine adjustment first. A linked financial record cannot be erased here. Record a correction instead.')
          const [later]=await c.execute<RowDataPacket[]>('SELECT incident_id FROM conduct_incidents WHERE user_id=? AND category=(SELECT category FROM conduct_incidents WHERE incident_id=?) AND incident_id>? AND voided_at IS NULL LIMIT 1',[rows[0].user_id,incidentId,incidentId])
          if(later[0])throw new HttpError(409,'CONDUCT_LATER_REVIEW','Later incidents depend on this warning. Record a correction and review those cases with the librarian before changing progression.')
          if(!records[0].voided_at)await c.execute('UPDATE conduct_incidents SET voided_at=NOW() WHERE incident_id=?',[incidentId])
        }
        await c.execute('INSERT INTO conduct_events(incident_id,actor_account_id,event_type,reason) VALUES(?,?,?,?)',[incidentId,actorId,b.type,reason]);await c.commit();return {saved:true}
      }catch(e){await c.rollback();throw e}finally{c.release()}
    }
  }
}
export const conductService=createConductService()
