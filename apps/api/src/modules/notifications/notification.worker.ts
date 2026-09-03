import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'

async function publishScheduledAnnouncements(database: Pool, now: Date) {
  const connection = await database.getConnection()
  let published = 0
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT announcement_id, title, message_body, priority, publish_at, expires_at
         FROM announcements
        WHERE announcement_status = 'Scheduled' AND publish_at <= ?
        ORDER BY publish_at, announcement_id LIMIT 100 FOR UPDATE`, [now],
    )
    for (const row of rows) {
      await connection.execute(
        `INSERT IGNORE INTO notifications
           (user_id, message_title, message_body, trigger_type, source_type, source_id,
            action_path, priority, dedupe_key, scheduled_for, delivered_at, expires_at)
         SELECT u.user_id, ?, ?, 'Announcement', 'Announcement', ?, '/student/notifications', ?,
                CONCAT('announcement:', ?), ?, NOW(), ?
           FROM users u WHERE u.account_status = 'Active'`,
        [row.title, row.message_body, row.announcement_id, row.priority, row.announcement_id, row.publish_at, row.expires_at],
      )
      await connection.execute(
        "UPDATE announcements SET announcement_status = 'Published', published_at = NOW(), updated_at = NOW() WHERE announcement_id = ?",
        [row.announcement_id],
      )
      published += 1
    }
    await connection.commit()
    return published
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function generateNotifications(database: Pool = db, now: Date = new Date()) {
  const queries: Array<[string, Array<string | number | Date | null>]> = [
    [`INSERT IGNORE INTO notifications
        (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT bt.user_id, 'Book due soon', CONCAT(COALESCE(t.title,m.title),' is due on ',DATE_FORMAT(bt.due_at,'%b %e, %Y at %h:%i %p'),'.'),
             'Due Date','Borrow Transaction',bt.transaction_id,'/student/borrowing','Important',CONCAT('loan:',bt.transaction_id,':due-12h'),NOW(),NOW()
        FROM borrow_transactions bt INNER JOIN materials m ON m.material_id=bt.material_id
        LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
       WHERE bt.transaction_status='Borrowed' AND bt.lost_confirmed_at IS NULL AND bt.due_at>? AND bt.due_at<=DATE_ADD(?,INTERVAL 12 HOUR)`, [now, now]],
    [`INSERT IGNORE INTO notifications
        (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT bt.user_id, 'Book due within one hour', CONCAT(COALESCE(t.title,m.title),' is due at ',DATE_FORMAT(bt.due_at,'%h:%i %p'),'. Return it before the cutoff to avoid a fine.'),
             'Due Date','Borrow Transaction',bt.transaction_id,'/student/borrowing','Urgent',CONCAT('loan:',bt.transaction_id,':due-1h'),NOW(),NOW()
        FROM borrow_transactions bt INNER JOIN materials m ON m.material_id=bt.material_id
        LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
       WHERE bt.transaction_status='Borrowed' AND bt.lost_confirmed_at IS NULL AND bt.due_at>? AND bt.due_at<=DATE_ADD(?,INTERVAL 1 HOUR)`, [now, now]],
    [`INSERT IGNORE INTO notifications
        (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT bt.user_id,'Book is overdue',CONCAT(COALESCE(t.title,m.title),' is overdue. Your fine and clearance status have been updated.'),
             'Overdue Penalty','Borrow Transaction',bt.transaction_id,'/student/clearance','Urgent',CONCAT('loan:',bt.transaction_id,':overdue'),NOW(),NOW()
        FROM borrow_transactions bt INNER JOIN materials m ON m.material_id=bt.material_id
        LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id LEFT JOIN titles t ON t.title_id=pc.title_id
       WHERE bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL AND bt.due_at<=?`, [now]],
    [`INSERT IGNORE INTO notifications
        (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT r.user_id,
             CASE r.reservation_status WHEN 'pending' THEN 'Reservation received' WHEN 'approved' THEN 'Reservation approved'
               WHEN 'ready_for_pickup' THEN 'Book ready for pickup' WHEN 'claimed' THEN 'Reservation claimed'
               WHEN 'cancelled' THEN 'Reservation cancelled' ELSE 'Reservation expired' END,
             CONCAT(m.title,' reservation status: ',REPLACE(r.reservation_status,'_',' '),
               CASE WHEN r.pickup_deadline IS NOT NULL THEN CONCAT('. Pickup deadline: ',DATE_FORMAT(r.pickup_deadline,'%b %e, %Y at %h:%i %p')) ELSE '.' END),
             'Reservation Arrival','Reservation',r.reservation_id,'/student/reservations',
             CASE WHEN r.reservation_status='ready_for_pickup' THEN 'Urgent' ELSE 'Important' END,
             CONCAT('reservation:',r.reservation_id,':',r.reservation_status),NOW(),NOW()
        FROM reservations r INNER JOIN materials m ON m.material_id=r.material_id`, []],
    [`INSERT IGNORE INTO notifications
        (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT pr.user_id, CONCAT('Print request ',LOWER(pr.job_status)),
             CONCAT(pr.file_name,' is ',LOWER(pr.job_status),'. Request #',pr.request_id,'.'),
             'Printing Update','Print Request',pr.request_id,'/student/printing',
             CASE WHEN pr.job_status='Ready for Pickup' THEN 'Urgent' ELSE 'Normal' END,
             CONCAT('print:',pr.request_id,':',REPLACE(LOWER(pr.job_status),' ','-')),NOW(),NOW()
        FROM print_requests pr`, []],
    [`INSERT IGNORE INTO notifications
        (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
      SELECT u.user_id,'Library schedule update',CONCAT('The library is closed on ',DATE_FORMAT(c.closed_date,'%b %e, %Y'),': ',c.reason,'.'),
             'Library Schedule','Library Closure',CAST(DATE_FORMAT(c.closed_date,'%Y%m%d') AS UNSIGNED),'/student/notifications','Important',
             CONCAT('closure:',DATE_FORMAT(c.closed_date,'%Y-%m-%d')),NOW(),NOW()
        FROM users u CROSS JOIN library_closed_days c
       WHERE u.account_status='Active' AND c.closed_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)`, []],
  ]
  let inserted = 0
  for (const [sql, values] of queries) {
    const [result] = await database.execute(sql, values)
    inserted += (result as ResultSetHeader).affectedRows
  }
  const publishedAnnouncements = await publishScheduledAnnouncements(database, now)
  return { inserted, publishedAnnouncements }
}

export function startNotificationWorker(database: Pool = db, intervalMs = 60_000) {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try { await generateNotifications(database) }
    catch (error) { console.error('[Notifications] Delivery worker failed.', error) }
    finally { running = false }
  }
  void run()
  const timer = setInterval(() => void run(), intervalMs)
  timer.unref()
  return timer
}
