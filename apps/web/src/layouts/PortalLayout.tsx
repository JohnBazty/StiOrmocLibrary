import {
  Archive,
  BadgeCheck,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Map,
  Megaphone,
  PackageOpen,
  PanelLeftClose,
  Printer,
  QrCode,
  Search,
  Settings,
  ShoppingCart,
  Tags,
  Users,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../components/ui'
import { getAccessToken, getCurrentIdentity } from '../features/auth/auth-storage'
import { logout } from '../features/auth/auth-api'
import { AttendanceFab } from '../features/attendance/AttendanceFab'
import { useMockAuth } from '../features/inventory/MockAuthContext'
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { SessionActivity } from '../features/auth/SessionActivity'
import { SidebarAccountCard } from './SidebarAccountCard'

type Role = 'student' | 'faculty' | 'admin' | 'librarian' | 'staff'
type NavItem = { label: string; to: string; icon: LucideIcon; section?: string }

const userNav = (role: 'student' | 'faculty'): NavItem[] => {
  const prefix = role === 'faculty' ? '/faculty' : '/student'
  return [
    { label: 'Dashboard', to: `${prefix}/dashboard`, icon: LayoutDashboard, section: 'My library' },
    { label: 'Library catalog', to: `${prefix}/library`, icon: BookOpen },
    { label: 'Library floor plan', to: `${prefix}/floor-plan`, icon: Map },
    { label: 'Book cart', to: `${prefix}/cart`, icon: ShoppingCart },
    { label: 'Research & thesis', to: `${prefix}/research`, icon: FileText },
    { label: 'Borrowing history', to: `${prefix}/borrowing`, icon: CalendarClock, section: 'My activity' },
    { label: 'Requests & reservations', to: `${prefix}/reservations`, icon: BookMarked },
    { label: 'My books', to: `${prefix}/my-books`, icon: LibraryBig },
    ...(role === 'student' ? [{ label: 'Printing service', to: '/student/printing', icon: Printer }] : []),
    { label: 'QR attendance', to: `${prefix}/attendance`, icon: QrCode },
    { label: 'Notifications', to: `${prefix}/notifications`, icon: Bell, section: 'My account' },
    { label: 'Fines', to: `${prefix}/fines`, icon: CircleDollarSign },
    { label: 'Clearance status', to: `${prefix}/clearance`, icon: BadgeCheck },
    { label: 'My profile', to: `${prefix}/profile`, icon: UserRound },
  ]
}

const adminNav: NavItem[] = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, section: 'Accounts' },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'User archive', to: '/admin/user-archive', icon: Archive },
  { label: 'Clearance', to: '/admin/clearance', icon: ClipboardCheck },
  { label: 'Approvals', to: '/admin/approvals', icon: BadgeCheck },
  { label: 'Notifications', to: '/admin/notifications', icon: Bell },
]
const librarianNav: NavItem[] = [
  { label: 'Dashboard', to: '/librarian/dashboard', icon: LayoutDashboard, section: 'Operations' },
  { label: 'Maintenance', to: '/librarian/maintenance', icon: Settings },
  { label: 'Reports', to: '/librarian/reports', icon: FileBarChart },
  { label: 'Book archive', to: '/librarian/book-archive', icon: Archive },
  { label: 'Categories', to: '/librarian/categories', icon: Tags },
  { label: 'Borrow & return', to: '/librarian/circulation', icon: CalendarClock },
  { label: 'Book queue', to: '/librarian/reservations', icon: BookMarked },
  { label: 'Fines', to: '/librarian/fines', icon: CircleDollarSign },
  { label: 'Inventory', to: '/librarian/inventory', icon: Archive, section: 'Resources' },
  { label: 'Collection review', to: '/librarian/collection-review', icon: ClipboardCheck },
  { label: 'Floor plan', to: '/librarian/floor-plan', icon: Map },
  { label: 'Printing queue', to: '/librarian/printing', icon: Printer },
  { label: 'Print supplies', to: '/librarian/supplies', icon: PackageOpen },
  { label: 'Attendance', to: '/librarian/attendance', icon: QrCode, section: 'People & records' },
  { label: 'Clearance', to: '/librarian/clearance', icon: ClipboardCheck },
  { label: 'Announcements', to: '/librarian/announcements', icon: Megaphone },
  { label: 'Account overview', to: '/librarian/accounts', icon: LayoutDashboard, section: 'Account administration' },
  { label: 'Users', to: '/librarian/users', icon: Users },
  { label: 'User archive', to: '/librarian/user-archive', icon: Archive },
  { label: 'Approvals', to: '/librarian/approvals', icon: BadgeCheck },
  { label: 'Notifications', to: '/librarian/notifications', icon: Bell },
  { label: 'My profile', to: '/librarian/profile', icon: UserRound },
]
const staffNav: NavItem[] = [
  { label: 'Dashboard', to: '/staff/dashboard', icon: LayoutDashboard, section: 'My tasks' },
  { label: 'Borrow & return', to: '/staff/circulation', icon: CalendarClock },
  { label: 'Book queue', to: '/staff/reservations', icon: BookMarked },
  { label: 'Printing queue', to: '/staff/printing', icon: Printer },
  { label: 'Attendance', to: '/staff/attendance', icon: QrCode },
  { label: 'Announcements', to: '/staff/announcements', icon: Megaphone },
  { label: 'Notifications', to: '/staff/notifications', icon: Bell },
  { label: 'My profile', to: '/staff/profile', icon: UserRound },
]
const navigation = (role: Role) => role === 'admin' ? adminNav : role === 'librarian' ? librarianNav : role === 'staff' ? staffNav : userNav(role)

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFF200] text-[#003399] shadow-sm"><LibraryBig size={22} strokeWidth={2.5} /><span className="absolute bottom-0 h-1 w-full bg-[#003399]" /></div>
      {!compact ? <div><p className="font-display text-sm font-black leading-tight tracking-tight text-white">STI COLLEGE ORMOC</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">ILMS</p></div> : null}
    </div>
  )
}

function Sidebar({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const [mobile, setMobile] = useState(() => window.matchMedia?.('(max-width: 1023px)').matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1023px)')
    if (!media) return
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const nav = navigation(role)
  const location = useLocation()
  const preview = useMockAuth()
  const claims = preview.identity ?? getCurrentIdentity()
  return (
    <>
      {open ? <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-[#003399]/45 backdrop-blur-sm lg:hidden" /> : null}
      <aside id="portal-navigation" aria-label="Portal navigation" inert={!open && mobile ? true : undefined} className={cn('portal-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col bg-[#003399] text-white transition-transform duration-300 lg:max-w-none lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5"><Brand /><button onClick={onClose} aria-label="Close navigation menu" className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button></div>
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {nav.map((item) => {
            const Icon = item.icon
            if (item.label === 'My profile' && (role === 'student' || role === 'faculty')) return <details key={item.to} className="mb-1 rounded-xl bg-white/5" open={location.pathname === item.to || undefined}><summary className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-3 text-sm"><Icon size={17} />My profile</summary><div className="pb-2 pl-6">{[['personal','Personal details'],['school','School details'],['photo','Profile photo']].map(([section,label]) => <NavLink key={section} to={`${item.to}?section=${section}`} onClick={onClose} className="block min-h-11 rounded-lg px-3 py-3 text-sm text-white hover:bg-white/10">{label}</NavLink>)}</div></details>
            return <div key={item.to}>{item.section ? <p className="mb-2 mt-4 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40 first:mt-0">{item.section}</p> : null}<NavLink onClick={onClose} to={item.to} className={({ isActive }) => cn('mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition lg:py-2.5', isActive ? 'bg-white text-[#003399] shadow-sm dark:bg-[#FFF200]' : 'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} /><span>{item.label}</span></NavLink></div>
          })}
        </nav>
        <div className="border-t border-white/10 p-3"><SidebarAccountCard key={`${claims?.source}:${claims?.userId}`} identity={claims} preview={preview.enabled} /></div>
      </aside>
    </>
  )
}

export function PortalLayout({ role }: { role: Role }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const nav = navigation(role)
  const current = nav.find((item) => location.pathname.startsWith(item.to))
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasAdminAlerts, setHasAdminAlerts] = useState(false)
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)')
    const closeOnDesktop = () => { if (media?.matches) setSidebarOpen(false) }
    media?.addEventListener('change', closeOnDesktop)
    return () => media?.removeEventListener('change', closeOnDesktop)
  }, [])
  useEffect(() => {
    if (!sidebarOpen) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const sidebar = document.getElementById('portal-navigation')
    const controls = () => [...(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])].filter(control => control.getClientRects().length)
    controls()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
      if (event.key === 'Tab') {
        const items = controls()
        if (!items.length) return
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); previousFocus?.focus() }
  }, [sidebarOpen])
  useEffect(() => {
    let active = true
    const loadAlerts = async () => {
      const token = getAccessToken()
      if (!token) return
      try {
        const requestHeaders = { Accept: 'application/json', Authorization: `Bearer ${token}` }
        let pending = false
        if (role === 'admin' || role === 'librarian') {
          const response = await fetch('/api/v1/admin/notifications', { headers: requestHeaders, credentials: 'include' })
          const payload = await response.json() as { data?: { pendingCount?: number } }
          pending = response.ok && Number(payload.data?.pendingCount ?? 0) > 0
          if (role === 'admin') { if (active) setHasAdminAlerts(pending); return }
        }
        const response = await fetch('/api/v1/notifications?status=unread&limit=1', { headers: requestHeaders, credentials: 'include' })
        const payload = await response.json() as { success?: boolean; data?: unknown[] | { unreadCount?: number } }
        if (active && response.ok) setUnreadCount(Array.isArray(payload.data) ? payload.data.length : Number(payload.data?.unreadCount ?? 0))
        const hasAlerts = Array.isArray(payload.data) ? Boolean(payload.data.length) : Number(payload.data?.unreadCount ?? 0) > 0
        if (active) setHasAdminAlerts(pending || (response.ok && Boolean(payload.success) && hasAlerts))
      } catch { /* The page-level operational modules surface connectivity errors. */ }
    }
    const update = () => { if (!document.hidden) void loadAlerts() }; window.addEventListener('smartlib:notifications-updated', update);
    void loadAlerts(); const timer = window.setInterval(() => { if (!document.hidden) void loadAlerts() }, 5000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('smartlib:notifications-updated', update) }
  }, [role])
  const signOut = () => { void logout(); navigate('/login', { replace: true }) }

  return (
    <div className="portal-layout min-h-screen bg-[#FFFFFF] text-[#003399] transition-colors dark:bg-[#000d2b] dark:text-[#f2f6ff]">
      <Sidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64" inert={sidebarOpen ? true : undefined}>
        <header className="sticky top-0 z-30 flex h-20 items-center border-b border-[#003399]/10 bg-white/90 px-4 backdrop-blur-xl transition-colors sm:px-6 lg:px-8 dark:border-white/10 dark:bg-[#001a4d]/92">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="mr-3 shrink-0 rounded-xl border border-[#003399]/15 p-2.5 text-[#003399]/65 lg:hidden dark:border-white/15 dark:text-white/70"><Menu size={19} /></button>
          <div className="hidden sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#003399]/45 dark:text-white/45">{role === 'admin' ? 'Admin workspace' : role === 'librarian' ? 'Library Admin workspace' : role === 'staff' ? 'Staff workspace' : role === 'faculty' ? 'Faculty portal' : 'Student portal'}</p><p className="mt-0.5 font-display text-sm font-bold text-[#003399] dark:text-white">{current?.label ?? 'STI College Ormoc ILMS'}</p></div>
          <label className="relative ml-auto hidden w-64 xl:block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45 dark:text-white/45" size={15} /><input placeholder="Search anywhere..." className="h-10 w-full rounded-xl border border-[#003399]/15 bg-[#003399]/5 pl-9 pr-3 text-sm outline-none transition focus:border-[#003399]/15 focus:bg-white focus:ring-4 focus:ring-[#003399]/10 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:bg-[#002266]" /></label>
          <div className="ml-auto flex items-center gap-2 xl:ml-3">
            <ThemeToggle />
            <button onClick={() => navigate(role === 'admin' ? '/admin/notifications' : role === 'librarian' ? '/librarian/notifications' : role === 'staff' ? '/staff/notifications' : role === 'faculty' ? '/faculty/notifications' : '/student/notifications')} aria-label="Notifications" className="relative rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 transition hover:bg-[#003399]/5 dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80 dark:hover:bg-white/10"><Bell size={18} />{unreadCount > 0 ? <span aria-label={`${unreadCount} unread notifications`} className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-bold tabular-nums text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : hasAdminAlerts ? <span className="absolute right-2 top-2 size-2 rounded-full bg-[#FFF200]" /> : null}</button>
            <button onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 transition hover:bg-[#003399]/5 dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80 dark:hover:bg-white/10"><LogOut size={18} /></button>
            <button aria-label="Collapse sidebar" className="hidden rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 lg:block dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80"><PanelLeftClose size={18} /></button>
          </div>
        </header>
        <SessionActivity /><main className="portal-content mx-auto min-w-0 max-w-[1500px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
        {role !== 'admin' ? <AttendanceFab role={role} /> : null}
      </div>
    </div>
  )
}
