import type { Pool, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { loadScheduleCalendar, pickupWindow } from './borrowing-schedule-calendar.ts'
import { parseQueueFilters } from './reservation.validation.ts'

/** Staff planning view only: never allocates copies or advances requests. */
export async function queryBorrowingSchedules(database:Pool,query:Record<string,unknown>,now=new Date()) {
  const filters=parseQueueFilters(query)
  for(const date of [filters.dateFrom,filters.dateTo]) {
    if(date && (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date))throw new HttpError(422,'RESERVATION_FILTER_INVALID','Choose valid pickup dates.')
  }
  if(filters.dateFrom&&filters.dateTo&&filters.dateFrom>filters.dateTo)throw new HttpError(422,'RESERVATION_FILTER_INVALID','The start date must be on or before the end date.')
  const pagination={page:filters.page,limit:filters.limit,total:0,pages:0}
  const [ready]=await database.execute<RowDataPacket[]>("SELECT to_regclass('public.borrowing_schedules') IS NOT NULL AS enabled")
  if(!ready[0]?.enabled)return {available:false,items:[],pagination}
  const where=["s.status='scheduled'"],values:unknown[]=[]
  if(filters.role){where.push('u.user_role=?');values.push(filters.role)}
  if(filters.user){where.push('(u.full_name ILIKE ? OR u.school_id ILIKE ? OR t.title ILIKE ?)');values.push(...Array(3).fill(`%${filters.user}%`))}
  if(filters.dateFrom){where.push('s.pickup_date>=?::date');values.push(filters.dateFrom)}
  if(filters.dateTo){where.push('s.pickup_date<=?::date');values.push(filters.dateTo)}
  const from=`FROM borrowing_schedules s JOIN users u ON u.user_id=s.user_id JOIN titles t ON t.title_id=s.title_id WHERE ${where.join(' AND ')}`
  const offset=Math.min((filters.page-1)*filters.limit,Number.MAX_SAFE_INTEGER)
  const [[rows],[counts],calendar]=await Promise.all([
    database.execute<RowDataPacket[]>(`SELECT s.schedule_id,s.title_id,t.title,u.full_name,u.school_id,u.user_role,
      to_char(s.pickup_date,'YYYY-MM-DD') AS pickup_date,s.created_at,s.last_reason ${from}
      ORDER BY s.pickup_date,s.created_at,s.schedule_id LIMIT ? OFFSET ?`,[...values,filters.limit,offset]),
    database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${from}`,values),
    loadScheduleCalendar(database,now),
  ])
  const items=rows.map(r=>{
    const window=pickupWindow(String(r.pickup_date),calendar.week,calendar.closed)
    return {scheduleId:Number(r.schedule_id),titleId:Number(r.title_id),title:String(r.title),userName:String(r.full_name),schoolId:String(r.school_id),userRole:String(r.user_role),
      pickupDate:String(r.pickup_date),requestedAt:r.created_at,preparationStartsAt:window?.prepareAt.toISOString()??null,reason:r.last_reason?String(r.last_reason):null}
  })
  const total=Number(counts[0]?.total??0)
  return {available:true,items,pagination:{...pagination,total,pages:Math.ceil(total/filters.limit)}}
}
