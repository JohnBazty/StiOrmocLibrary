import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'

export type FinePolicy = { hourlyRate: number; dailyRate: number; maximumPenalty: number }
/** closesAt maps ISO weekday (1 = Monday) to `library_operating_schedule.closes_at` (HH:MM[:SS]). */
export type FineCalendar = { openDays: Set<number>; closedDates: Set<string>; closesAt?: Map<number, string> }

const DEFAULT_POLICY: FinePolicy = { hourlyRate: 2, dailyRate: 10, maximumPenalty: 500 }
const DEFAULT_OPEN_DAYS = new Set([1,2,3,4,5,6])
const DEFAULT_CLOSES_AT = '17:00:00'

function manilaDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value)
  const get=(type:string)=>parts.find((part)=>part.type===type)?.value??''
  return `${get('year')}-${get('month')}-${get('day')}`
}
function sqlDate(value: unknown) {
  if (value instanceof Date) return manilaDate(value)
  const text = String(value ?? '')
  const match = text.match(/^\d{4}-\d{2}-\d{2}/)
  if (match) return match[0]
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : manilaDate(parsed)
}
function utcDate(value:string){const [year,month,day]=value.split('-').map(Number);return new Date(Date.UTC(year,month-1,day,12))}
function nextDate(value:string){const date=utcDate(value);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10)}
function weekday(value:string){return ((utcDate(value).getUTCDay()+6)%7)+1}
function operatingDay(value:string,calendar:FineCalendar){return calendar.openDays.has(weekday(value))&&!calendar.closedDates.has(value)}
function closingOn(date:string,calendar:FineCalendar){
  const time=/^\d{2}:\d{2}(:\d{2})?/.exec(calendar.closesAt?.get(weekday(date))??'')?.[0]??DEFAULT_CLOSES_AT
  const closing=new Date(`${date}T${time.length===5?`${time}:00`:time}+08:00`)
  return Number.isNaN(closing.getTime())?new Date(`${date}T${DEFAULT_CLOSES_AT}+08:00`):closing
}

/** Due date: started hours until closing, at most one day's rate. Later: library days, never below the due-date amount. */
export function calculateOperatingFine(dueAt:Date,evaluatedAt:Date,policy:FinePolicy=DEFAULT_POLICY,calendar:FineCalendar={openDays:DEFAULT_OPEN_DAYS,closedDates:new Set()}){
  const result=(rawAmount:number,units:number,basis:'Hourly'|'Daily')=>({amount:Math.min(rawAmount,policy.maximumPenalty),rawAmount,units,rate:basis==='Hourly'?policy.hourlyRate:policy.dailyRate,basis,capApplied:rawAmount>policy.maximumPenalty})
  if(evaluatedAt<=dueAt)return result(0,0,'Hourly')
  const dueDate=manilaDate(dueAt);const evaluatedDate=manilaDate(evaluatedAt)
  const hoursEnd=Math.min(evaluatedAt.getTime(),closingOn(dueDate,calendar).getTime())
  const hours=Math.max(0,Math.ceil((hoursEnd-dueAt.getTime())/3_600_000))
  // A due date that reaches the daily rate is reported as one day, so units × rate always equals the amount.
  const dueDay=hours*policy.hourlyRate>=policy.dailyRate?result(policy.dailyRate,1,'Daily'):result(hours*policy.hourlyRate,hours,'Hourly')
  if(dueDate===evaluatedDate)return dueDay
  let days=0;for(let date=nextDate(dueDate);date<=evaluatedDate;date=nextDate(date)){if(operatingDay(date,calendar))days+=1}
  return days>0&&days*policy.dailyRate>=dueDay.rawAmount?result(days*policy.dailyRate,days,'Daily'):dueDay
}

/** Faculty pay no automatic overdue fine (Ethan, 2026-11-19); they are charged only for lost or damaged books. */
export function overdueFineApplies(role: unknown) { return role !== 'Faculty' }

export async function loadFineContext(executor:Pool|PoolConnection,from:Date,to:Date){
  const [policies]=await executor.execute<RowDataPacket[]>(
    `SELECT hourly_rate,daily_rate,maximum_penalty FROM fine_policy_versions
      WHERE is_active=1 AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?)
      ORDER BY effective_from DESC,fine_policy_id DESC LIMIT 1`,[to,from],
  )
  const policyRow=policies[0]
  const policy:FinePolicy=policyRow?{hourlyRate:Number(policyRow.hourly_rate),dailyRate:Number(policyRow.daily_rate),maximumPenalty:Number(policyRow.maximum_penalty)}:DEFAULT_POLICY
  const [schedule]=await executor.execute<RowDataPacket[]>('SELECT day_of_week,is_open,closes_at FROM library_operating_schedule')
  const openDays=schedule.length?new Set(schedule.filter((row)=>Boolean(row.is_open)).map((row)=>Number(row.day_of_week))):DEFAULT_OPEN_DAYS
  const closesAt=new Map(schedule.filter((row)=>row.closes_at!=null).map((row)=>[Number(row.day_of_week),String(row.closes_at)]))
  const [closures]=await executor.execute<RowDataPacket[]>('SELECT closed_date FROM library_closed_days WHERE closed_date BETWEEN DATE(?) AND DATE(?)',[from,to])
  return{policy,calendar:{openDays,closesAt,closedDates:new Set(closures.map((row)=>sqlDate(row.closed_date)))}}
}
