import { createHash } from 'node:crypto'
import { db, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { conductAction, facultyConductAction } from './conduct-policy.ts'
import { refreshClearance, type FineActor } from './fines.service.ts'

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
/** Facts only. Money, thresholds and the warning step are decided by the server, so any `amount` sent by a client is ignored. */
export function conductInput(body: unknown) {
  if(!body || typeof body!=='object' || Array.isArray(body))throw new HttpError(422,'CONDUCT_INPUT','Enter the incident details before reviewing.')
  const b = body as Record<string,unknown>
  const category = text(b.category,'a violation category',2,80)
  const incidentAt = new Date(String(b.incidentAt ?? ''))
  if (!Number.isFinite(incidentAt.getTime()) || incidentAt.getTime()>Date.now()+60_000) throw new HttpError(422,'CONDUCT_DATE','Enter a valid incident date and time, no later than now.')
  return {schoolId:text(b.schoolId,'the school ID',3,50),category,incidentAt:incidentAt.toISOString(),location:typeof b.location==='string'?text(b.location||'Library','the location',1,150):'Library',details:text(b.details,'what happened',10,1000),fromPaperLog:b.fromPaperLog===true}
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
type Executor = Pool | PoolConnection
type Source = 'Recorded' | 'Paper log'

export function createConductService(database: Pool = db) {
  /** One place decides the person's standing, so standing, preview and save always agree. */
  async function standingFor(ex: Executor, schoolId: string, categoryName: string, fromPaperLog: boolean, lock=false, incidentAt?: string) {
    const [users]=await ex.execute<RowDataPacket[]>(`SELECT user_id,full_name,school_id,user_role FROM users WHERE school_id=? AND user_role IN ('Student','Faculty') AND account_status='Active' ${lock?'FOR UPDATE':''}`,[schoolId])
    const user=users[0]
    if (!user) throw new HttpError(404,'CONDUCT_PERSON','No active student or faculty account matches that school ID.')
    const [categories]=await ex.execute<RowDataPacket[]>(`SELECT name,warnings_before_fine,fine_amount,is_active FROM violation_categories WHERE name=? ${lock?'FOR SHARE':''}`,[categoryName])
    const category=categories[0]
    if (!category) throw new HttpError(422,'CONDUCT_CATEGORY','Choose a listed violation category.')
    const isFaculty=user.user_role==='Faculty'
    const [reviews]=await ex.execute<RowDataPacket[]>('SELECT prior_warnings,reviewed_at FROM conduct_students WHERE user_id=? AND category=?',[user.user_id,categoryName])
    const [history]=await ex.execute<RowDataPacket[]>("SELECT incident_id,incident_at,action,source FROM conduct_incidents WHERE user_id=? AND category=? AND voided_at IS NULL ORDER BY incident_at,incident_id",[user.user_id,categoryName])
    // Saved lifetime reviews from before this change keep counting so nobody's history is reset.
    const earlier=Number(reviews[0]?.prior_warnings??0)
    const warningsUsed=history.length+earlier
    // Faculty are never fined (revisions 2026-11-20): they get the same warnings, ending at a final warning.
    const warningsBeforeFine=Number(category.warnings_before_fine)
    const action=isFaculty?facultyConductAction(warningsUsed,warningsBeforeFine):conductAction(warningsUsed,warningsBeforeFine)
    // A paper log only back-fills warnings from before the system, so it can never touch the fine step or follow system records.
    const [recorded]=await ex.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM conduct_incidents WHERE user_id=? AND category=? AND voided_at IS NULL AND source='Recorded'",[user.user_id,categoryName])
    const [latestPaper]=await ex.execute<RowDataPacket[]>("SELECT MAX(incident_at) AS latest FROM conduct_incidents WHERE user_id=? AND category=? AND voided_at IS NULL AND source='Paper log'",[user.user_id,categoryName])
    const block=warningsBeforeFine===0?{status:422,code:'CONDUCT_PAPER_LOG_NO_WARNINGS',message:'This category has no warnings, so there is nothing to copy from the paper log.'}
      :Number(recorded[0].count)>0?{status:422,code:'CONDUCT_PAPER_LOG_AFTER_RECORDS',message:'Paper-log entries must come before the first record made in the system.'}
      :action==='Fine'?{status:409,code:'CONDUCT_PAPER_LOG_FINE_STEP',message:'This person is already at the fine step. Paper-log entries only add earlier warnings.'}
      :null
    if (fromPaperLog) {
      if (block) throw new HttpError(block.status,block.code,block.message)
      if (incidentAt && latestPaper[0]?.latest && new Date(incidentAt).getTime()<new Date(latestPaper[0].latest).getTime()) throw new HttpError(422,'CONDUCT_PAPER_LOG_ORDER','Enter paper-log entries in date order. A later paper-log entry already exists for this person.')
    }
    const fineAmount=Number(category.fine_amount)
    const amount=action==='Fine'?fineAmount:null
    const snapshot={userId:Number(user.user_id),role:String(user.user_role),name:String(user.full_name),schoolId:String(user.school_id),category:categoryName,warningsUsed,warningsBeforeFine,fineAmount,action,amount,fromPaperLog,categoryActive:Boolean(category.is_active)}
    return {...snapshot,paperLogAllowed:!block,paperLogReason:block?block.message:null,nextStep:action,earlierWarnings:earlier>0?{count:earlier,reviewedAt:reviews[0].reviewed_at}:null,history:history.map(h=>({incidentId:Number(h.incident_id),date:h.incident_at,step:String(h.action),source:String(h.source) as Source})),reviewToken:hash(snapshot)}
  }
  const prepare=(ex: Executor, input: ReturnType<typeof conductInput>, lock=false)=>standingFor(ex,input.schoolId,input.category,input.fromPaperLog,lock,input.incidentAt)

  return {
    async preview(actor: FineActor, body: unknown) {manager(actor);account(actor);return prepare(database,conductInput(body))},
    async standing(actor: FineActor, query: Record<string,unknown>) {
      manager(actor);account(actor)
      return standingFor(database,text(query.schoolId,'the school ID',3,50),text(query.category,'a violation category',2,80),query.paperLog==='1'||query.paperLog==='true')
    },
    /** A person's own warnings left in each category, for the Student and Faculty fines page. */
    async ownStanding(actor: FineActor) {
      const actorId=account(actor)
      const [users]=await database.execute<RowDataPacket[]>('SELECT u.user_id,u.user_role FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?',[actorId])
      if(!users[0])return []
      const isFaculty=users[0].user_role==='Faculty'
      const [rows]=await database.execute<RowDataPacket[]>(`SELECT c.name,c.warnings_before_fine,c.fine_amount,c.is_active,
        (SELECT COUNT(*) FROM conduct_incidents i WHERE i.user_id=? AND i.category=c.name AND i.voided_at IS NULL)+COALESCE((SELECT s.prior_warnings FROM conduct_students s WHERE s.user_id=? AND s.category=c.name),0) AS used
        FROM violation_categories c ORDER BY c.sort_order,c.name`,[users[0].user_id,users[0].user_id])
      return rows.filter(r=>r.is_active||Number(r.used)>0).map(r=>{
        const warningsBeforeFine=Number(r.warnings_before_fine);const warningsUsed=Number(r.used)
        return {category:String(r.name),warningsUsed,warningsBeforeFine,warningsLeft:Math.max(0,warningsBeforeFine-warningsUsed),fineAmount:isFaculty?0:Number(r.fine_amount)}
      })
    },
    async record(actor: FineActor, body: unknown) {
      manager(actor);const actorId=account(actor);const input=conductInput(body);const b=body as Record<string,unknown>
      const requestKey=text(b.requestKey,'the request reference',36,36)
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestKey)) throw new HttpError(422,'CONDUCT_KEY','Refresh the review and try again.')
      const payloadHash=hash(input);const c=await database.getConnection()
      try {
        await c.beginTransaction()
        // Serialize retries across people as well as concurrent incidents for one person.
        await c.execute('SELECT account_id FROM accounts WHERE account_id=? FOR NO KEY UPDATE',[actorId])
        const [saved]=await c.execute<RowDataPacket[]>('SELECT incident_id,payload_hash,action,fine_id FROM conduct_incidents WHERE recorded_by_account_id=? AND request_key=?',[actorId,requestKey])
        if(saved[0]) {if(saved[0].payload_hash!==payloadHash) throw new HttpError(409,'CONDUCT_RETRY_CHANGED','This reference was used for different incident details. Review again.');await c.commit();return saved[0]}
        const preview=await prepare(c,input,true)
        if(!preview.categoryActive) throw new HttpError(422,'CONDUCT_CATEGORY_RETIRED','This violation category is retired. Choose an active category.')
        // The token covers the person, history, threshold and fine amount, so a Library setup change while reviewing is caught here.
        if(preview.reviewToken!==b.reviewToken) throw new HttpError(409,'CONDUCT_STALE','The warning history, fine amount or violation rules changed. Review the current result and save again.')
        let fineId:number|null=null
        if(preview.action==='Fine') {
          const [staff]=await c.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=?',[actorId])
          if(!staff[0]?.user_id) throw new HttpError(422,'CONDUCT_PROFILE','Your library profile is not linked. Contact the librarian.')
          const [fine]=await c.execute<ResultSetHeader>(`INSERT INTO fines(transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,applied_date,finalized_at,notes,updated_at) VALUES(NULL,?,'Infraction',?,'Unpaid','Manual',1,?,NOW(),NOW(),?,NOW())`,[preview.userId,preview.amount,preview.amount,`${input.category}: ${input.details}`])
          fineId=Number(fine.insertId)
          await c.execute("INSERT INTO fine_infractions(fine_id,category,incident_at,incident_location,details,issued_by_user_id) VALUES(?,?,?::timestamptz AT TIME ZONE 'Asia/Manila',?,?,?)",[fineId,input.category,input.incidentAt,input.location,input.details,staff[0].user_id])
          await refreshClearance(c,preview.userId)
        }
        const action=fineId?'Fine issued':preview.action
        const source:Source=input.fromPaperLog?'Paper log':'Recorded'
        const [incident]=await c.execute<ResultSetHeader>('INSERT INTO conduct_incidents(user_id,category,incident_at,location,details,action,fine_id,recorded_by_account_id,request_key,payload_hash,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[preview.userId,input.category,input.incidentAt,input.location,input.details,action,fineId,actorId,requestKey,payloadHash,source])
        await c.execute("INSERT INTO conduct_events(incident_id,actor_account_id,event_type,reason) VALUES(?,?,'Recorded',?)",[incident.insertId,actorId,input.fromPaperLog?`Copied from the paper log. ${input.details}`.slice(0,1000):input.details])
        // Paper-log entries are history being copied in, so the person is not told again.
        if(!input.fromPaperLog) await c.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at) VALUES(?,?,?,'Fine','Fine',?,?,'Important',?,NOW(),NOW()) ON CONFLICT(user_id,dedupe_key) DO NOTHING`,[preview.userId,'Library violation recorded',`${input.category}: ${action}.${fineId?` Fine: PHP ${preview.amount!.toFixed(2)}.`:' This warning does not block borrowing or clearance.'}`,fineId??incident.insertId,preview.role==='Faculty'?'/faculty/fines':'/student/fines',`conduct:${incident.insertId}:recorded`])
        await c.commit();return {incident_id:Number(incident.insertId),action,fine_id:fineId}
      } catch(e) {await c.rollback();throw e} finally {c.release()}
    },
    async list(actor: FineActor, query: Record<string,unknown>, own=false) {
      const actorId=account(actor);if(!own)manager(actor)
      const page=Math.max(1,Math.min(100000,Number(query.page)||1));const search=typeof query.search==='string'?query.search.trim().slice(0,100):''
      const params:unknown[]=[];const where:string[]=[]
      if(own){where.push('i.user_id=(SELECT user_id FROM accounts WHERE account_id=?)');params.push(actorId)}
      if(search){where.push('(u.full_name ILIKE ? OR u.school_id ILIKE ?)');params.push(`%${search}%`,`%${search}%`)}
      if(query.category){
        if(typeof query.category!=='string'||query.category.length>80)throw new HttpError(422,'CONDUCT_CATEGORY','Choose a listed category.')
        const [known]=await database.execute<RowDataPacket[]>('SELECT 1 FROM violation_categories WHERE name=?',[query.category])
        if(!known[0])throw new HttpError(422,'CONDUCT_CATEGORY','Choose a listed category.')
        where.push('i.category=?');params.push(query.category)
      }
      if(query.incidentId){const id=Number(query.incidentId);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(422,'CONDUCT_ID','Choose a valid record.');where.push('i.incident_id=?');params.push(id)}
      for(const name of ['from','to']) if(query[name]) {
        const value=String(query[name]);const instant=new Date(`${value}T00:00:00+08:00`)
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(instant.getTime())||new Date(instant.getTime()+28800000).toISOString().slice(0,10)!==value)throw new HttpError(422,'CONDUCT_FILTER_DATE','Choose a valid date range.')
        where.push(name==='from'?'i.incident_at>=?::timestamptz':"i.incident_at<(?::timestamptz + INTERVAL '1 day')");params.push(`${value}T00:00:00+08:00`)
      }
      if(query.from&&query.to&&String(query.from)>String(query.to))throw new HttpError(422,'CONDUCT_FILTER_RANGE','The end date must follow the start date.')
      const limit=query.export===true?20000:25
      const sql=where.length?`WHERE ${where.join(' AND ')}`:''
      const [items]=await database.execute<RowDataPacket[]>(`SELECT i.incident_id,i.category,i.incident_at,i.recorded_at,i.details,i.location,i.action,i.source,i.fine_id,i.voided_at,u.full_name,u.school_id,f.fine_amount,f.payment_status,a.school_id AS recorded_by,
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
