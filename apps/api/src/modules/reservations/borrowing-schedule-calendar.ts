import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { manilaDate, manilaInstant, nextDate } from '../attendance/attendance-intervals.ts'
import { HttpError } from '../../core/http-error.ts'

type Day = {day_of_week:number;is_open:boolean;opens_at:string;closes_at:string}
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date
function openDay(date:string,week:Day[],closed:Set<string>) {
  if(!validDate(date) || closed.has(date)) return undefined
  const weekday=((new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7)+1
  return week.find(d=>d.day_of_week===weekday && d.is_open && d.opens_at && d.closes_at && d.opens_at<d.closes_at)
}
export function pickupWindow(date:string,week:Day[],closed:Set<string>) {
  const day=openDay(date,week,closed)
  if(!day) return null
  for(let offset=1;offset<=366;offset++) {
    const previous=nextDate(date,-offset), preparation=openDay(previous,week,closed)
    if(preparation) return {prepareAt:manilaInstant(previous,preparation.opens_at),closeAt:manilaInstant(date,day.closes_at)}
  }
  return null
}
/** A semester is at most about six months; this only bounds the loop. */
const MAX_SCHEDULE_DAYS=200
/** Open library days from Manila tomorrow through the last day of the current semester. No semester, no dates. */
export function scheduleDates(now:Date,week:Day[],closed:Set<string>,lastDate:string|null) {
  if(!lastDate||!validDate(lastDate))return []
  const dates:string[]=[]
  for(let i=1;i<=MAX_SCHEDULE_DAYS;i++){
    const date=nextDate(manilaDate(now),i)
    if(date>lastDate)break
    if(pickupWindow(date,week,closed)!==null)dates.push(date)
  }
  return dates
}
/**
 * Last day of the current semester: the started, not yet ended enrollment semester first,
 * otherwise the active academic term. Null when neither is set up.
 */
export async function currentSemesterLastDate(q:Pick<PoolConnection,'execute'>,now:Date) {
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT to_char(last_day,'YYYY-MM-DD') AS last_day FROM (
      SELECT end_date AS last_day,1 AS priority FROM enrollment_semesters WHERE started_at IS NOT NULL AND ended_at IS NULL
      UNION ALL SELECT ends_on,0 FROM academic_terms WHERE is_active=1) terms
    WHERE last_day>=?::date ORDER BY priority DESC,last_day ASC LIMIT 1`,[manilaDate(now)])
  return rows[0]?.last_day?String(rows[0].last_day):null
}
export async function loadScheduleCalendar(q:Pick<PoolConnection,'execute'>,now:Date) {
  const [week]=await q.execute<RowDataPacket[]>('SELECT day_of_week,is_open,opens_at,closes_at FROM library_operating_schedule')
  const lastDate=await currentSemesterLastDate(q,now)
  const until=lastDate&&lastDate>nextDate(manilaDate(now),8)?lastDate:nextDate(manilaDate(now),8)
  const [closed]=await q.execute<RowDataPacket[]>("SELECT to_char(closed_date,'YYYY-MM-DD') AS closed_date FROM library_closed_days WHERE closed_date BETWEEN ?::date AND ?::date",[nextDate(manilaDate(now),-374),until])
  return {week:week as Day[],closed:new Set(closed.map(r=>String(r.closed_date))),lastDate}
}
/** Scheduled requests have a fixed pickup-day closing deadline, even before Mark ready. */
export async function requireScheduledPickup(q:Pick<PoolConnection,'execute'>,row:RowDataPacket,now:Date) {
  if(!row.scheduled_pickup_date) return null
  const date=row.scheduled_pickup_date instanceof Date ? row.scheduled_pickup_date.toISOString().slice(0,10) : String(row.scheduled_pickup_date).slice(0,10)
  const calendar=await loadScheduleCalendar(q,now), window=pickupWindow(date,calendar.week,calendar.closed)
  if(!window || now>=window.closeAt) throw new HttpError(422,'SCHEDULE_PICKUP_CLOSED','This scheduled pickup date is closed or its collection deadline has passed. Choose another date.')
  return window.closeAt
}
