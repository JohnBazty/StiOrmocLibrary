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
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { SessionActivity } from '../features/auth/SessionActivity'
import { NotificationShortcut } from '../features/notifications/NotificationShortcut'
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
    { label: 'Printing service', to: `${prefix}/printing`, icon: Printer },
    { label: 'Transactions', to: `${prefix}/transactions`, icon: CircleDollarSign },
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
  { label: 'Book Reports', to: '/librarian/reports', icon: FileBarChart },
  { label: 'Book archive', to: '/librarian/book-archive', icon: Archive },
  { label: 'Categories', to: '/librarian/categories', icon: Tags },
  { label: 'Borrow & return', to: '/librarian/circulation', icon: CalendarClock },
  { label: 'Book queue', to: '/librarian/reservations', icon: BookMarked },
  { label: 'Fines', to: '/librarian/fines', icon: CircleDollarSign },
  { label: 'Online payments', to: '/librarian/payments', icon: CircleDollarSign },
  { label: 'Library funds', to: '/librarian/funds', icon: CircleDollarSign },
  { label: 'Maintenance', to: '/librarian/maintenance', icon: Settings },
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
  { label: 'Online payments', to: '/staff/payments', icon: CircleDollarSign },
  { label: 'Attendance', to: '/staff/attendance', icon: QrCode },
  { label: 'Announcements', to: '/staff/announcements', icon: Megaphone },
  { label: 'Notifications', to: '/staff/notifications', icon: Bell },
  { label: 'My profile', to: '/staff/profile', icon: UserRound },
]
const navigation = (role: Role) => role === 'admin' ? adminNav : role === 'librarian' ? librarianNav : role === 'staff' ? staffNav : userNav(role)

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFF200] text-[#0b5ea2] shadow-sm"><LibraryBig size={22} strokeWidth={2.5} /><span className="absolute bottom-0 h-1 w-full bg-[#0b5ea2]" /></div>
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
      {open ? <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-[#0b5ea2]/45 backdrop-blur-sm lg:hidden" /> : null}
      <aside id="portal-navigation" aria-label="Portal navigation" inert={!open && mobile ? true : undefined} className={cn('portal-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col bg-[#0b5ea2] text-white transition-transform duration-300 lg:max-w-none lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5"><Brand /><button onClick={onClose} aria-label="Close navigation menu" className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button></div>
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {nav.map((item) => {
            const Icon = item.icon
            if (item.label === 'My profile' && (role === 'student' || role === 'faculty')) return <details key={item.to} className="mb-1 rounded-xl bg-white/5" open={location.pathname === item.to || undefined}><summary className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-3 text-sm"><Icon size={17} />My profile</summary><div className="pb-2 pl-6">{[['personal','Personal details'],['school','School details'],['photo','Profile photo']].map(([section,label]) => <NavLink key={section} to={`${item.to}?section=${section}`} onClick={onClose} className="block min-h-11 rounded-lg px-3 py-3 text-sm text-white hover:bg-white/10">{label}</NavLink>)}</div></details>
            return <div key={item.to}>{item.section ? <p className="mb-2 mt-4 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40 first:mt-0">{item.section}</p> : null}<NavLink onClick={onClose} to={item.to} className={({ isActive }) => cn('mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition lg:py-2.5', isActive ? 'bg-white text-[#0b5ea2] shadow-sm dark:bg-[#FFF200]' : 'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} /><span>{item.label}</span></NavLink></div>
          })}
        </nav>
        <div className="border-t border-white/10 p-3"><SidebarAccountCard key={`${claims?.source}:${claims?.userId}`} identity={claims} preview={preview.enabled} /></div>
      </aside>
    </>
  )
}

export function PortalLayout({ role }: { role: Role }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
    <div className="portal-layout min-h-screen bg-[#FFFFFF] text-[#0b5ea2] transition-colors dark:bg-[#14151b] dark:text-[#f2f6ff]">
      <Sidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64" inert={sidebarOpen ? true : undefined}>
        <header className="sticky top-0 z-30 flex h-20 items-center border-b border-[#0b5ea2]/10 bg-white/90 px-4 backdrop-blur-xl transition-colors sm:px-6 lg:px-8 dark:border-white/10 dark:bg-[#001a4d]/92">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="mr-3 shrink-0 rounded-xl border border-[#0b5ea2]/15 p-2.5 text-[#0b5ea2]/65 lg:hidden dark:border-white/15 dark:text-white/70"><Menu size={19} /></button>
          <div className="hidden sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0b5ea2]/45 dark:text-white/45">{role === 'admin' ? 'Admin workspace' : role === 'librarian' ? 'Library Admin workspace' : role === 'staff' ? 'Staff workspace' : role === 'faculty' ? 'Faculty portal' : 'Student portal'}</p><p className="mt-0.5 font-display text-sm font-bold text-[#0b5ea2] dark:text-white">{current?.label ?? 'STI College Ormoc ILMS'}</p></div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {role === 'admin' ? <button onClick={() => navigate('/admin/notifications')} aria-label="Notifications" className="rounded-xl border border-[#0b5ea2]/15 bg-white p-2.5 text-[#0b5ea2]/65 transition hover:bg-[#0b5ea2]/5 dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80 dark:hover:bg-white/10"><Bell size={18} /></button> : <NotificationShortcut path={`/${role}/notifications`} />}
            <button onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out" className="rounded-xl border border-[#0b5ea2]/15 bg-white p-2.5 text-[#0b5ea2]/65 transition hover:bg-[#0b5ea2]/5 disabled:opacity-50 dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80 dark:hover:bg-white/10"><LogOut size={18} /></button>
          </div>
        </header>
        {signOutError && <p role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{signOutError}</p>}
        <SessionActivity /><main className="portal-content mx-auto min-w-0 max-w-[1500px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
        {role !== 'admin' ? <AttendanceFab role={role} /> : null}
      </div>
    </div>
  )
}
