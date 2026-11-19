import type { PoolConnection } from '../../config/db.js'

export type NoticePage = 'borrowing' | 'my-books' | 'clearance' | 'printing'

export type UserNotice = {
  userId: number; title: string; body: string; triggerType: string; sourceType: string; sourceId: number
  actionPath: string | null; priority: 'Normal' | 'Important'; dedupeKey: string
}

/** Runs inside the caller's transaction; a repeated (user_id, dedupe_key) is ignored, any other failure propagates. */
export async function insertUserNotice(q: Pick<PoolConnection, 'execute'>, notice: UserNotice) {
  await q.execute(
    `INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
     VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW()) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [notice.userId, notice.title, notice.body, notice.triggerType, notice.sourceType, notice.sourceId, notice.actionPath, notice.priority, notice.dedupeKey],
  )
}

/** A link only to pages the role can open; null for any role without one, so a notice never links to the wrong place. */
export function rolePath(role: unknown, page: NoticePage): string | null {
  if (role === 'Student') return `/student/${page}`
  if (role === 'Faculty') return page === 'printing' ? '/faculty/notifications' : `/faculty/${page}`
  if (role === 'Staff') return page === 'printing' ? '/staff/printing' : '/staff/notifications'
  if (role === 'Librarian') return '/librarian/notifications'
  return null
}

export function manilaTime(value: Date | string | number) {
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}
