import { useState } from 'react'
import { AdminNotificationsPage } from './AdminNotificationsPage'
import { NotificationCenterPage } from './NotificationCenterPage'

export function LibrarianNotificationsPage() {
  const [section, setSection] = useState<'accounts' | 'operations'>('accounts')
  return <>
    <div className="mb-6 flex flex-wrap gap-3" aria-label="Notification sections">
      <button aria-pressed={section === 'accounts'} onClick={() => setSection('accounts')} className="rounded-xl border border-[#003399]/20 px-4 py-2 font-bold dark:border-white/20">Account reviews & activity</button>
      <button aria-pressed={section === 'operations'} onClick={() => setSection('operations')} className="rounded-xl border border-[#003399]/20 px-4 py-2 font-bold dark:border-white/20">Library notifications</button>
    </div>
    {section === 'accounts' ? <AdminNotificationsPage /> : <NotificationCenterPage />}
  </>
}
