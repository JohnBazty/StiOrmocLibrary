import { useState } from 'react'
import { AdminNotificationsPage } from './AdminNotificationsPage'
import { NotificationCenterPage } from './NotificationCenterPage'
import { LibraryActivityPage } from './LibraryActivityPage'

export function LibrarianNotificationsPage() {
  const [section, setSection] = useState<'accounts' | 'operations' | 'activity'>('operations')
  return <>
    <nav className="mb-6 flex flex-wrap gap-3" aria-label="Notification sections">
      <button aria-pressed={section === 'operations'} onClick={() => setSection('operations')} className={`min-h-11 rounded-xl border px-4 py-2 font-bold ${section === 'operations' ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white' : 'border-[#0b5ea2]/20 dark:border-white/20'}`}>Alerts & reminders</button>
      <button aria-pressed={section === 'activity'} onClick={() => setSection('activity')} className={`min-h-11 rounded-xl border px-4 py-2 font-bold ${section === 'activity' ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white' : 'border-[#0b5ea2]/20 dark:border-white/20'}`}>Recent library activity</button>
      <button aria-pressed={section === 'accounts'} onClick={() => setSection('accounts')} className={`min-h-11 rounded-xl border px-4 py-2 font-bold ${section === 'accounts' ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white' : 'border-[#0b5ea2]/20 dark:border-white/20'}`}>Account activity</button>
    </nav>
    {section === 'accounts' ? <AdminNotificationsPage /> : section === 'activity' ? <LibraryActivityPage/> : <NotificationCenterPage operations/>}
  </>
}
