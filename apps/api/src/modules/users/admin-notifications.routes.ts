import { Router, type NextFunction, type Request, type Response } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'

type Notice = { id: string; kind: 'profile' | 'status'; title: string; body: string; createdAt: string; actionPath: string }
const timestamp = (value: unknown) => new Date(value as string | number | Date).toISOString()

export async function listAdminNotifications(database: Pick<typeof db, 'execute'> = db, prefix: '/admin' | '/librarian' = '/admin') {
  const [events] = await database.execute<RowDataPacket[]>(`SELECT e.event_id,e.action_code,e.changed_fields,e.created_at,a.school_id,a.account_status,
      COALESCE(NULLIF(u.full_name,''),a.school_id) AS full_name
      FROM account_management_events e JOIN accounts a ON a.account_id=e.account_id
      LEFT JOIN users u ON u.user_id=a.user_id
      WHERE e.action_code IN ('ProfileEdited','Activated','Deactivated','StaffAccountCreated')
      ORDER BY e.created_at DESC,e.event_id DESC LIMIT 30`, [])
  const activity: Notice[] = events.map(row => {
    const profile = row.action_code === 'ProfileEdited'
    const created = row.action_code === 'StaffAccountCreated'
    const deactivated = row.action_code === 'Deactivated'
    const fields = String(row.changed_fields ?? '').split(',').filter(Boolean).map(field => field.replaceAll('_', ' '))
    return { id: `event-${row.event_id}`, kind: profile ? 'profile' : 'status',
      title: profile ? 'User updated their profile' : created ? 'Staff account created' : deactivated ? 'Account deactivated' : 'Account reactivated',
      body: profile ? `${row.full_name} (${row.school_id}) changed ${fields.join(', ') || 'profile details'}.`
        : `${row.full_name} (${row.school_id}) was ${created ? 'set up as Staff' : deactivated ? 'deactivated' : 'reactivated'}.`,
      createdAt: timestamp(row.created_at),
      actionPath: row.account_status === 'Active' ? `${prefix}/users` : `${prefix}/user-archive` }
  })
  return { activity }
}

export const adminNotificationsRouter = Router()
adminNotificationsRouter.get('/', (request: Request, response: Response, next: NextFunction) => {
  void listAdminNotifications(db, response.locals.authenticatedUser?.role === 'Librarian' ? '/librarian' : '/admin').then(data => response.set('Cache-Control', 'private, no-store').json({ success: true, data })).catch(next)
})
