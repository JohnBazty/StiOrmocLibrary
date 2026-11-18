import type { PoolConnection } from 'mysql2/promise'
import { isPostgres } from '../../config/sql-dialect.js'

type Alert = {
  key: string; title: string; body: string; sourceId: number; path: string; personUserId: number
  type: 'Overdue Penalty' | 'Reservation Arrival' | 'Printing Update'
}

/** Uses the caller's transaction. No emails, new queue, or shared read state. */
export async function notifyLibrarians(connection: Pick<PoolConnection, 'execute'>, alert: Alert) {
  const insert = isPostgres ? 'INSERT INTO' : 'INSERT IGNORE INTO'
  const now = isPostgres ? "(NOW() AT TIME ZONE 'UTC')" : 'NOW()'
  await connection.execute(`${insert} notifications
    (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,
     priority,dedupe_key,scheduled_for,delivered_at,notification_timestamp)
    SELECT DISTINCT a.user_id,?,CONCAT(subject.full_name,' (',subject.school_id,'): ',${isPostgres ? 'CAST(? AS text)' : '?'}),?,'Library Operations',${isPostgres ? 'CAST(? AS bigint)' : '?'},?,'Important',?,${now},${now},${now}
      FROM accounts a JOIN users u ON u.user_id=a.user_id JOIN users subject ON subject.user_id=?
     WHERE a.role='Librarian' AND a.account_status='Active' AND u.account_status='Active'
    ${isPostgres ? 'ON CONFLICT (user_id,dedupe_key) DO NOTHING' : ''}`,
  [alert.title, alert.body, alert.type, alert.sourceId, alert.path, `library:${alert.key}`,alert.personUserId])
}
