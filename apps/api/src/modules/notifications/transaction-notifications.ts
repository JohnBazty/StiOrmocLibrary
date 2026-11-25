import type { Pool, PoolConnection } from '../../config/db.js'
import { bestEffort } from './best-effort.ts'

export type StaffTransactionAlert = {
  key: string
  title: string
  body: string
  type: string
  sourceType: string
  sourceId: number
  personUserId?: number | null
  librarianPath: string
  staffPath?: string
  adminPath?: string
  priority?: 'Normal' | 'Important' | 'Urgent'
}

type Executor = Pick<Pool | PoolConnection, 'execute'>

/**
 * Notifies all active Librarian, Staff, and Admin accounts with role-appropriate
 * action links so both staff and users receive notifications for every transaction.
 */
export async function notifyStaffRoles(executor: Executor, alert: StaffTransactionAlert): Promise<void> {
  const priority = alert.priority ?? 'Important'
  const staffPath = alert.staffPath ?? alert.librarianPath.replace('/librarian/', '/staff/')
  const adminPath = alert.adminPath ?? '/admin/audit-logs'
  const dedupeKey = `staff:${alert.key}`

  if (alert.personUserId) {
    await executor.execute(
      `INSERT INTO notifications
         (user_id, message_title, message_body, trigger_type, source_type, source_id, action_path,
          priority, dedupe_key, scheduled_for, delivered_at)
       SELECT DISTINCT a.user_id, ?, CONCAT(subject.full_name, ' (', subject.school_id, '): ', CAST(? AS text)),
              ?, ?, CAST(? AS bigint),
              CASE
                WHEN a.role = 'Staff' THEN ?
                WHEN a.role = 'Admin' THEN ?
                ELSE ?
              END,
              ?, ?, NOW(), NOW()
         FROM accounts a
         JOIN users u ON u.user_id = a.user_id
         JOIN users subject ON subject.user_id = ?
        WHERE a.role IN ('Librarian', 'Staff', 'Admin')
          AND a.account_status = 'Active'
          AND u.account_status = 'Active'
          AND a.user_id <> ?
       ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [
        alert.title,
        alert.body,
        alert.type,
        alert.sourceType,
        alert.sourceId,
        staffPath,
        adminPath,
        alert.librarianPath,
        priority,
        dedupeKey,
        alert.personUserId,
        alert.personUserId,
      ],
    )
    return
  }

  await executor.execute(
    `INSERT INTO notifications
       (user_id, message_title, message_body, trigger_type, source_type, source_id, action_path,
        priority, dedupe_key, scheduled_for, delivered_at)
     SELECT DISTINCT a.user_id, ?, ?, ?, ?, CAST(? AS bigint),
            CASE
              WHEN a.role = 'Staff' THEN ?
              WHEN a.role = 'Admin' THEN ?
              ELSE ?
            END,
            ?, ?, NOW(), NOW()
       FROM accounts a
       JOIN users u ON u.user_id = a.user_id
      WHERE a.role IN ('Librarian', 'Staff', 'Admin')
        AND a.account_status = 'Active'
        AND u.account_status = 'Active'
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [
      alert.title,
      alert.body,
      alert.type,
      alert.sourceType,
      alert.sourceId,
      staffPath,
      adminPath,
      alert.librarianPath,
      priority,
      dedupeKey,
    ],
  )
}

/**
 * Safe helper so staff notifications are delivered immediately on real databases
 * and full PGlite schemas without aborting transactions in minimal test fixtures
 * that omit full `accounts` or `users` columns.
 *
 * A failed statement aborts the whole Postgres transaction, and a later COMMIT then
 * silently rolls everything back. `bestEffort` confines a notification failure to
 * the notification itself so the caller's business write still commits.
 */
export async function notifyStaffRolesSafe(executor: Executor, alert: StaffTransactionAlert): Promise<void> {
  await bestEffort(executor, 'staff_notify', async () => {
    const [check] = await executor.execute(
      `SELECT COUNT(*) AS ok
         FROM information_schema.columns
        WHERE (table_name = 'accounts' AND column_name IN ('user_id', 'role', 'account_status'))
           OR (table_name = 'users' AND column_name IN ('user_id', 'full_name', 'school_id', 'account_status'))`,
    )
    const count = Number((check as Array<{ ok?: number | string }> | undefined)?.[0]?.ok ?? 0)
    if (count >= 7) await notifyStaffRoles(executor, alert)
  })
}
