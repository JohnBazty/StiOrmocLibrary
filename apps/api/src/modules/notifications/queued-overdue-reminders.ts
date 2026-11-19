import { db, type Pool, type ResultSetHeader } from '../../config/db.js'
import { overdueReminderKeySql } from '../dashboard/desk-dashboard.rules.ts'

/** The existing notification-generation job releases explicitly confirmed desk reminders. */
export async function publishQueuedOverdueReminders(database: Pool = db) {
  const [result]=await database.execute<ResultSetHeader>(`UPDATE notifications n SET scheduled_for=NOW(),delivered_at=NOW()
    FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id
    WHERE n.user_id=bt.user_id AND n.source_id=bt.transaction_id AND n.source_type='Borrow Transaction'
      AND n.trigger_type='Overdue Penalty' AND n.scheduled_for='infinity'::timestamp AND n.delivered_at IS NULL
      AND n.expires_at IS NULL AND n.deleted_at IS NULL
      AND n.dedupe_key=${overdueReminderKeySql()} AND bt.transaction_status IN ('Borrowed','Overdue')
      AND bt.lost_confirmed_at IS NULL AND bt.due_at<NOW() AND u.account_status='Active'`)
  // A returned/renewed/lost loan must not receive the old queued reminder later.
  await database.execute(`UPDATE notifications n SET expires_at=NOW()
    WHERE n.trigger_type='Overdue Penalty' AND n.source_type='Borrow Transaction'
      AND n.scheduled_for='infinity'::timestamp AND n.delivered_at IS NULL AND n.expires_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM borrow_transactions bt JOIN users u ON u.user_id=bt.user_id
        WHERE bt.transaction_id=n.source_id AND bt.user_id=n.user_id AND n.dedupe_key=${overdueReminderKeySql()}
          AND bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL
          AND bt.due_at<NOW() AND u.account_status='Active')`)
  return result.affectedRows
}
