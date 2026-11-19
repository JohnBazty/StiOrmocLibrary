import { useState } from 'react'
import { AdminNotificationsPage } from './AdminNotificationsPage'
import { NotificationCenterPage } from './NotificationCenterPage'

export function WorkspaceNotificationsPage({ workspace }: { workspace: 'admin' | 'librarian' | 'staff' }) {
  const [section, setSection] = useState<'inbox' | 'accounts'>('inbox')
  return <>
    {workspace !== 'staff' ? <nav aria-label="Notification sections" className="mb-5 flex flex-wrap gap-3">
      <button type="button" aria-pressed={section === 'inbox'} onClick={() => setSection('inbox')} className="min-h-11 rounded-xl border border-current/20 px-4 font-semibold">Notifications</button>
      <button type="button" aria-pressed={section === 'accounts'} onClick={() => setSection('accounts')} className="min-h-11 rounded-xl border border-current/20 px-4 font-semibold">Account activity</button>
    </nav> : null}
    {section === 'accounts' && workspace !== 'staff' ? <AdminNotificationsPage /> : <NotificationCenterPage workspace={workspace} />}
  </>
}
