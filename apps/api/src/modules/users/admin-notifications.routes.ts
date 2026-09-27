import { Router, type NextFunction, type Request, type Response } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'

type Notice = { id: string; kind: 'registration' | 'avatar' | 'profile' | 'status'; title: string; body: string; createdAt: string; actionPath: string }
const timestamp = (value: unknown) => new Date(value as string | number | Date).toISOString()

export async function listAdminNotifications(database: Pick<typeof db, 'execute'> = db) {
  const [[registrations], [pictures], [events], [registrationCount], [pictureCount]] = await Promise.all([
    database.execute<RowDataPacket[]>(`SELECT request_id,school_id,first_name,last_name,requested_role,created_at
      FROM registration_requests WHERE status='PendingApproval' ORDER BY created_at DESC LIMIT 100`, []),
    database.execute<RowDataPacket[]>(`SELECT p.submission_id,p.submitted_at,a.school_id,
      COALESCE(NULLIF(u.full_name,''),a.school_id) AS full_name
      FROM profile_avatar_submissions p JOIN accounts a ON a.account_id=p.account_id
      LEFT JOIN users u ON u.user_id=a.user_id WHERE p.status='Pending'
      ORDER BY p.submitted_at DESC LIMIT 100`, []),
    database.execute<RowDataPacket[]>(`SELECT e.event_id,e.action_code,e.changed_fields,e.created_at,a.school_id,a.account_status,
      COALESCE(NULLIF(u.full_name,''),a.school_id) AS full_name
      FROM account_management_events e JOIN accounts a ON a.account_id=e.account_id
      LEFT JOIN users u ON u.user_id=a.user_id
      WHERE e.action_code IN ('ProfileEdited','Activated','Deactivated')
      ORDER BY e.created_at DESC,e.event_id DESC LIMIT 30`, []),
    database.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM registration_requests WHERE status='PendingApproval'", []),
    database.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM profile_avatar_submissions WHERE status='Pending'", []),
  ])
  const pending: Notice[] = [
    ...registrations.map(row => ({ id: `registration-${row.request_id}`, kind: 'registration' as const,
      title: 'Account registration awaiting approval',
      body: `${row.first_name} ${row.last_name} (${row.school_id}) requested ${row.requested_role} access.`,
      createdAt: timestamp(row.created_at), actionPath: '/admin/approvals' })),
    ...pictures.map(row => ({ id: `avatar-${row.submission_id}`, kind: 'avatar' as const,
      title: 'Profile picture awaiting approval', body: `${row.full_name} (${row.school_id}) submitted a new picture.`,
      createdAt: timestamp(row.submitted_at), actionPath: '/admin/approvals' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const activity: Notice[] = events.map(row => {
    const profile = row.action_code === 'ProfileEdited'
    const deactivated = row.action_code === 'Deactivated'
    const fields = String(row.changed_fields ?? '').split(',').filter(Boolean).map(field => field.replaceAll('_', ' '))
    return { id: `event-${row.event_id}`, kind: profile ? 'profile' : 'status',
      title: profile ? 'User updated their profile' : deactivated ? 'Account deactivated' : 'Account reactivated',
      body: profile ? `${row.full_name} (${row.school_id}) changed ${fields.join(', ') || 'profile details'}.`
        : `${row.full_name} (${row.school_id}) was ${deactivated ? 'deactivated' : 'reactivated'}.`,
      createdAt: timestamp(row.created_at),
      actionPath: row.account_status === 'Active' ? '/admin/users' : '/admin/user-archive' }
  })
  return { pendingCount: Number(registrationCount[0]?.total ?? 0) + Number(pictureCount[0]?.total ?? 0), pending, activity }
}

export const adminNotificationsRouter = Router()
adminNotificationsRouter.get('/', (request: Request, response: Response, next: NextFunction) => {
  void listAdminNotifications().then(data => response.set('Cache-Control', 'private, no-store').json({ success: true, data })).catch(next)
})
