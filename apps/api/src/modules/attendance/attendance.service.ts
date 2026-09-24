import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { issueAttendanceCredential, validateAttendanceCredential } from './attendance-credential.service.ts'
import { parseAttendanceScan, parseCapacityUpdate } from './attendance.validation.ts'

export type AttendanceActor = { accountId?: number; role?: string }

async function actorUserId(executor: Pool | PoolConnection, actor: AttendanceActor) {
  const accountId = Number(actor.accountId)
  if (!Number.isSafeInteger(accountId) || accountId < 1) throw new HttpError(401,'JWT_REQUIRED','A valid login is required.')
  const [accounts] = await executor.execute<RowDataPacket[]>(
    'SELECT user_id FROM accounts WHERE account_id=? AND user_id IS NOT NULL LIMIT 1', [accountId],
  )
  if (accounts[0]?.user_id) return Number(accounts[0].user_id)
  const [legacy] = await executor.execute<RowDataPacket[]>('SELECT user_id FROM users WHERE user_id=? LIMIT 1',[accountId])
  if (!legacy[0]) throw new HttpError(422,'ATTENDANCE_PROFILE_NOT_LINKED','This login is not linked to a library profile.')
  return Number(legacy[0].user_id)
}

function roleMessage(role: string) {
  if (role === 'Student') return 'Student successfully logged in.'
  if (role === 'Faculty') return 'Faculty successfully logged in.'
  return 'Staff successfully logged in.'
}

export function createAttendanceService(pool: Pool = db) {
  return {
    async myPass(actor: AttendanceActor) {
      const userId = await actorUserId(pool, actor)
      const credential = await issueAttendanceCredential(pool, userId)
      const [[profile], [history], [summary]] = await Promise.all([
        pool.execute<RowDataPacket[]>(
          `SELECT user_id,school_id,full_name,user_role,course_or_strand,section,account_status
             FROM users WHERE user_id=? LIMIT 1`, [userId],
        ),
        pool.execute<RowDataPacket[]>(
          `SELECT log_id,DATE_FORMAT(attendance_date,'%Y-%m-%d') attendance_date,
                  TIME_FORMAT(time_in,'%h:%i %p') time_in,
                  CASE WHEN time_out IS NULL THEN NULL ELSE TIME_FORMAT(time_out,'%h:%i %p') END time_out,
                  reason_for_visit purpose,CASE WHEN time_out IS NULL THEN 'Inside' ELSE 'Exited' END presence
             FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC,time_in DESC LIMIT 50`, [userId],
        ),
        pool.execute<RowDataPacket[]>(
          `SELECT SUM(attendance_date BETWEEN DATE_FORMAT(CURDATE(),'%Y-%m-01') AND LAST_DAY(CURDATE())) visits_this_month,
                  MAX(CASE WHEN attendance_date=CURDATE() THEN time_in END) today_check_in,
                  (SELECT reason_for_visit FROM attendance_logs WHERE user_id=?
                    GROUP BY reason_for_visit ORDER BY COUNT(*) DESC,reason_for_visit LIMIT 1) common_purpose
             FROM attendance_logs WHERE user_id=?`, [userId,userId],
        ),
      ])
      return {
        profile: { userId, schoolId:String(profile[0].school_id), name:String(profile[0].full_name), role:String(profile[0].user_role), program:profile[0].course_or_strand, section:profile[0].section },
        credential: { credentialId:credential.credentialId, publicId:credential.publicId, payload:credential.payload, issuedAt:credential.issuedAt },
        summary: { visitsThisMonth:Number(summary[0]?.visits_this_month??0), todayCheckIn:summary[0]?.today_check_in??null, commonPurpose:summary[0]?.common_purpose??null },
        history,
      }
    },

    async resolve(body: unknown) {
      const input = parseAttendanceScan(body,'resolve')
      const visitor = await validateAttendanceCredential(pool,input.qrPayload)
      const [[open], [profile]] = await Promise.all([
        pool.execute<RowDataPacket[]>(
          `SELECT log_id,attendance_date,time_in,reason_for_visit FROM attendance_logs
            WHERE user_id=? AND time_out IS NULL ORDER BY attendance_date DESC,time_in DESC LIMIT 1`, [visitor.userId],
        ),
        pool.execute<RowDataPacket[]>(
          `SELECT p.seat_capacity,
                  (SELECT COUNT(*) FROM attendance_logs WHERE attendance_date=CURDATE() AND time_out IS NULL) current_occupancy
             FROM library_profile_settings p WHERE p.settings_id=1`,
        ),
      ])
      return { visitor, openVisit:open[0]??null, occupancy:{ current:Number(profile[0]?.current_occupancy??0), capacity:Number(profile[0]?.seat_capacity??80) } }
    },

    async checkIn(actor: AttendanceActor, body: unknown) {
      const input = parseAttendanceScan(body,'check-in')
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const staffUserId = await actorUserId(connection,actor)
        const [idempotent] = await connection.execute<RowDataPacket[]>(
          `SELECT al.log_id,al.user_id,u.full_name,u.school_id,u.user_role,al.checked_in_at
             FROM attendance_logs al JOIN users u ON u.user_id=al.user_id
            WHERE al.entry_request_id=? LIMIT 1`, [input.requestId],
        )
        if (idempotent[0]) {
          const row=idempotent[0]
          await connection.rollback()
          return { duplicate:true, message:roleMessage(String(row.user_role)), visitor:{userId:Number(row.user_id),name:String(row.full_name),schoolId:String(row.school_id),role:String(row.user_role)}, attendance:{logId:Number(row.log_id),checkedInAt:row.checked_in_at,purpose:input.purpose} }
        }
        const visitor = await validateAttendanceCredential(connection,input.qrPayload,true)
        const [profileRows] = await connection.execute<RowDataPacket[]>(
          'SELECT seat_capacity FROM library_profile_settings WHERE settings_id=1 FOR UPDATE',
        )
        const capacity = Number(profileRows[0]?.seat_capacity??80)
        const [openRows] = await connection.execute<RowDataPacket[]>(
          `SELECT log_id,checked_in_at FROM attendance_logs WHERE user_id=? AND time_out IS NULL
            ORDER BY attendance_date DESC,time_in DESC LIMIT 1 FOR UPDATE`, [visitor.userId],
        )
        if (openRows[0]) throw new HttpError(409,'ATTENDANCE_ALREADY_INSIDE',`${visitor.name} is already checked in.`)
        const [occupancyRows] = await connection.execute<RowDataPacket[]>(
          'SELECT COUNT(*) current_occupancy FROM attendance_logs WHERE attendance_date=CURDATE() AND time_out IS NULL',
        )
        const current = Number(occupancyRows[0]?.current_occupancy??0)
        if (current >= capacity) throw new HttpError(409,'LIBRARY_AT_CAPACITY','The library is currently at full capacity.',{current,capacity})
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO attendance_logs
             (user_id,attendance_date,time_in,checked_in_at,time_out,checked_out_at,reason_for_visit,
              qr_reference,qr_credential_id,scan_method,checked_in_by_user_id,entry_request_id)
           VALUES (?,CURDATE(),CURTIME(),NOW(),NULL,NULL,?,?,?,'Permanent QR',?,?)`,
          [visitor.userId,input.purpose,visitor.publicId,visitor.credentialId,staffUserId,input.requestId],
        )
        await connection.execute('UPDATE attendance_qr_credentials SET last_used_at=NOW(),updated_at=NOW() WHERE credential_id=?',[visitor.credentialId])
        const actionPath=visitor.role==='Faculty'?'/faculty/attendance':visitor.role==='Student'?'/student/attendance':'/admin/attendance'
        await connection.execute(
          `INSERT IGNORE INTO notifications
             (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,delivered_at)
           VALUES (?,'Library check-in',?,'Attendance','Attendance',?,?,'Normal',?,NOW())`,
          [visitor.userId,`Your library entry was recorded for ${input.purpose}.`,insert.insertId,actionPath,`attendance:checkin:${insert.insertId}`],
        )
        await connection.commit()
        return {
          duplicate:false,message:roleMessage(visitor.role),visitor,
          attendance:{logId:Number(insert.insertId),checkedInAt:new Date(),purpose:input.purpose},
          occupancy:{current:current+1,capacity,available:Math.max(0,capacity-current-1)},
        }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async checkOut(actor: AttendanceActor, body: unknown) {
      const input = parseAttendanceScan(body,'check-out')
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const staffUserId = await actorUserId(connection,actor)
        const visitor = await validateAttendanceCredential(connection,input.qrPayload,true)
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT log_id,reason_for_visit FROM attendance_logs WHERE user_id=? AND time_out IS NULL
            ORDER BY attendance_date DESC,time_in DESC LIMIT 1 FOR UPDATE`, [visitor.userId],
        )
        if (!rows[0]) throw new HttpError(409,'ATTENDANCE_NOT_INSIDE',`${visitor.name} does not have an open library visit.`)
        await connection.execute(
          `UPDATE attendance_logs SET time_out=CURTIME(),checked_out_at=NOW(),checked_out_by_user_id=? WHERE log_id=?`,
          [staffUserId,rows[0].log_id],
        )
        const [[profile],[occupancy]] = await Promise.all([
          connection.execute<RowDataPacket[]>('SELECT seat_capacity FROM library_profile_settings WHERE settings_id=1'),
          connection.execute<RowDataPacket[]>('SELECT COUNT(*) current_occupancy FROM attendance_logs WHERE attendance_date=CURDATE() AND time_out IS NULL'),
        ])
        await connection.commit()
        const current=Number(occupancy[0]?.current_occupancy??0),capacity=Number(profile[0]?.seat_capacity??80)
        return {message:`${visitor.role==='Student'?'Student':visitor.role==='Faculty'?'Faculty':'Staff'} successfully logged out.`,visitor,attendance:{logId:Number(rows[0].log_id),checkedOutAt:new Date()},occupancy:{current,capacity,available:Math.max(0,capacity-current)}}
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async capacity() {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT p.seat_capacity,
                (SELECT COUNT(*) FROM attendance_logs WHERE attendance_date=CURDATE() AND time_out IS NULL) current_occupancy
           FROM library_profile_settings p WHERE p.settings_id=1`,
      )
      const capacity=Number(rows[0]?.seat_capacity??80),current=Number(rows[0]?.current_occupancy??0)
      return {current,capacity,available:Math.max(0,capacity-current),percentage:capacity?Math.round(current/capacity*100):0,overCapacity:current>capacity}
    },

    async updateCapacity(actor: AttendanceActor, body: unknown) {
      const input=parseCapacityUpdate(body),connection=await pool.getConnection()
      try {
        await connection.beginTransaction()
        const staffUserId=await actorUserId(connection,actor)
        const [rows]=await connection.execute<RowDataPacket[]>('SELECT seat_capacity FROM library_profile_settings WHERE settings_id=1 FOR UPDATE')
        const previous=Number(rows[0]?.seat_capacity??80)
        await connection.execute('UPDATE library_profile_settings SET seat_capacity=?,updated_at=NOW() WHERE settings_id=1',[input.capacity])
        await connection.execute(
          `INSERT INTO library_capacity_changes(previous_capacity,new_capacity,change_reason,changed_by_user_id,changed_at)
           VALUES (?,?,?,?,NOW())`,[previous,input.capacity,input.reason,staffUserId],
        )
        const [occupancy]=await connection.execute<RowDataPacket[]>('SELECT COUNT(*) current_occupancy FROM attendance_logs WHERE attendance_date=CURDATE() AND time_out IS NULL')
        await connection.commit()
        const current=Number(occupancy[0]?.current_occupancy??0)
        return {previousCapacity:previous,current,capacity:input.capacity,available:Math.max(0,input.capacity-current),percentage:Math.round(current/input.capacity*100),overCapacity:current>input.capacity,reason:input.reason}
      } catch(error){await connection.rollback();throw error}finally{connection.release()}
    },
  }
}

export const attendanceService=createAttendanceService()
