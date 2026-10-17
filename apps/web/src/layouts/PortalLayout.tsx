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
  Camera,
  GraduationCap,
  LogOut,
  Menu,
  Map,
  Megaphone,
  Moon,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  QrCode,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Tags,
  Users,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../components/ui'
import { getAccessToken, getCurrentIdentity } from '../features/auth/auth-storage'
import { logout } from '../features/auth/auth-api'
import { AttendanceFab } from '../features/attendance/AttendanceFab'
import { useMockAuth } from '../features/inventory/MockAuthContext'
import { useTheme } from '../features/theme/ThemeProvider'
import { NotificationBell } from '../features/notifications/NotificationBell'
import { SessionActivity } from '../features/auth/SessionActivity'
import { usersApi } from '../features/users/users-api'

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
]
const staffNav: NavItem[] = [
  { label: 'Dashboard', to: '/staff/dashboard', icon: LayoutDashboard, section: 'My tasks' },
  { label: 'Borrow & return', to: '/staff/circulation', icon: CalendarClock },
  { label: 'Book queue', to: '/staff/reservations', icon: BookMarked },
  { label: 'Printing queue', to: '/staff/printing', icon: Printer },
  { label: 'Attendance', to: '/staff/attendance', icon: QrCode },
  { label: 'Announcements', to: '/staff/announcements', icon: Megaphone },
  { label: 'Notifications', to: '/staff/notifications', icon: Bell },
]
const navigation = (role: Role) => role === 'admin' ? adminNav : role === 'librarian' ? librarianNav : role === 'staff' ? staffNav : userNav(role)

function Sidebar({ role, open, onClose, collapsed, onToggleCollapse }: { role: Role; open: boolean; onClose: () => void; collapsed: boolean; onToggleCollapse: () => void }) {
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
      <aside id="portal-navigation" aria-label="Portal navigation" inert={!open && mobile ? true : undefined} className={cn('portal-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col overflow-hidden bg-[#0b5ea2] text-white transition-[width,transform] duration-300 ease-out lg:max-w-none lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full', collapsed && 'lg:w-[5.5rem]')}>
        <div className={cn('flex h-20 shrink-0 items-center gap-2 border-b border-white/10 px-4 transition-[padding] duration-300', collapsed && 'lg:justify-center lg:px-2')}>
          <div className={cn('flex min-w-0 flex-1 items-center gap-2', collapsed && 'lg:flex-none')}>
            <img src="/logo.jpg" alt="STI College Ormoc Logo" className={cn('h-11 w-11 shrink-0 rounded-sm object-contain', collapsed && 'lg:h-8 lg:w-8')} />
            <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
              <p className="whitespace-nowrap font-display text-[11px] font-black leading-tight tracking-tight text-white">STI COLLEGE ORMOC</p>
              <p className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] text-[#FFF200]">Online Library</p>
            </div>
            <button type="button" onClick={onToggleCollapse} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex">
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          <button onClick={onClose} aria-label="Close navigation menu" className="ml-auto min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button>
        </div>
        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 transition-[padding] duration-300', collapsed && 'lg:px-2')}>
          {nav.map((item) => {
            const Icon = item.icon
            return <div key={item.to}>{item.section ? <p className={cn('mb-2 mt-4 overflow-hidden whitespace-nowrap px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40 transition-all duration-300 first:mt-0', collapsed ? 'lg:mb-1 lg:mt-2 lg:h-0 lg:px-0 lg:opacity-0' : 'opacity-100')}>{item.section}</p> : null}<NavLink title={item.label} onClick={onClose} to={item.to} className={({ isActive }) => cn('mb-1 flex items-center gap-3 overflow-hidden rounded-xl px-3 py-3 text-sm font-medium transition-[background-color,color,padding,gap] duration-300 lg:py-2.5', collapsed && 'lg:justify-center lg:gap-0 lg:px-0', isActive ? 'bg-white text-[#0b5ea2] shadow-sm dark:bg-[#FFF200]' : 'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} className="shrink-0" /><span className={cn('truncate whitespace-nowrap transition-opacity duration-200', collapsed && 'lg:sr-only')}>{item.label}</span></NavLink></div>
          })}
        </nav>
      </aside>
    </>
  )
}

function profileBase(role: Role) {
  if (role === 'faculty') return '/faculty/profile'
  if (role === 'librarian') return '/librarian/profile'
  if (role === 'staff') return '/staff/profile'
  if (role === 'admin') return null
  return '/student/profile'
}

function accountInitials(name: string | null | undefined, roleLabel: string) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return roleLabel.slice(0, 2).toUpperCase()
}

function AccountMenu({ role, onRequestSignOut }: { role: Role; onRequestSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [profileSchoolId, setProfileSchoolId] = useState<string | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const navigate = useNavigate()
  const preview = useMockAuth()
  const claims = preview.identity ?? getCurrentIdentity()
  const { isDark, toggleTheme } = useTheme()
  const fallbackRole = claims?.role ?? (role === 'librarian' ? 'Librarian' : role === 'staff' ? 'Staff' : role === 'faculty' ? 'Faculty' : role === 'admin' ? 'Admin' : 'Student')
  const schoolId = profileSchoolId ?? claims?.schoolId ?? 'STI account'
  const displayRole = profileRole ?? fallbackRole
  const displayName = profileName ?? claims?.fullName ?? null
  const initials = accountInitials(displayName, String(displayRole))
  const base = profileBase(role)
  const sections = [
    ['personal', 'Personal details', UserRound],
    ['school', 'School details', GraduationCap],
    ['photo', 'Profile photo', Camera],
  ] as const

  useEffect(() => {
    let active = true
    const token = getAccessToken()
    if (!token && !preview.enabled) return
    void usersApi.myProfile()
      .then((profile) => {
        if (!active || !profile) return
        const fromParts = [profile.first_name, profile.last_name].map((part) => part?.trim()).filter(Boolean).join(' ')
        setProfileName(fromParts || profile.full_name || null)
        setProfileSchoolId(profile.school_id)
        setProfileRole(profile.role)
      })
      .catch(() => { /* preview identity stays visible when the profile service is offline */ })
    if (!token) return () => { active = false }
    void usersApi.myAvatar()
      .then((avatar) => { if (active) setAvatarUrl(avatar?.currentUrl ?? null) })
      .catch(() => { /* initials remain when the picture cannot load */ })
    return () => { active = false }
  }, [role, claims?.schoolId, claims?.userId, claims?.role, claims?.source, preview.enabled])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const menuItemClass = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#0b5ea2] transition hover:bg-[#0b5ea2]/5 dark:text-white dark:hover:bg-white/10'

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${displayName ?? schoolId}`}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full ring-2 ring-[#FFF200]/80 transition hover:ring-[#FFF200] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2]"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF200] text-xs font-black text-[#0b5ea2]">{initials}</span>
        )}
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Account options" className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 overflow-hidden rounded-2xl border border-[#0b5ea2]/15 bg-white p-1.5 shadow-xl dark:border-white/15 dark:bg-[#22232e]">
          <div className="border-b border-[#0b5ea2]/10 px-3 py-2.5 dark:border-white/10">
            <p className="truncate text-sm font-bold text-[#0b5ea2] dark:text-white">{displayName ?? 'Library account'}</p>
            <p className="mt-0.5 truncate text-xs text-[#0b5ea2]/60 dark:text-white/60">{schoolId}</p>
            <p className="mt-0.5 truncate text-xs text-[#0b5ea2]/60 dark:text-white/60">{displayRole}</p>
          </div>
          <div className="pt-1">
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => toggleTheme()}>
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
              <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {base ? sections.map(([section, label, Icon]) => (
              <button key={section} type="button" role="menuitem" className={menuItemClass} onClick={() => { setOpen(false); navigate(`${base}?section=${section}`) }}>
                <Icon size={17} />
                <span>{label}</span>
              </button>
            )) : null}
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { setOpen(false); onRequestSignOut() }}>
              <LogOut size={17} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function PortalLayout({ role }: { role: Role }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const nav = navigation(role)
  const current = nav.find((item) => location.pathname.startsWith(item.to))
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
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
  const signOut = () => { void logout(); navigate('/login', { replace: true }) }

  return (
    <div className="portal-layout min-h-screen bg-[#FFFFFF] text-[#0b5ea2] transition-colors dark:bg-[#14151b] dark:text-[#f2f6ff]">
      <Sidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={desktopCollapsed} onToggleCollapse={() => setDesktopCollapsed((value) => !value)} />
      <div className={cn('transition-[padding] duration-300 ease-out', desktopCollapsed ? 'lg:pl-[5.5rem]' : 'lg:pl-64')} style={{ '--sidebar-offset': desktopCollapsed ? '5.5rem' : '16rem' } as CSSProperties} inert={sidebarOpen ? true : undefined}>
        <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-[#0b5ea2]/10 bg-white/90 px-4 backdrop-blur-xl transition-colors sm:px-6 lg:px-8 dark:border-white/10 dark:bg-[#14151b]/92">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="shrink-0 rounded-xl border border-[#0b5ea2]/15 p-2.5 text-[#0b5ea2]/65 lg:hidden dark:border-white/15 dark:text-white/70"><Menu size={19} /></button>
          <div className="hidden min-w-0 sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0b5ea2]/45 dark:text-white/45">{role === 'admin' ? 'Admin workspace' : role === 'librarian' ? 'Library Admin workspace' : role === 'staff' ? 'Staff workspace' : role === 'faculty' ? 'Faculty portal' : 'Student portal'}</p><p className="mt-0.5 truncate font-display text-sm font-bold text-[#0b5ea2] dark:text-white">{current?.label ?? 'STI College Ormoc ILMS'}</p></div>
          <label className="relative ml-auto hidden w-64 xl:block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0b5ea2]/45 dark:text-white/45" size={15} /><input placeholder="Search anywhere..." className="h-10 w-full rounded-xl border border-[#0b5ea2]/15 bg-[#0b5ea2]/5 pl-9 pr-3 text-sm outline-none transition focus:border-[#0b5ea2]/15 focus:bg-white focus:ring-4 focus:ring-[#0b5ea2]/10 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:bg-[#002266]" /></label>
          <div className="ml-auto flex items-center gap-2 xl:ml-3"><NotificationBell role={role} /><AccountMenu role={role} onRequestSignOut={() => setShowLogoutConfirm(true)} /></div>
        </header>
        <SessionActivity /><main className="portal-content mx-auto min-w-0 max-w-[1500px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
        {role !== 'admin' ? <AttendanceFab role={role} /> : null}
      </div>
      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b5ea2]/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-[#0b5ea2]/15 bg-white p-6 shadow-2xl dark:border-white/15 dark:bg-[#22232e]">
            <h3 className="font-display text-xl font-bold text-[#0b5ea2] dark:text-white">Sign out</h3>
            <p className="mt-2 text-sm text-[#0b5ea2]/70 dark:text-white/70">Are you sure you want to sign out of your account?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowLogoutConfirm(false)} className="h-10 rounded-xl px-4 text-sm font-bold text-[#0b5ea2] hover:bg-[#0b5ea2]/5 dark:text-white dark:hover:bg-white/10">Cancel</button>
              <button type="button" onClick={signOut} className="h-10 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white">Sign out</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
