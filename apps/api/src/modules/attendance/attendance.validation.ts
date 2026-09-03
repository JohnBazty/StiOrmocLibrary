import { HttpError } from '../../core/http-error.ts'
export type AttendancePeriod = 'daily' | 'weekly' | 'monthly' | 'semester'
export type AttendanceFilters = { period: AttendancePeriod; date?: string; weekStart?: string; year?: number; month?: number; academicTermId?: number; q: string; role: string; purpose: string; presence: string; page: number; limit: number }
const isoDate = /^\d{4}-\d{2}-\d{2}$/
export function parseAttendanceFilters(query: Record<string, unknown>): AttendanceFilters {
  const period = String(query.period ?? 'daily') as AttendancePeriod
  if (!['daily','weekly','monthly','semester'].includes(period)) throw new HttpError(422,'INVALID_ATTENDANCE_PERIOD','Choose a valid attendance period.')
  const page=Math.max(1,Number.parseInt(String(query.page??'1'),10)||1), limit=Math.min(100,Math.max(1,Number.parseInt(String(query.limit??'25'),10)||25))
  const date=query.date?String(query.date):undefined, weekStart=query.week_start?String(query.week_start):undefined
  const year=query.year?Number(query.year):undefined, month=query.month?Number(query.month):undefined, academicTermId=query.academic_term_id?Number(query.academic_term_id):undefined
  if(date&&!isoDate.test(date)) throw new HttpError(422,'INVALID_ATTENDANCE_DATE','The daily date must use YYYY-MM-DD.')
  if(weekStart&&!isoDate.test(weekStart)) throw new HttpError(422,'INVALID_ATTENDANCE_WEEK','The week start must use YYYY-MM-DD.')
  if(period==='monthly'&&(!Number.isInteger(year)||year!<2000||!Number.isInteger(month)||month!<1||month!>12)) throw new HttpError(422,'INVALID_ATTENDANCE_MONTH','Select a valid month and year.')
  if(period==='semester'&&(!Number.isSafeInteger(academicTermId)||academicTermId!<1)) throw new HttpError(422,'ACADEMIC_TERM_REQUIRED','Select an academic term for a semester report.')
  const role=String(query.role??''),purpose=String(query.purpose??''),presence=String(query.presence??'')
  if(role&&!['Admin','Librarian','Student','Faculty'].includes(role)) throw new HttpError(422,'INVALID_ATTENDANCE_ROLE','Choose a valid account role.')
  if(presence&&!['inside','exited'].includes(presence)) throw new HttpError(422,'INVALID_ATTENDANCE_PRESENCE','Choose a valid presence state.')
  return {period,date,weekStart,year,month,academicTermId,q:String(query.q??'').trim().slice(0,150),role,purpose:purpose.slice(0,50),presence,page,limit}
}
