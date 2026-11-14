import {
  Archive,
  BadgeCheck,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LibraryBig,
  Menu,
  Map,
  Megaphone,
  PackageOpen,
  Printer,
  QrCode,
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
import { getCurrentIdentity } from '../features/auth/auth-storage'
import { logout } from '../features/auth/auth-api'
import { AttendanceFab } from '../features/attendance/AttendanceFab'
import { useMockAuth } from '../features/inventory/MockAuthContext'
import { SessionActivity } from '../features/auth/SessionActivity'
import { NotificationShortcut } from '../features/notifications/NotificationShortcut'
import { AccountMenu } from './AccountMenu'
import { SignOutDialog } from './SignOutDialog'

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
  { label: 'Notifications', to: '/admin/notifications', icon: Bell },
]
const librarianNav: NavItem[] = [
  { label: 'Dashboard', to: '/librarian/dashboard', icon: LayoutDashboard, section: 'Operations' },
  { label: 'Maintenance', to: '/librarian/maintenance', icon: Settings },
  { label: 'Reports', to: '/librarian/reports', icon: FileBarChart },
  { label: 'Book register', to: '/librarian/book-register', icon: BookOpen },
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

function Brand({ collapsed }: { collapsed: boolean }) {
  return <div className="flex min-w-0 items-center gap-2">
    <img src="/reference-logo.jpg" alt="STI College Ormoc Logo" className={cn('h-11 w-11 shrink-0 rounded-xl object-contain', collapsed && 'lg:h-8 lg:w-8')} />
    <div className={cn('min-w-0', collapsed && 'lg:hidden')}><p className="font-display text-[13px] font-black leading-tight tracking-tight text-white">STI COLLEGE ORMOC</p><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FFF200]">Online Library</p></div>
  </div>
}

function Sidebar({ role, open, onClose, collapsed, onToggleCollapse }: {
  role: Role; open: boolean; onClose: () => void; collapsed: boolean; onToggleCollapse: () => void
}) {
  const [mobile, setMobile] = useState(() => window.matchMedia?.('(max-width: 1023px)').matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1023px)')
    if (!media) return
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const nav = navigation(role)
  return (
    <>
      {open ? <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-[#0b5ea2]/45 backdrop-blur-sm lg:hidden" /> : null}
      <aside id="portal-navigation" aria-label="Portal navigation" data-collapsed={collapsed} inert={!open && mobile ? true : undefined} className={cn('portal-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col overflow-hidden bg-[#0b5ea2] text-white transition-[width,transform] duration-300 ease-out lg:max-w-none lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full', collapsed && 'lg:w-[5.5rem]')}>
        <div className="flex h-20 items-center justify-between gap-2 border-b border-white/10 px-4">
          <Brand collapsed={collapsed} />
          <button type="button" onClick={onToggleCollapse} aria-controls="portal-navigation" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white lg:inline-flex">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button onClick={onClose} aria-label="Close navigation menu" className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button>
        </div>
        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 transition-[padding] duration-300', collapsed && 'lg:px-2')}>
          {nav.filter(item => item.label !== 'My profile').map((item) => {
            const Icon = item.icon
            return <div key={item.to}>{item.section ? <p className={cn('mb-2 mt-4 overflow-hidden whitespace-nowrap px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40 first:mt-0', collapsed && 'lg:mb-1 lg:mt-2 lg:h-0 lg:px-0 lg:opacity-0')}>{item.section}</p> : null}<NavLink title={item.label} onClick={onClose} to={item.to} className={({ isActive }) => cn('mb-1 flex items-center gap-3 overflow-hidden rounded-xl px-3 py-3 text-sm font-medium transition-[background-color,color,padding,gap] duration-300 lg:py-2.5', collapsed && 'lg:justify-center lg:gap-0 lg:px-0', isActive ? 'bg-white text-[#0b5ea2] shadow-sm dark:bg-[#FFF200]' : 'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} className="shrink-0" /><span className={cn('truncate whitespace-nowrap', collapsed && 'lg:sr-only')}>{item.label}</span></NavLink></div>
          })}
        </nav>
      </aside>
    </>
  )
}

export function PortalLayout({ role }: { role: Role }) {
  const preview = useMockAuth()
  const claims = preview.identity ?? getCurrentIdentity()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const nav = navigation(role)
  const current = nav.find((item) => location.pathname.startsWith(item.to))
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
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setSignOutError('Sign out could not be confirmed. Check your connection and try again.')
    } finally { setSigningOut(false) }
  }

  return (
    <div className="portal-layout portal-reference min-h-screen bg-[#FFFFFF] text-[#0b5ea2] transition-colors dark:bg-[#14151b] dark:text-[#f2f6ff]">
      <Sidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={desktopCollapsed} onToggleCollapse={() => setDesktopCollapsed(value => !value)} />
      <div className={cn('portal-workspace transition-[padding] duration-300 ease-out', desktopCollapsed ? 'lg:pl-[5.5rem]' : 'lg:pl-64')} inert={sidebarOpen ? true : undefined}>
        <header className="portal-reference-header sticky top-0 z-30 flex h-20 items-center border-b border-[#0b5ea2]/10 bg-white/90 px-4 backdrop-blur-xl transition-colors sm:px-6 lg:px-8 dark:border-white/10 dark:bg-[#22232e]/92">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="mr-3 shrink-0 rounded-xl border border-[#0b5ea2]/15 p-2.5 text-[#0b5ea2]/65 lg:hidden dark:border-white/15 dark:text-white/70"><Menu size={19} /></button>
          <div className="hidden sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0b5ea2]/45 dark:text-white/45">{role === 'admin' ? 'Admin workspace' : role === 'librarian' ? 'Library Admin workspace' : role === 'staff' ? 'Staff workspace' : role === 'faculty' ? 'Faculty portal' : 'Student portal'}</p><p className="mt-0.5 font-display text-sm font-bold text-[#0b5ea2] dark:text-white">{current?.label ?? 'STI College Ormoc ILMS'}</p></div>
          <div className="ml-auto flex items-center gap-2">
            {role === 'admin' ? <button onClick={() => navigate('/admin/notifications')} aria-label="Notifications" className="rounded-xl border border-[#0b5ea2]/15 bg-white p-2.5 text-[#0b5ea2]/65 transition hover:bg-[#0b5ea2]/5 dark:border-white/15 dark:bg-[#22232e] dark:text-white/80 dark:hover:bg-white/10"><Bell size={18} /></button> : <NotificationShortcut path={`/${role}/notifications`} />}
            <AccountMenu key={`${role}:${claims?.source}:${claims?.userId}`} identity={claims} preview={preview.enabled} profilePath={role === 'admin' ? undefined : `/${role}/profile`} signingOut={signingOut} onSignOut={() => { setSignOutError(''); setShowLogoutConfirm(true) }} />
          </div>
        </header>
        <SessionActivity /><main className={cn("portal-content mx-auto min-w-0 max-w-[1500px] p-4 sm:p-6 lg:p-8", /^\/(student|faculty|staff|librarian|admin)\/(dashboard|accounts)\/?$/.test(location.pathname) && "dashboard-reference")}><Outlet /></main>
        {role !== 'admin' ? <AttendanceFab role={role} /> : null}
      </div>
      {showLogoutConfirm ? <SignOutDialog busy={signingOut} error={signOutError} onCancel={() => setShowLogoutConfirm(false)} onConfirm={() => void signOut()} /> : null}
    </div>
  )
}
