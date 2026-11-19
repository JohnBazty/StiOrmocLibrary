import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

/** Staff-only callers resolve a physical School ID, never a public QR credential. */
export async function resolveManualBorrower(q:Pick<PoolConnection,'execute'>,value:unknown,allowInactiveReturn=false) {
  const schoolId=typeof value==='string'?value.trim():''
  if(!/^[A-Za-z0-9][A-Za-z0-9 -]{1,49}$/.test(schoolId))throw new HttpError(422,'DESK_SCHOOL_ID_INVALID','Enter a valid School ID.')
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT DISTINCT u.user_id,u.full_name,u.school_id,u.user_role,u.course_or_strand FROM users u JOIN accounts a ON a.user_id=u.user_id
    WHERE LOWER(u.school_id)=LOWER(?) ${allowInactiveReturn?'':"AND u.account_status='Active' AND a.account_status='Active'"}
      AND u.user_role IN ('Student','Faculty','Staff','Librarian') LIMIT 2`,[schoolId])
  if(rows.length!==1)throw new HttpError(422,'DESK_BORROWER_NOT_FOUND',rows.length?'This School ID matches more than one profile. Ask the Librarian to review it.':'No active library account matches this School ID.')
  return {userId:Number(rows[0].user_id),name:rows[0].full_name,schoolId:rows[0].school_id,role:rows[0].user_role,program:rows[0].course_or_strand}
}
