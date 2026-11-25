import { createHash } from 'node:crypto'
import { db, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { conductAction, facultyConductAction, MAX_WARNINGS_BEFORE_FINE, normalizeStudentLevel, resolveWarningsBeforeFine, STUDENT_LEVELS, type LevelWarningsMap, type StudentLevel } from './conduct-policy.ts'
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

function parseAllowedLevels(raw: unknown): StudentLevel[] {
  if (Array.isArray(raw)) {
    const valid = STUDENT_LEVELS.filter(level => raw.includes(level))
    return valid.length ? valid : [...STUDENT_LEVELS]
  }
  return [...STUDENT_LEVELS]
}

function parseLevelWarnings(raw: unknown): LevelWarningsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: LevelWarningsMap = {}
  for (const level of STUDENT_LEVELS) {
    const value = (raw as Record<string, unknown>)[level]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_WARNINGS_BEFORE_FINE) result[level] = value
  }
  return result
}

export function createConductService(database: Pool = db) {
  async function readViolationSettings(ex: Executor, lock = false) {
    const [rows] = await ex.execute<RowDataPacket[]>(`SELECT warnings_before_fine,level_warnings FROM violation_settings WHERE settings_id=1 ${lock ? 'FOR SHARE' : ''}`, [])
    if (!rows[0]) throw new HttpError(503, 'VIOLATION_SETTINGS_MISSING', 'The violation settings are not set up yet. Ask the administrator to apply the latest database update.')
    return {
      warningsBeforeFine: Number(rows[0].warnings_before_fine),
      levelWarnings: parseLevelWarnings(rows[0].level_warnings),
    }
  }

  /** One place decides the person's standing, so standing, preview and save always agree. */
  async function standingFor(ex: Executor, schoolId: string, categoryName: string, fromPaperLog: boolean, lock=false, incidentAt?: string) {
    const [users]=await ex.execute<RowDataPacket[]>(`SELECT u.user_id,u.full_name,u.school_id,u.user_role,u.educational_level FROM users u WHERE u.school_id=? AND u.user_role IN ('Student','Faculty') AND u.account_status='Active' ${lock?'FOR UPDATE':''}`,[schoolId])
    const user=users[0]
    if (!user) throw new HttpError(404,'CONDUCT_PERSON','No active student or faculty account matches that school ID.')
    const isFaculty=user.user_role==='Faculty'
    let studentLevel: StudentLevel | null = null
    if (!isFaculty) {
      const [profiles]=await ex.execute<RowDataPacket[]>('SELECT sp.year_grade_level FROM accounts a JOIN student_profiles sp ON sp.account_id=a.account_id WHERE a.user_id=? LIMIT 1',[user.user_id])
      studentLevel=normalizeStudentLevel(profiles[0]?.year_grade_level ?? user.educational_level)
    }
    const settings=await readViolationSettings(ex,lock)
    const [categories]=await ex.execute<RowDataPacket[]>(`SELECT name,fine_amount,allowed_levels,is_active FROM violation_categories WHERE name=? ${lock?'FOR SHARE':''}`,[categoryName])
    const category=categories[0]
    if (!category) throw new HttpError(422,'CONDUCT_CATEGORY','Choose a listed violation category.')
    const allowedLevels=parseAllowedLevels(category.allowed_levels)
    const levelAllowed=isFaculty || !studentLevel || allowedLevels.includes(studentLevel)
    const levelReason=levelAllowed?null:`${categoryName} applies to ${allowedLevels.join(', ')} only. This student is ${studentLevel}.`
    // Shared offense count across ALL categories: every non-voided violation counts toward the person's total.
    const [reviews]=await ex.execute<RowDataPacket[]>('SELECT COALESCE(SUM(prior_warnings),0) AS total,MAX(reviewed_at) AS reviewed_at FROM conduct_students WHERE user_id=?',[user.user_id])
    const [history]=await ex.execute<RowDataPacket[]>("SELECT incident_id,category,incident_at,action,source FROM conduct_incidents WHERE user_id=? AND voided_at IS NULL ORDER BY incident_at,incident_id",[user.user_id])
    const earlier=Number(reviews[0]?.total??0)
    const warningsUsed=history.length+earlier
    // Faculty are never fined (revisions 2026-11-20): they get the default warnings, ending at a final warning.
    const warningsBeforeFine=resolveWarningsBeforeFine(settings.warningsBeforeFine,settings.levelWarnings,studentLevel)
    const action=isFaculty?facultyConductAction(warningsUsed,warningsBeforeFine):conductAction(warningsUsed,warningsBeforeFine)
    // A paper log only back-fills warnings from before the system, so it can never touch the fine step or follow system records.
    const [recorded]=await ex.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM conduct_incidents WHERE user_id=? AND voided_at IS NULL AND source='Recorded'",[user.user_id])
    const [latestPaper]=await ex.execute<RowDataPacket[]>("SELECT MAX(incident_at) AS latest FROM conduct_incidents WHERE user_id=? AND voided_at IS NULL AND source='Paper log'",[user.user_id])
    const block=warningsBeforeFine===0?{status:422,code:'CONDUCT_PAPER_LOG_NO_WARNINGS',message:'This rule has no warnings, so there is nothing to copy from the paper log.'}
      :Number(recorded[0].count)>0?{status:422,code:'CONDUCT_PAPER_LOG_AFTER_RECORDS',message:'Paper-log entries must come before the first record made in the system.'}
      :action==='Fine'?{status:409,code:'CONDUCT_PAPER_LOG_FINE_STEP',message:'This person is already at the fine step. Paper-log entries only add earlier warnings.'}
      :null
    if (fromPaperLog) {
      if (block) throw new HttpError(block.status,block.code,block.message)
      if (incidentAt && latestPaper[0]?.latest && new Date(incidentAt).getTime()<new Date(latestPaper[0].latest).getTime()) throw new HttpError(422,'CONDUCT_PAPER_LOG_ORDER','Enter paper-log entries in date order. A later paper-log entry already exists for this person.')
    }
    const fineAmount=Number(category.fine_amount)
    const amount=action==='Fine'?fineAmount:null
    const snapshot={userId:Number(user.user_id),role:String(user.user_role),studentLevel,name:String(user.full_name),schoolId:String(user.school_id),category:categoryName,warningsUsed,warningsBeforeFine,fineAmount,action,amount,fromPaperLog,categoryActive:Boolean(category.is_active),allowedLevels,levelAllowed}
    return {...snapshot,levelReason,paperLogAllowed:!block,paperLogReason:block?block.message:null,nextStep:action,earlierWarnings:earlier>0?{count:earlier,reviewedAt:reviews[0].reviewed_at}:null,history:history.map(h=>({incidentId:Number(h.incident_id),category:String(h.category),date:h.incident_at,step:String(h.action),source:String(h.source) as Source})),reviewToken:hash(snapshot)}
  }
  const prepare=(ex: Executor, input: ReturnType<typeof conductInput>, lock=false)=>standingFor(ex,input.schoolId,input.category,input.fromPaperLog,lock,input.incidentAt)

  return {
    async preview(actor: FineActor, body: unknown) {manager(actor);account(actor);return prepare(database,conductInput(body))},
    async standing(actor: FineActor, query: Record<string,unknown>) {
      manager(actor);account(actor)
      return standingFor(database,text(query.schoolId,'the school ID',3,50),text(query.category,'a violation category',2,80),query.paperLog==='1'||query.paperLog==='true')
    },
    /** A person's shared warnings left across all violation categories, for the Student and Faculty fines page. */
    async ownStanding(actor: FineActor) {
      const actorId=account(actor)
      const [users]=await database.execute<RowDataPacket[]>('SELECT u.user_id,u.user_role,u.educational_level,sp.year_grade_level FROM accounts a JOIN users u ON u.user_id=a.user_id LEFT JOIN student_profiles sp ON sp.account_id=a.account_id WHERE a.account_id=?',[actorId])
      if(!users[0])return null
      const isFaculty=users[0].user_role==='Faculty'
      const studentLevel=isFaculty?null:normalizeStudentLevel(users[0].year_grade_level ?? users[0].educational_level)
      const settings=await readViolationSettings(database)
      const warningsBeforeFine=resolveWarningsBeforeFine(settings.warningsBeforeFine,settings.levelWarnings,studentLevel)
      const [usedRows]=await database.execute<RowDataPacket[]>(`SELECT
        (SELECT COUNT(*) FROM conduct_incidents i WHERE i.user_id=? AND i.voided_at IS NULL)
        + COALESCE((SELECT SUM(s.prior_warnings) FROM conduct_students s WHERE s.user_id=?),0) AS used`,[users[0].user_id,users[0].user_id])
      const warningsUsed=Number(usedRows[0]?.used??0)
      const [rows]=await database.execute<RowDataPacket[]>(`SELECT c.name,c.fine_amount,c.allowed_levels,c.is_active,
        EXISTS(SELECT 1 FROM conduct_incidents i WHERE i.user_id=? AND i.category=c.name AND i.voided_at IS NULL) AS has_history
        FROM violation_categories c ORDER BY c.sort_order,c.name`,[users[0].user_id])
      const categories=rows
        .filter(r=>{
          if(r.has_history)return true
          if(!r.is_active)return false
          const allowed=parseAllowedLevels(r.allowed_levels)
          return isFaculty||!studentLevel||allowed.includes(studentLevel)
        })
        .map(r=>({
          category:String(r.name),
          fineAmount:isFaculty?0:Number(r.fine_amount),
          allowedLevels:parseAllowedLevels(r.allowed_levels),
        }))
      return {
        role:String(users[0].user_role),
        studentLevel,
        warningsUsed,
        warningsBeforeFine,
        warningsLeft:Math.max(0,warningsBeforeFine-warningsUsed),
        categories,
      }
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
        if(!preview.levelAllowed) throw new HttpError(422,'CONDUCT_CATEGORY_LEVEL',preview.levelReason ?? 'This violation category does not apply to this student’s year or grade level.')
        // The token covers the person, level, shared history, threshold and fine amount, so a Library setup change while reviewing is caught here.
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
          // Shared progression: any later incident for this person (in any category) depends on this warning.
          const [later]=await c.execute<RowDataPacket[]>('SELECT incident_id FROM conduct_incidents WHERE user_id=? AND incident_id>? AND voided_at IS NULL LIMIT 1',[rows[0].user_id,incidentId])
          if(later[0])throw new HttpError(409,'CONDUCT_LATER_REVIEW','Later incidents depend on this warning. Record a correction and review those cases with the librarian before changing progression.')
          if(!records[0].voided_at)await c.execute('UPDATE conduct_incidents SET voided_at=NOW() WHERE incident_id=?',[incidentId])
        }
        await c.execute('INSERT INTO conduct_events(incident_id,actor_account_id,event_type,reason) VALUES(?,?,?,?)',[incidentId,actorId,b.type,reason]);await c.commit();return {saved:true}
      }catch(e){await c.rollback();throw e}finally{c.release()}
    }
  }
}
export const conductService=createConductService()
