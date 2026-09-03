import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

export type FinePolicy = { hourlyRate: number; dailyRate: number; maximumPenalty: number }
export type FineCalendar = { openDays: Set<number>; closedDates: Set<string> }

const DEFAULT_POLICY: FinePolicy = { hourlyRate: 2, dailyRate: 10, maximumPenalty: 500 }
const DEFAULT_OPEN_DAYS = new Set([1,2,3,4,5,6])

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
function operatingDay(value:string,calendar:FineCalendar){const date=utcDate(value);const day=((date.getUTCDay()+6)%7)+1;return calendar.openDays.has(day)&&!calendar.closedDates.has(value)}

export function calculateOperatingFine(dueAt:Date,evaluatedAt:Date,policy:FinePolicy=DEFAULT_POLICY,calendar:FineCalendar={openDays:DEFAULT_OPEN_DAYS,closedDates:new Set()}){
  if(evaluatedAt<=dueAt)return{amount:0,rawAmount:0,units:0,rate:policy.hourlyRate,basis:'Hourly' as const,capApplied:false}
  const dueDate=manilaDate(dueAt);const evaluatedDate=manilaDate(evaluatedAt)
  if(dueDate===evaluatedDate){
    const units=Math.ceil((evaluatedAt.getTime()-dueAt.getTime())/3_600_000);const rawAmount=units*policy.hourlyRate
    return{amount:Math.min(rawAmount,policy.maximumPenalty),rawAmount,units,rate:policy.hourlyRate,basis:'Hourly' as const,capApplied:rawAmount>policy.maximumPenalty}
  }
  let units=0;for(let date=nextDate(dueDate);date<=evaluatedDate;date=nextDate(date)){if(operatingDay(date,calendar))units+=1}
  const rawAmount=units*policy.dailyRate
  return{amount:Math.min(rawAmount,policy.maximumPenalty),rawAmount,units,rate:policy.dailyRate,basis:'Daily' as const,capApplied:rawAmount>policy.maximumPenalty}
}

export async function loadFineContext(executor:Pool|PoolConnection,from:Date,to:Date){
  const [policies]=await executor.execute<RowDataPacket[]>(
    `SELECT hourly_rate,daily_rate,maximum_penalty FROM fine_policy_versions
      WHERE is_active=1 AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?)
      ORDER BY effective_from DESC,fine_policy_id DESC LIMIT 1`,[to,from],
  )
  const policyRow=policies[0]
  const policy:FinePolicy=policyRow?{hourlyRate:Number(policyRow.hourly_rate),dailyRate:Number(policyRow.daily_rate),maximumPenalty:Number(policyRow.maximum_penalty)}:DEFAULT_POLICY
  const [schedule]=await executor.execute<RowDataPacket[]>('SELECT day_of_week,is_open FROM library_operating_schedule')
  const openDays=schedule.length?new Set(schedule.filter((row)=>Boolean(row.is_open)).map((row)=>Number(row.day_of_week))):DEFAULT_OPEN_DAYS
  const [closures]=await executor.execute<RowDataPacket[]>('SELECT closed_date FROM library_closed_days WHERE closed_date BETWEEN DATE(?) AND DATE(?)',[from,to])
  return{policy,calendar:{openDays,closedDates:new Set(closures.map((row)=>sqlDate(row.closed_date)))}}
}
