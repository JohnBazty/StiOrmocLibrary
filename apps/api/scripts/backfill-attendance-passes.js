import { db } from '../src/config/db.js'
import { issueAttendanceCredential } from '../src/modules/attendance/attendance-credential.service.ts'

try {
  const [rows] = await db.execute(
    `SELECT u.user_id
       FROM users u
       LEFT JOIN attendance_qr_credentials c ON c.user_id=u.user_id
      WHERE c.credential_id IS NULL
      ORDER BY u.user_id`,
  )
  let issued = 0
  for (const row of rows) {
    await issueAttendanceCredential(db, Number(row.user_id))
    issued += 1
  }
  console.log(JSON.stringify({ success: true, issued, checked: rows.length }))
} finally {
  await db.end()
}
