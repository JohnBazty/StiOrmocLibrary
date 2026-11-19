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
export function scheduleDates(now:Date,week:Day[],closed:Set<string>) {
  return Array.from({length:7},(_,i)=>nextDate(manilaDate(now),i+1)).filter(date=>pickupWindow(date,week,closed)!==null)
}
export async function loadScheduleCalendar(q:Pick<PoolConnection,'execute'>,now:Date) {
  const [week]=await q.execute<RowDataPacket[]>('SELECT day_of_week,is_open,opens_at,closes_at FROM library_operating_schedule')
  const [closed]=await q.execute<RowDataPacket[]>("SELECT to_char(closed_date,'YYYY-MM-DD') AS closed_date FROM library_closed_days WHERE closed_date BETWEEN ?::date AND ?::date",[nextDate(manilaDate(now),-374),nextDate(manilaDate(now),8)])
  return {week:week as Day[],closed:new Set(closed.map(r=>String(r.closed_date)))}
}
/** Scheduled requests have a fixed pickup-day closing deadline, even before Mark ready. */
export async function requireScheduledPickup(q:Pick<PoolConnection,'execute'>,row:RowDataPacket,now:Date) {
  if(!row.scheduled_pickup_date) return null
  const date=row.scheduled_pickup_date instanceof Date ? row.scheduled_pickup_date.toISOString().slice(0,10) : String(row.scheduled_pickup_date).slice(0,10)
  const calendar=await loadScheduleCalendar(q,now), window=pickupWindow(date,calendar.week,calendar.closed)
  if(!window || now>=window.closeAt) throw new HttpError(422,'SCHEDULE_PICKUP_CLOSED','This scheduled pickup date is closed or its collection deadline has passed. Choose another date.')
  return window.closeAt
}
