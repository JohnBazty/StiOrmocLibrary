import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

/** Staff-only callers resolve a physical School ID, never a public QR credential. */
export async function resolveManualBorrower(q:Pick<PoolConnection,'execute'>,value:unknown) {
  const schoolId=typeof value==='string'?value.trim():''
  if(!/^[A-Za-z0-9][A-Za-z0-9 -]{1,49}$/.test(schoolId))throw new HttpError(422,'DESK_SCHOOL_ID_INVALID','Enter a valid School ID.')
  const [rows]=await q.execute<RowDataPacket[]>(`SELECT DISTINCT u.user_id FROM users u JOIN accounts a ON a.user_id=u.user_id
    WHERE LOWER(u.school_id)=LOWER(?) AND u.account_status='Active' AND a.account_status='Active'
      AND u.user_role IN ('Student','Faculty','Staff','Librarian') LIMIT 2`,[schoolId])
  if(rows.length!==1)throw new HttpError(422,'DESK_BORROWER_NOT_FOUND',rows.length?'This School ID matches more than one profile. Ask the Librarian to review it.':'No active library account matches this School ID.')
  return {userId:Number(rows[0].user_id)}
}
