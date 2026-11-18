import type { Pool, ResultSetHeader } from '../../config/db.js'
import { db } from '../../config/db.js'

/** Recover actionable, committed work, including items present before this release.
 * Unique recipient/key pairs retain read/deleted state on every retry. */
export async function generateLibrarianAlerts(database: Pick<Pool,'execute'> = db, now = new Date()) {
  const localNow = "(?::timestamptz AT TIME ZONE 'Asia/Manila')"
  const deliveryTimestamp = "(NOW() AT TIME ZONE 'UTC')"
  const requests = `UNION ALL
    SELECT CONCAT('library:reservation:',r.reservation_id,':ready_for_pickup'),
      'Reservation ready for pickup',CONCAT(u.full_name,': ',COALESCE(t.title,m.title),' is ready for collection.'),
      'Reservation Arrival',r.reservation_id,'/librarian/reservations'
      FROM reservations r JOIN users u ON u.user_id=r.user_id JOIN materials m ON m.material_id=r.material_id
      LEFT JOIN titles t ON t.title_id=r.book_title_id
      WHERE r.request_kind='Reservation' AND r.reservation_status='ready_for_pickup'`
  const [result] = await database.execute<ResultSetHeader>(`INSERT INTO notifications
    (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,
     priority,dedupe_key,scheduled_for,delivered_at,notification_timestamp)
    SELECT DISTINCT a.user_id,work.title,work.body,work.kind,'Library Operations',work.source_id,work.path,
      'Important',work.dedupe_key,${deliveryTimestamp},${deliveryTimestamp},${deliveryTimestamp}
    FROM (
      SELECT CONCAT('library:loan:',b.transaction_id,':overdue') dedupe_key,'Book needs an overdue follow-up' title,
        CONCAT(u.full_name,': ',COALESCE(t.title,m.title),' passed its recorded return deadline.') body,
        'Overdue Penalty' kind,b.transaction_id source_id,'/librarian/circulation' path
        FROM borrow_transactions b JOIN users u ON u.user_id=b.user_id JOIN materials m ON m.material_id=b.material_id
        LEFT JOIN physical_copies c ON c.physical_copy_id=b.physical_copy_id LEFT JOIN titles t ON t.title_id=c.title_id
        WHERE b.transaction_status IN ('Borrowed','Overdue') AND b.returned_at IS NULL
          AND b.lost_confirmed_at IS NULL AND b.due_at<${localNow}
      UNION ALL
      SELECT CONCAT('library:print:',p.request_id,':pending'),'New print request',
        CONCAT(u.full_name,': ',p.file_name,' is waiting for staff.'),'Printing Update',p.request_id,'/librarian/printing'
        FROM print_requests p JOIN users u ON u.user_id=p.user_id WHERE p.job_status='Pending'
      ${requests}
    ) work CROSS JOIN accounts a JOIN users recipient ON recipient.user_id=a.user_id
    WHERE a.role='Librarian' AND a.account_status='Active' AND recipient.account_status='Active'
    ON CONFLICT (user_id,dedupe_key) DO NOTHING`, [now])
  return {inserted: Number(result.affectedRows)}
}
