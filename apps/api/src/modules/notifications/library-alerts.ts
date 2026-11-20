import type { PoolConnection } from '../../config/db.js'

type Alert = {
  key: string; title: string; body: string; sourceId: number; path: string; personUserId: number
  type: 'Overdue Penalty' | 'Reservation Arrival' | 'Printing Update' | string
}

/** Uses the caller's transaction. Notifies all active Librarian, Staff, and Admin accounts. */
export async function notifyLibrarians(connection: Pick<PoolConnection, 'execute'>, alert: Alert) {
  const insert = 'INSERT INTO'
  // Session time is Asia/Manila (078), the same clock the reader and other notifications use.
  const now = "NOW()"
  const staffPath = alert.path.replace('/librarian/', '/staff/')
  await connection.execute(`${insert} notifications
    (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,
     priority,dedupe_key,scheduled_for,delivered_at,notification_timestamp)
    SELECT DISTINCT a.user_id,?,CONCAT(subject.full_name,' (',subject.school_id,'): ',CAST(? AS text)),?,'Library Operations',CAST(? AS bigint),
      CASE WHEN a.role='Staff' THEN ? WHEN a.role='Admin' THEN '/admin/audit-logs' ELSE ? END,
      'Important',?,${now},${now},${now}
      FROM accounts a JOIN users u ON u.user_id=a.user_id JOIN users subject ON subject.user_id=?
     WHERE a.role IN ('Librarian','Staff','Admin') AND a.account_status='Active' AND u.account_status='Active'
    ON CONFLICT (user_id,dedupe_key) DO NOTHING`,
  [alert.title, alert.body, alert.type, alert.sourceId, staffPath, alert.path, `library:${alert.key}`, alert.personUserId])
}
