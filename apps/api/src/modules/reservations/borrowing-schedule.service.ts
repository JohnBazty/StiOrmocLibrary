import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { manilaDate, manilaInstant, localTimestamp } from '../attendance/attendance-intervals.ts'
import { borrowerEligibility } from '../circulation/desk-circulation.policy.ts'
import { accountHold, allocateWaitingRequests, availableCopies, linkedUser, lock, releaseBookRequest } from './book-request.service.ts'
import { recordRequestEvent } from './book-request-events.ts'
import { loadScheduleCalendar, pickupWindow, scheduleDates } from './borrowing-schedule-calendar.ts'
import { positiveId } from './reservation.validation.ts'

const active="('pending','approved','ready_for_pickup')"
const fail=(code:string,message:string)=>new HttpError(422,code,message)
type ScheduleCursor={pickupDate:string;scheduleId:number}
export function parseScheduleCursor(value:string|null):ScheduleCursor|null {
  if(!value)return null
  try{const r=JSON.parse(value);return /^\d{4}-\d{2}-\d{2}$/.test(r.pickupDate)&&Number.isSafeInteger(r.scheduleId)&&r.scheduleId>0?r:null}catch{return null}
}
async function enabled(q:Pick<PoolConnection,'execute'>) {
  const [rows]=await q.execute<RowDataPacket[]>("SELECT to_regclass('public.borrowing_schedules') IS NOT NULL AS enabled")
  return Boolean(rows[0]?.enabled)
}
async function duplicates(q:PoolConnection,userId:number,titleId:number) {
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT reservation_id::text AS id FROM reservations WHERE user_id=? AND book_title_id=? AND reservation_status IN ${active}
    UNION ALL SELECT bt.transaction_id::text FROM borrow_transactions bt LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id OR (bt.physical_copy_id IS NULL AND pc.material_id=bt.material_id)
    WHERE bt.user_id=? AND pc.title_id=? AND bt.transaction_status IN ('Pending','Borrowed','Overdue')`,[userId,titleId,userId,titleId])
  return rows.length>0
}
async function notice(q:PoolConnection,r:RowDataPacket,event:string,message:string) {
  await q.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
    SELECT s.user_id,'Scheduled borrowing',?, 'Reservation Arrival','Reservation',s.schedule_id,
      CASE WHEN u.user_role='Faculty' THEN '/faculty/reservations' ELSE '/student/reservations' END,'Important',?,NOW(),NOW()
    FROM borrowing_schedules s JOIN users u ON u.user_id=s.user_id WHERE s.schedule_id=?
    ON CONFLICT(user_id,dedupe_key) DO NOTHING`,[`${r.title}: ${message}`,`borrowing-schedule:${r.schedule_id}:${event}`,r.schedule_id])
}
async function setReason(q:PoolConnection,r:RowDataPacket,reason:string,actionNeeded=false) {
  await q.execute('UPDATE borrowing_schedules SET last_reason=?,updated_at=NOW() WHERE schedule_id=?',[reason,r.schedule_id])
  if(actionNeeded)await notice(q,r,'action-needed',reason)
}
function view(r:RowDataPacket) {
  return {scheduleId:Number(r.schedule_id),titleId:Number(r.title_id),title:String(r.title),pickupDate:String(r.pickup_date_text),status:String(r.status),
    reservationId:r.reservation_id?Number(r.reservation_id):null,reason:r.last_reason?String(r.last_reason):null}
}
export function createBorrowingScheduleService(database:Pool=db,clock=()=>new Date()) {
  async function transaction<T>(run:(q:PoolConnection)=>Promise<T>,bounded=false) {
    const q=await database.getConnection()
    try {await q.beginTransaction();if(bounded){await q.execute("SET LOCAL lock_timeout = '1500ms'");await q.execute("SET LOCAL statement_timeout = '5s'")}await lock(q);const result=await run(q);await q.commit();return result}
    catch(error){await q.rollback();throw error}finally{q.release()}
  }
  async function requireEnabled(q:PoolConnection) {
    if(!await enabled(q))throw new HttpError(503,'SCHEDULE_NOT_CONFIGURED','Scheduled borrowing is not available yet.')
  }
  const select=`SELECT s.*,to_char(s.pickup_date,'YYYY-MM-DD') AS pickup_date_text,t.title FROM borrowing_schedules s JOIN titles t ON t.title_id=s.title_id`
  return {
    async dates() {
      if(!await enabled(database)) return {available:false,dates:[] as string[]}
      const c=await loadScheduleCalendar(database,clock())
      return {available:true,dates:scheduleDates(clock(),c.week,c.closed)}
    },
    async list(accountId:unknown) {
      return transaction(async q=>{
        const userId=await linkedUser(q,positiveId(accountId,'accountId'))
        if(!await enabled(q))return []
        const [rows]=await q.execute<RowDataPacket[]>(`${select} WHERE s.user_id=? ORDER BY s.created_at DESC,s.schedule_id DESC LIMIT 100`,[userId])
        return rows.map(view)
      })
    },
    async create(accountId:unknown,body:unknown) {
      const input=body && typeof body==='object'?body as Record<string,unknown>:{}
      const titleId=positiveId(input.titleId,'titleId'), date=String(input.pickupDate??''),key=input.clientRequestId
      if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(key))throw fail('REQUEST_KEY_INVALID','The request confirmation ID is invalid.')
      return transaction(async q=>{
        await requireEnabled(q)
        const userId=await linkedUser(q,positiveId(accountId,'accountId'))
        const [prior]=await q.execute<RowDataPacket[]>(`${select} WHERE s.user_id=? AND s.client_request_id=?`,[userId,key])
        if(prior[0]) {
          if(Number(prior[0].title_id)!==titleId||prior[0].pickup_date_text!==date)throw new HttpError(409,'REQUEST_KEY_REUSED','This confirmation belongs to another schedule.')
          return view(prior[0])
        }
        const c=await loadScheduleCalendar(q,clock())
        if(!scheduleDates(clock(),c.week,c.closed).includes(date))throw fail('SCHEDULE_DATE_INVALID','Choose an open library date within the next seven days.')
        const [counts]=await q.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM borrowing_schedules WHERE user_id=? AND status='scheduled'",[userId])
        if(Number(counts[0]?.total)>=2)throw fail('SCHEDULE_LIMIT_REACHED','You already have two pending schedules. Cancel one before scheduling another book.')
        const [same]=await q.execute<RowDataPacket[]>("SELECT schedule_id FROM borrowing_schedules WHERE user_id=? AND title_id=? AND status='scheduled'",[userId,titleId])
        if(same.length)throw fail('SCHEDULE_ALREADY_EXISTS','You already have a pending schedule for this title.')
        if(await duplicates(q,userId,titleId))throw fail('BOOK_ALREADY_IN_ACCOUNT','You already have this title in a book request or active loan.')
        const [titles]=await q.execute<RowDataPacket[]>(`SELECT t.title_id FROM titles t WHERE t.title_id=? AND t.record_type='Book' AND t.lifecycle_status='Active'
          AND EXISTS(SELECT 1 FROM physical_copies pc WHERE pc.title_id=t.title_id AND pc.lifecycle_status='Active' AND pc.material_id IS NOT NULL)`,[titleId])
        if(!titles.length)throw fail('SCHEDULE_TITLE_UNAVAILABLE','This title has no active book copy for scheduled borrowing.')
        const [insert]=await q.execute<ResultSetHeader>(`INSERT INTO borrowing_schedules(user_id,title_id,pickup_date,client_request_id) VALUES(?,?,?::date,?)`,[userId,titleId,date,key])
        const [rows]=await q.execute<RowDataPacket[]>(`${select} WHERE s.schedule_id=?`,[insert.insertId])
        return view(rows[0])
      })
    },
    async cancel(accountId:unknown,scheduleId:unknown) {
      return transaction(async q=>{
        await requireEnabled(q)
        const userId=await linkedUser(q,positiveId(accountId,'accountId'))
        const [rows]=await q.execute<RowDataPacket[]>(`${select} WHERE s.schedule_id=? AND s.user_id=? FOR UPDATE OF s`,[positiveId(scheduleId,'scheduleId'),userId])
        const r=rows[0]
        if(!r)throw new HttpError(404,'SCHEDULE_NOT_FOUND','This schedule does not exist.')
        if(r.status==='cancelled')return view(r)
        if(r.status!=='scheduled')throw fail('SCHEDULE_NOT_PENDING','This schedule has already progressed. Manage its book request instead.')
        await q.execute("UPDATE borrowing_schedules SET status='cancelled',last_reason='Cancelled by you.',updated_at=NOW() WHERE schedule_id=?",[r.schedule_id])
        return view({...r,status:'cancelled',last_reason:'Cancelled by you.'})
      })
    },
    async process(cursor:ScheduleCursor|null=null) {
      if(!await enabled(database))return {prepared:0,finished:0,available:false,nextCursor:null as string|null}
      const started=Date.now()
      const [batch]=await database.execute<RowDataPacket[]>(`${select} WHERE s.status IN ('scheduled','prepared')
        AND (s.status='scheduled' OR EXISTS(SELECT 1 FROM reservations r WHERE r.reservation_id=s.reservation_id AND r.reservation_status IN ${active}))
        ${cursor?'AND (s.pickup_date,s.schedule_id)>(?::date,?)':''}
        ORDER BY s.pickup_date,s.schedule_id LIMIT 21`,cursor?[cursor.pickupDate,cursor.scheduleId]:[])
      let prepared=0,finished=0,handled=0
      let last:RowDataPacket|undefined
      for(const candidate of batch.slice(0,20)) {
        if(handled>0 && Date.now()-started>=8000)break
        const result=await transaction(async q=>{
          const [fresh]=await q.execute<RowDataPacket[]>(`${select} WHERE s.schedule_id=? AND s.status IN ('scheduled','prepared') FOR UPDATE OF s`,[candidate.schedule_id])
          const r=fresh[0]
          if(!r)return {prepared:0,finished:0}
          if(r.reservation_id) {
            const [requests]=await q.execute<RowDataPacket[]>('SELECT reservation_status FROM reservations WHERE reservation_id=? FOR UPDATE',[r.reservation_id])
            if(!requests[0] || !['pending','approved','ready_for_pickup'].includes(requests[0].reservation_status))return {prepared:0,finished:0}
          }
          const now=clock(),c=await loadScheduleCalendar(q,now)
          const window=pickupWindow(r.pickup_date_text,c.week,c.closed)
          if(!window || now>=window.closeAt) {
            const reason=!window?'The library is closed on your pickup date. Choose another date.':'The pickup date has ended. Choose another date if you still need this book.'
            if(r.reservation_id) {
              const [requests]=await q.execute<RowDataPacket[]>('SELECT * FROM reservations WHERE reservation_id=? FOR UPDATE',[r.reservation_id])
              if(requests[0] && ['pending','approved','ready_for_pickup'].includes(requests[0].reservation_status))await releaseBookRequest(q,requests[0],!window?'cancelled':'expired',null,now)
              await q.execute('UPDATE borrowing_schedules SET last_reason=?,updated_at=NOW() WHERE schedule_id=?',[reason,r.schedule_id])
            } else await q.execute('UPDATE borrowing_schedules SET status=?,last_reason=?,updated_at=NOW() WHERE schedule_id=?',[!window?'cancelled':'unfulfilled',reason,r.schedule_id])
            await notice(q,r,!window?'closed':'unfulfilled',reason);return {prepared:0,finished:1}
          }
          if(r.status==='prepared') {
            const [requests]=await q.execute<RowDataPacket[]>('SELECT * FROM reservations WHERE reservation_id=? FOR UPDATE',[r.reservation_id])
            const request=requests[0]
            if(request && ['pending','approved','ready_for_pickup'].includes(request.reservation_status) && localTimestamp(request.pickup_deadline)!==window.closeAt.getTime()) {
              await q.execute("UPDATE reservations SET pickup_deadline=(?::timestamptz AT TIME ZONE 'Asia/Manila'),updated_at=NOW() WHERE reservation_id=?",[window.closeAt,r.reservation_id])
              await notice(q,r,`deadline:${window.closeAt.toISOString()}`,`The pickup deadline is now ${window.closeAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})} (Philippine time).`)
            }
            return {prepared:0,finished:0}
          }
          if(now<window.prepareAt)return {prepared:0,finished:0}
          // A delayed job must not prepare outside today's operating hours.
          const today=manilaDate(now),day=c.week.find(d=>Number(d.day_of_week)===((new Date(`${today}T00:00:00Z`).getUTCDay()+6)%7)+1)
          if(!day?.is_open||c.closed.has(today)||now<manilaInstant(today,day.opens_at)||now>=manilaInstant(today,day.closes_at))return {prepared:0,finished:0}
          const eligible=await borrowerEligibility(q,Number(r.user_id),now,'Online')
          if(eligible.blockers.length){await setReason(q,r,eligible.blockers.join(' '),true);return {prepared:0,finished:0}}
          if(!eligible.state.allowBorrowing)return {prepared:0,finished:0}
          if(await duplicates(q,Number(r.user_id),Number(r.title_id))){await setReason(q,r,'You already have this title in an active loan or request.',true);return {prepared:0,finished:0}}
          const hold=await accountHold(q,Number(r.user_id))
          if(eligible.limit!==null && hold.total>=eligible.limit){await setReason(q,r,'Your borrowing limit is full. Return a book or cancel an active request.',true);return {prepared:0,finished:0}}
          const role=String(eligible.user?.user_role),reservationLimit=role==='Student'?eligible.policy.student_max_active_reservations:eligible.policy.faculty_max_active_reservations
          if(!['Student','Faculty'].includes(role)){await setReason(q,r,'This account is no longer eligible for scheduled borrowing.',true);return {prepared:0,finished:0}}
          const [counts]=await q.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM reservations WHERE user_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[r.user_id])
          if(reservationLimit!=null && Number(counts[0]?.total)>=Number(reservationLimit)){await setReason(q,r,'Your reservation limit is full. Cancel an active request to make room.',true);return {prepared:0,finished:0}}
          const [rules]=await q.execute<RowDataPacket[]>("SELECT is_borrowable FROM borrowing_policy_material_rules WHERE borrowing_policy_version_id=? AND material_type='Book'",[eligible.policy.borrowing_policy_version_id])
          if(!rules[0]?.is_borrowable){await setReason(q,r,'The current library policy does not allow borrowing this material.',true);return {prepared:0,finished:0}}
          await allocateWaitingRequests(q,Number(r.title_id),now)
          const copies=await availableCopies(q,Number(r.title_id))
          if(!copies.length){await setReason(q,r,'No copy is available yet. We will retry until your pickup date ends.');return {prepared:0,finished:0}}
          const [capacity]=await q.execute<RowDataPacket[]>(`SELECT (SELECT COUNT(*) FROM physical_copies WHERE title_id=? AND lifecycle_status='Active') AS copies,
            (SELECT COUNT(*) FROM reservations WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active}) AS waiting`,[r.title_id,r.title_id])
          if(Number(capacity[0]?.waiting)>=Number(capacity[0]?.copies)){await setReason(q,r,'The existing reservation queue has priority. We will retry.');return {prepared:0,finished:0}}
          const [positions]=await q.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(queue_position),0)+1 AS position FROM reservations WHERE book_title_id=? AND request_kind='Reservation' AND reservation_status IN ${active}`,[r.title_id])
          const [insert]=await q.execute<ResultSetHeader>(`INSERT INTO reservations(user_id,material_id,book_title_id,borrowing_policy_version_id,request_kind,queue_position,reservation_status,reserved_at,scheduled_pickup_date,pickup_deadline)
            VALUES(?,?,?,?,'Reservation',?,'pending',(?::timestamptz AT TIME ZONE 'Asia/Manila'),?::date,(?::timestamptz AT TIME ZONE 'Asia/Manila'))`,[r.user_id,copies[0].material_id,r.title_id,eligible.policy.borrowing_policy_version_id,positions[0].position,now,r.pickup_date_text,window.closeAt])
          await recordRequestEvent(q,insert.insertId,'received',now)
          await allocateWaitingRequests(q,Number(r.title_id),now)
          // Allocation ordinarily clears the deadline until Mark ready; scheduled holds already have a fixed end.
          await q.execute("UPDATE reservations SET pickup_deadline=(?::timestamptz AT TIME ZONE 'Asia/Manila') WHERE reservation_id=?",[window.closeAt,insert.insertId])
          const [assigned]=await q.execute<RowDataPacket[]>('SELECT assigned_physical_copy_id FROM reservations WHERE reservation_id=?',[insert.insertId])
          if(!assigned[0]?.assigned_physical_copy_id)throw new Error('Scheduled preparation did not assign a copy under the circulation lock.')
          await q.execute("UPDATE borrowing_schedules SET status='prepared',reservation_id=?,last_reason=NULL,updated_at=NOW() WHERE schedule_id=?",[insert.insertId,r.schedule_id]);return {prepared:1,finished:0}
        },true)
        prepared+=result.prepared;finished+=result.finished;last=candidate;handled++
      }
      return {prepared,finished,available:true,nextCursor:last&&handled<batch.length?JSON.stringify({pickupDate:last.pickup_date_text,scheduleId:Number(last.schedule_id)}):null}
    },
  }
}
