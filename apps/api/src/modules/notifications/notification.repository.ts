import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import type { AnnouncementInput } from './notification.validation.ts'

export type NotificationActor = { accountId?: number; role?: string }

async function linkedUserId(executor: Pool | PoolConnection, accountId: number) {
  const [rows] = await executor.execute<RowDataPacket[]>(
    'SELECT user_id FROM accounts WHERE account_id = ? AND user_id IS NOT NULL LIMIT 1', [accountId],
  )
  const userId = rows[0]?.user_id ? Number(rows[0].user_id) : null
  if (!userId) throw new HttpError(422, 'NOTIFICATION_PROFILE_NOT_LINKED', 'This login account is not linked to a library profile.')
  return userId
}

function actorAccountId(actor: NotificationActor) {
  const value = Number(actor.accountId)
  if (!Number.isSafeInteger(value) || value < 1) throw new HttpError(401, 'JWT_REQUIRED', 'A valid login is required.')
  return value
}

export function createNotificationRepository(database: Pool = db) {
  async function fanOutAnnouncement(connection: PoolConnection, announcement: RowDataPacket) {
    await connection.execute(
      `INSERT IGNORE INTO notifications
         (user_id, message_title, message_body, trigger_type, source_type, source_id,
          action_path, priority, dedupe_key, scheduled_for, delivered_at, expires_at)
       SELECT u.user_id, ?, ?, 'Announcement', 'Announcement', ?, '/student/notifications', ?,
              CONCAT('announcement:', ?), ?, NOW(), ?
         FROM users u
        WHERE u.account_status = 'Active'`,
      [announcement.title, announcement.message_body, announcement.announcement_id,
        announcement.priority, announcement.announcement_id,
        announcement.publish_at ?? new Date(), announcement.expires_at ?? null],
    )
  }

  return {
    async list(actor: NotificationActor, query: Record<string, unknown>) {
      const userId = await linkedUserId(database, actorAccountId(actor))
      const page = Math.max(1, Math.trunc(Number(query.page) || 1))
      const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 25)))
      const offset = (page - 1) * limit
      const unreadOnly = String(query.status ?? '').toLowerCase() === 'unread'
      const unreadSql = unreadOnly ? ' AND n.is_read = 0' : ''
      const countUnreadSql = unreadOnly ? ' AND is_read = 0' : ''
      const [[items], [counts]] = await Promise.all([
        database.execute<RowDataPacket[]>(
          `SELECT n.notification_id, n.message_title, n.message_body, n.trigger_type,
                  n.source_type, n.source_id, n.action_path, n.priority, n.is_read,
                  n.notification_timestamp, n.read_at, n.expires_at
             FROM notifications n
            WHERE n.user_id = ?${unreadSql}
              AND (n.scheduled_for IS NULL OR n.scheduled_for <= NOW())
              AND (n.expires_at IS NULL OR n.expires_at > NOW())
            ORDER BY n.notification_timestamp DESC, n.notification_id DESC
            LIMIT ${limit} OFFSET ${offset}`, [userId],
        ),
        database.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread
             FROM notifications
            WHERE user_id = ? AND (scheduled_for IS NULL OR scheduled_for <= NOW())
              AND (expires_at IS NULL OR expires_at > NOW())${countUnreadSql}`, [userId],
        ),
      ])
      const total = Number(counts[0]?.total ?? 0)
      return {
        items: items.map((row) => ({
          notificationId: Number(row.notification_id), title: String(row.message_title), body: String(row.message_body),
          type: String(row.trigger_type), sourceType: row.source_type ? String(row.source_type) : null,
          sourceId: row.source_id ? Number(row.source_id) : null, actionPath: row.action_path ? String(row.action_path) : null,
          priority: String(row.priority ?? 'Normal'), isRead: Boolean(row.is_read), createdAt: row.notification_timestamp,
          readAt: row.read_at, expiresAt: row.expires_at,
        })),
        unreadCount: Number(counts[0]?.unread ?? 0),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }
    },

    async markRead(actor: NotificationActor, notificationId: number) {
      const userId = await linkedUserId(database, actorAccountId(actor))
      const [result] = await database.execute<ResultSetHeader>(
        'UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE notification_id = ? AND user_id = ?',
        [notificationId, userId],
      )
      if (!result.affectedRows) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'The notification was not found.')
      return { notificationId, isRead: true }
    },

    async markAllRead(actor: NotificationActor) {
      const userId = await linkedUserId(database, actorAccountId(actor))
      const [result] = await database.execute<ResultSetHeader>(
        `UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, NOW())
          WHERE user_id = ? AND is_read = 0 AND (scheduled_for IS NULL OR scheduled_for <= NOW())`, [userId],
      )
      return { updatedCount: result.affectedRows }
    },

    async schedule() {
      const [[weekly], [closures]] = await Promise.all([
        database.execute<RowDataPacket[]>(
          'SELECT day_of_week, is_open, opens_at, closes_at FROM library_operating_schedule ORDER BY day_of_week',
        ),
        database.execute<RowDataPacket[]>(
          'SELECT closed_date, reason FROM library_closed_days WHERE closed_date >= CURDATE() ORDER BY closed_date LIMIT 20',
        ),
      ])
      return {
        timezone: 'Asia/Manila',
        weekly: weekly.map((row) => ({ dayOfWeek: Number(row.day_of_week), isOpen: Boolean(row.is_open), opensAt: row.opens_at, closesAt: row.closes_at })),
        upcomingClosures: closures.map((row) => ({ date: row.closed_date, reason: String(row.reason) })),
      }
    },

    async createAnnouncement(actor: NotificationActor, input: AnnouncementInput) {
      if (actor.role !== 'Admin') throw new HttpError(403, 'ANNOUNCEMENT_ADMIN_ONLY', 'Only an Admin can publish announcements.')
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const creatorUserId = await linkedUserId(connection, actorAccountId(actor))
        const now = new Date()
        const status = input.publishAt && input.publishAt > now ? 'Scheduled' : 'Published'
        const publishAt = input.publishAt ?? now
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO announcements
             (title, message_body, priority, announcement_status, publish_at, expires_at,
              published_at, created_by_user_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [input.title, input.body, input.priority, status, publishAt, input.expiresAt,
            status === 'Published' ? now : null, creatorUserId],
        )
        await connection.execute(
          `INSERT INTO announcement_revisions
             (announcement_id, revision_number, title_snapshot, body_snapshot, priority_snapshot, changed_by_user_id)
           VALUES (?, 1, ?, ?, ?, ?)`,
          [insert.insertId, input.title, input.body, input.priority, creatorUserId],
        )
        if (status === 'Published') await fanOutAnnouncement(connection, {
          announcement_id: insert.insertId, title: input.title, message_body: input.body,
          priority: input.priority, publish_at: publishAt, expires_at: input.expiresAt,
        } as RowDataPacket)
        await connection.commit()
        return { announcementId: Number(insert.insertId), status, publishAt, expiresAt: input.expiresAt }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async announcements(actor: NotificationActor) {
      if (actor.role !== 'Admin') throw new HttpError(403, 'ANNOUNCEMENT_ADMIN_ONLY', 'Only an Admin can manage announcements.')
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT a.announcement_id, a.title, a.message_body, a.priority, a.announcement_status,
                a.publish_at, a.expires_at, a.published_at, a.archived_at, a.created_at,
                u.full_name AS created_by, COUNT(n.notification_id) AS delivered_count,
                SUM(CASE WHEN n.is_read = 1 THEN 1 ELSE 0 END) AS read_count
           FROM announcements a INNER JOIN users u ON u.user_id = a.created_by_user_id
           LEFT JOIN notifications n ON n.source_type = 'Announcement' AND n.source_id = a.announcement_id
          GROUP BY a.announcement_id, a.title, a.message_body, a.priority, a.announcement_status,
                   a.publish_at, a.expires_at, a.published_at, a.archived_at, a.created_at, u.full_name
          ORDER BY a.created_at DESC, a.announcement_id DESC`,
      )
      return rows.map((row) => ({
        announcementId: Number(row.announcement_id), title: String(row.title), body: String(row.message_body),
        priority: String(row.priority), status: String(row.announcement_status), publishAt: row.publish_at,
        expiresAt: row.expires_at, publishedAt: row.published_at, archivedAt: row.archived_at,
        createdAt: row.created_at, createdBy: String(row.created_by), deliveredCount: Number(row.delivered_count ?? 0),
        readCount: Number(row.read_count ?? 0),
      }))
    },
  }
}

export const notificationRepository = createNotificationRepository()
