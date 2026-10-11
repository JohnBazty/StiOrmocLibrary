import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { AttendanceFilters } from './attendance.validation.ts'
import type { AttendanceRange } from './attendance.repository.ts'
import { concurrentPeak, localTimestamp, manilaInstant, nextDate } from './attendance-intervals.ts'

/** Read overlapping intervals, including visits that began before the selected period. */
export async function concurrentAttendanceReport(pool:Pick<Pool,'execute'>,filters:AttendanceFilters,range:AttendanceRange,servicePurposes:string[],now=new Date()) {
 const from=manilaInstant(range.from,'00:00:00'),to=manilaInstant(nextDate(range.to),'00:00:00')
 const clauses=['COALESCE(al.checked_in_at,al.attendance_date+al.time_in) < (?::timestamptz AT TIME ZONE \'Asia/Manila\')',
  '(al.time_out IS NULL OR COALESCE(al.checked_out_at,al.attendance_date+al.time_out) > (?::timestamptz AT TIME ZONE \'Asia/Manila\'))']
 const values:any[]=[to,from]
 if(filters.q){clauses.push('(u.full_name LIKE ? OR u.school_id LIKE ? OR u.email LIKE ?)');values.push(...Array(3).fill(`%${filters.q}%`))}
 if(filters.role){clauses.push('u.user_role=?');values.push(filters.role)}
 if(filters.purpose){clauses.push('al.reason_for_visit=?');values.push(filters.purpose)}
 if(filters.presence){clauses.push(filters.presence==='inside'?'al.time_out IS NULL':'al.time_out IS NOT NULL')}
 const [data]=await pool.execute<RowDataPacket[]>(`SELECT to_char(COALESCE(al.checked_in_at,al.attendance_date+al.time_in),'YYYY-MM-DD"T"HH24:MI:SS') AS started,
  CASE WHEN al.time_out IS NULL THEN NULL ELSE to_char(COALESCE(al.checked_out_at,al.attendance_date+al.time_out),'YYYY-MM-DD"T"HH24:MI:SS') END AS ended,
  al.reason_for_visit AS purpose,al.seat_visit FROM attendance_logs al JOIN users u ON u.user_id=al.user_id WHERE ${clauses.join(' AND ')}`,values)
 const intervals=data.map(r=>({start:localTimestamp(r.started),end:r.ended==null?null:localTimestamp(r.ended),purpose:r.seat_visit===true?'Seat':r.seat_visit===false?'Service':String(r.purpose)}))
 const result=concurrentPeak(intervals,from.getTime(),to.getTime(),now.getTime(),[...servicePurposes,'Service'])
 return {peak_occupancy:result.peak,peak_occupancy_at:result.peakAt==null?null:new Date(result.peakAt).toISOString()}
}
