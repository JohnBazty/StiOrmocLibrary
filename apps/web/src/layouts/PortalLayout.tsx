import { AdminSidebarNavigation } from './AdminSidebarNavigation'
import { BrandLogo } from '../components/BrandLogo'
import { AdminRightQuickSidebar } from './AdminRightQuickSidebar'
import { librarianNav } from './admin-navigation'
import { AttendanceConfirmationPrompt } from '../features/attendance/AttendanceConfirmationPrompt'
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LibraryBig,
  Lock,
  LogOut,
  Menu,
  Map,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  QrCode,
  ShoppingCart,
  Users,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../components/ui'
import { getCurrentIdentity } from '../features/auth/auth-storage'
import { logout } from '../features/auth/auth-api'
import { AttendanceFab } from '../features/attendance/AttendanceFab'
import { useMockAuth } from '../features/inventory/MockAuthContext'
import { ThemeToggle } from '../features/theme/ThemeToggle'
import { SessionActivity } from '../features/auth/SessionActivity'
import { NotificationShortcut } from '../features/notifications/NotificationShortcut'
import { notificationApi } from '../features/notifications/notification-api'
import { formatManilaTime12 } from '../features/notifications/LibrarySchedulePage'
import type { ManagedLibrarySchedule } from '../features/notifications/types'
import { SidebarAccountCard } from './SidebarAccountCard'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import {
  LEFT_SIDEBAR_COLLAPSE_THRESHOLD,
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  loadWorkspaceLayoutPrefs,
  saveWorkspaceLayoutPrefs,
} from './workspace-layout-prefs'

function getPatronLibraryClosedReason(schedule: ManagedLibrarySchedule | null, now = new Date()): string | null {
  if (!schedule) return null
  const shifted = new Date(now.getTime() + 8 * 3600_000)
  const dateKey = shifted.toISOString().slice(0, 10)
  const timeHHMM = shifted.toISOString().slice(11, 16)
  const jsDay = shifted.getUTCDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay

  const closures = Array.isArray(schedule.upcomingClosures) ? schedule.upcomingClosures : []
  const closure = closures.find((c) => c.date === dateKey)
  if (closure) {
    if (closure.startsAt && closure.endsAt) {
      if (timeHHMM >= closure.startsAt && timeHHMM < closure.endsAt) {
        return `${closure.reason} (${formatManilaTime12(closure.startsAt)} – ${formatManilaTime12(closure.endsAt)} Manila time)`
      }
    } else {
      return `${closure.reason} (Closed all day)`
    }
  }

  const weekly = Array.isArray(schedule.weekly) ? schedule.weekly : []
  const rule = weekly.find((d) => d.dayOfWeek === dayOfWeek)
  if (!rule || !rule.isOpen || !rule.opensAt || !rule.closesAt) {
    return 'Scheduled weekly closed day'
  }
  if (timeHHMM < rule.opensAt || timeHHMM >= rule.closesAt) {
    return `Outside library operating hours (${formatManilaTime12(rule.opensAt)} – ${formatManilaTime12(rule.closesAt)} Manila time)`
  }
  return null
}

type Role = 'student' | 'faculty' | 'admin' | 'librarian' | 'staff'
type NavItem = { label: string; to: string; icon: LucideIcon; section?: string }

const userNav = (role: 'student' | 'faculty'): NavItem[] => {
  const prefix = role === 'faculty' ? '/faculty' : '/student'
  return [
    { label: 'Dashboard', to: `${prefix}/dashboard`, icon: LayoutDashboard },
    { label: 'Library catalog', to: `${prefix}/library`, icon: BookOpen, section: 'Explore library' },
    { label: 'Research & thesis', to: `${prefix}/research`, icon: FileText },
    { label: 'Library schedule', to: `${prefix}/library-schedule`, icon: CalendarClock },
    { label: 'Library floor plan', to: `${prefix}/floor-plan`, icon: Map },
    { label: 'Book cart', to: `${prefix}/cart`, icon: ShoppingCart, section: 'My borrowing' },
    { label: 'Requests & reservations', to: `${prefix}/reservations`, icon: BookMarked },
    { label: 'My books', to: `${prefix}/my-books`, icon: LibraryBig },
    { label: 'Borrowing history', to: `${prefix}/borrowing`, icon: CalendarClock },
    { label: 'Printing service', to: `${prefix}/printing`, icon: Printer, section: 'Services' },
    { label: 'QR attendance', to: `${prefix}/attendance`, icon: QrCode },
    { label: 'Fines', to: `${prefix}/fines`, icon: CircleDollarSign, section: 'Payments & clearance' },
    { label: 'Transactions', to: `${prefix}/transactions`, icon: CircleDollarSign },
    { label: 'Clearance status', to: `${prefix}/clearance`, icon: BadgeCheck },
    { label: 'My profile', to: `${prefix}/profile`, icon: UserRound, section: 'My account' },
  ]
}

const adminNav: NavItem[] = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, section: 'Accounts' },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'QR Roster', to: '/admin/student-qr-roster', icon: QrCode },
  { label: 'Clearance', to: '/admin/clearance', icon: ClipboardCheck },
  { label: 'Library schedule', to: '/admin/library-schedule', icon: CalendarClock },
  { label: 'Notifications', to: '/admin/notifications', icon: Bell },
]
const staffNav: NavItem[] = [
  { label: 'Dashboard', to: '/staff/dashboard', icon: LayoutDashboard, section: 'My tasks' },
  { label: 'Borrow & return', to: '/staff/circulation', icon: CalendarClock },
  { label: 'Book queue', to: '/staff/reservations', icon: BookMarked },
  { label: 'Printing queue', to: '/staff/printing', icon: Printer },
  { label: 'Online payments', to: '/staff/payments', icon: CircleDollarSign },
  { label: 'Attendance', to: '/staff/attendance', icon: QrCode },
  { label: 'Announcements', to: '/staff/announcements', icon: Megaphone },
  { label: 'Library schedule', to: '/staff/library-schedule', icon: CalendarClock },
  { label: 'Notifications', to: '/staff/notifications', icon: Bell },
  { label: 'My profile', to: '/staff/profile', icon: UserRound },
]
const navigation = (role: Role): NavItem[] => role === 'admin' ? adminNav : role === 'librarian' ? librarianNav : role === 'staff' ? staffNav : userNav(role)

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandLogo className="h-10 w-10 shadow-sm" />
      {!compact ? <div className="min-w-0"><p className="truncate font-display text-sm font-black leading-tight tracking-tight text-white">STI COLLEGE ORMOC</p><p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">ILMS</p></div> : null}
    </div>
  )
}

function Sidebar({
  role,
  open,
  desktopCollapsed,
  width,
  isResizing,
  onClose,
  onResize,
  onCollapseDesktop,
  onResizingChange,
}: {
  role: Role
  open: boolean
  desktopCollapsed: boolean
  width: number
  isResizing: boolean
  onClose: () => void
  onResize: (nextWidth: number) => void
  onCollapseDesktop: () => void
  onResizingChange: (active: boolean) => void
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
  const preview = useMockAuth()
  const claims = preview.identity ?? getCurrentIdentity()
  const isInert = mobile ? !open : desktopCollapsed
  return (
    <>
      {open ? <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-[#0b5ea2]/45 backdrop-blur-sm lg:hidden" /> : null}
      <aside
        id="portal-navigation"
        aria-label="Portal navigation"
        inert={isInert ? true : undefined}
        className={cn(
          'portal-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col bg-[#0b5ea2] text-white lg:max-w-none',
          isResizing ? 'transition-none' : 'transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full',
          desktopCollapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0',
        )}
      >
        <div className="flex h-20 items-center justify-between gap-2 border-b border-white/10 px-4"><Brand /><button onClick={onClose} aria-label="Close navigation menu" className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button></div>
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {role === 'librarian' ? <AdminSidebarNavigation onNavigate={onClose}/> : nav.map((item) => {
            const Icon = item.icon
            return <div key={item.to}>{item.section ? <h2 className="mb-2 mt-4 px-3 text-xs font-bold uppercase text-white/65">{item.section}</h2> : null}<NavLink onClick={onClose} to={item.to} className={({ isActive }) => cn('mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition lg:py-2.5', isActive ? 'bg-white text-[#0b5ea2] shadow-sm dark:bg-[#FFF200]' : 'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span></NavLink></div>
          })}
        </nav>
        <div className="border-t border-white/10 p-3"><SidebarAccountCard key={`${claims?.source}:${claims?.userId}`} identity={claims} preview={preview.enabled} /></div>
        {!desktopCollapsed ? (
          <SidebarResizeHandle
            side="left"
            label="Resize navigation sidebar"
            width={width}
            minWidth={LEFT_SIDEBAR_MIN_WIDTH}
            maxWidth={LEFT_SIDEBAR_MAX_WIDTH}
            defaultWidth={LEFT_SIDEBAR_DEFAULT_WIDTH}
            collapseThreshold={LEFT_SIDEBAR_COLLAPSE_THRESHOLD}
            onResize={onResize}
            onCollapse={onCollapseDesktop}
            onResizingChange={onResizingChange}
            className="hidden lg:flex"
          />
        ) : null}
      </aside>
    </>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function PortalLayout({ role }: { role: Role }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [layoutPrefs, setLayoutPrefs] = useState(loadWorkspaceLayoutPrefs)
  const [isResizing, setIsResizing] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const isStaffWorkspace = role === 'librarian' || role === 'admin' || role === 'staff'
  const isPatronWorkspace = role === 'student' || role === 'faculty'
  const { leftCollapsed, leftWidth, rightOpen: rightSidebarOpen, rightWidth } = layoutPrefs

  useEffect(() => {
    saveWorkspaceLayoutPrefs(layoutPrefs)
  }, [layoutPrefs])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'b') return
      if (isEditableTarget(event.target)) return
      const isDesktop = window.matchMedia?.('(min-width: 1024px)').matches ?? true
      if (!isDesktop) return
      event.preventDefault()
      setLayoutPrefs((current) => ({ ...current, leftCollapsed: !current.leftCollapsed }))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const [librarySchedule, setLibrarySchedule] = useState<ManagedLibrarySchedule | null>(null)
  const [clockTick, setClockTick] = useState(() => Date.now())

  useEffect(() => {
    if (!isPatronWorkspace) return
    const controller = new AbortController()
    const loadSchedule = () => {
      void notificationApi
        .librarySchedule(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setLibrarySchedule(data)
        })
        .catch(() => {})
    }
    loadSchedule()
    const timer = window.setInterval(() => {
      setClockTick(Date.now())
      loadSchedule()
    }, 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [isPatronWorkspace])

  const viewOnlyReason = useMemo(
    () => (isPatronWorkspace ? getPatronLibraryClosedReason(librarySchedule, new Date(clockTick)) : null),
    [isPatronWorkspace, librarySchedule, clockTick],
  )
  const isViewOnly = Boolean(viewOnlyReason)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const nav = navigation(role)
  const current = [...nav, { label: 'Notifications', to: `/${role}/notifications` }].find((item) => location.pathname.startsWith(item.to))
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
    const controls = () => [...(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary') ?? [])].filter(control => control.getClientRects().length)
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
      setConfirmSignOut(false)
      navigate('/login', { replace: true })
    } catch {
      setSignOutError('Sign out could not be confirmed. Check your connection and try again.')
    } finally { setSigningOut(false) }
  }

  const layoutStyle = {
    '--portal-left-width': `${leftCollapsed ? 0 : leftWidth}px`,
    '--portal-left-panel-width': `${leftWidth}px`,
    '--portal-right-width': `${isStaffWorkspace && rightSidebarOpen ? rightWidth : 0}px`,
    '--portal-right-panel-width': `${rightWidth}px`,
  } as CSSProperties
  const workspaceMaximized = leftCollapsed || (isStaffWorkspace && !rightSidebarOpen)

  return (
    <div
      data-portal={role}
      style={layoutStyle}
      className="portal-layout min-h-dvh bg-[var(--sl-bg)] text-[var(--sl-text)] transition-colors"
    >
      <Sidebar
        role={role}
        open={sidebarOpen}
        desktopCollapsed={leftCollapsed}
        width={leftWidth}
        isResizing={isResizing}
        onClose={() => setSidebarOpen(false)}
        onResize={(nextWidth) => setLayoutPrefs((current) => ({ ...current, leftWidth: nextWidth }))}
        onCollapseDesktop={() => setLayoutPrefs((current) => ({ ...current, leftCollapsed: true }))}
        onResizingChange={setIsResizing}
      />
      <div
        className={cn(
          'portal-main-shell',
          isResizing ? 'transition-none' : 'transition-[padding] duration-200',
        )}
        inert={sidebarOpen ? true : undefined}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/95 px-4 backdrop-blur-md transition-colors sm:px-6 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-controls="portal-navigation" aria-expanded={sidebarOpen} className="mr-3 shrink-0 rounded-[6px] border border-[var(--sl-border-strong)] p-2 text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] lg:hidden"><Menu size={19} /></button>
          <button
            type="button"
            onClick={() => setLayoutPrefs((current) => ({ ...current, leftCollapsed: !current.leftCollapsed }))}
            aria-label={leftCollapsed ? 'Show navigation sidebar' : 'Hide navigation sidebar'}
            aria-controls="portal-navigation"
            aria-expanded={!leftCollapsed}
            title={leftCollapsed ? 'Show navigation sidebar (Ctrl+B)' : 'Hide navigation sidebar (Ctrl+B)'}
            className={cn(
              'mr-3 hidden h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] lg:inline-flex',
              leftCollapsed
                ? 'border-[#0b5ea2]/35 bg-[#0b5ea2]/10 text-[#0b5ea2] hover:bg-[#0b5ea2]/15 dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-300'
                : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]',
            )}
          >
            {leftCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="hidden sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--sl-text-muted)]">{role === 'admin' ? 'Admin workspace' : role === 'librarian' ? 'Library Admin workspace' : role === 'staff' ? 'Staff workspace' : role === 'faculty' ? 'Faculty portal' : 'Student portal'}</p><p className="mt-0.5 font-display text-sm font-semibold text-[var(--sl-text-header)]">{current?.label ?? 'STI College Ormoc ILMS'}</p></div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <NotificationShortcut path={`/${role}/notifications`} />
            <button onClick={() => { setSignOutError(''); setConfirmSignOut(true) }} disabled={signingOut} aria-label="Sign out" title="Sign out" className="rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] p-2 text-[var(--sl-text-secondary)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)] disabled:opacity-50"><LogOut size={18} /></button>
          </div>
        </header>
        {signOutError && <p role="alert" className="m-4 rounded-[8px] p-3 text-sm">{signOutError}</p>}
        <SessionActivity />
        {isViewOnly ? (
          <div
            role="status"
            data-tone="warning"
            className="mx-4 mt-4 flex flex-wrap items-start gap-3 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#991b1b] sm:mx-6 lg:mx-8 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-200"
          >
            <Lock size={18} className="mt-0.5 shrink-0 text-[#b42318] dark:text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Library Closed — View-Only Mode ({viewOnlyReason})
              </p>
              <p className="mt-0.5 text-xs opacity-90">
                Borrowing, reservations, check-ins, and printing transactions are disabled while the library is closed. You can continue viewing the catalog, your history, and library schedule.
              </p>
            </div>
            <NavLink
              to={`/${role}/library-schedule`}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-[6px] border border-red-300 bg-white px-3 text-xs font-semibold text-[#991b1b] hover:bg-red-50 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100"
            >
              <AlertTriangle size={13} /> View library schedule
            </NavLink>
          </div>
        ) : null}
        <main
          data-view-only={isViewOnly ? 'true' : undefined}
          className={cn(
            'portal-content mx-auto min-w-0 p-4 sm:p-6 lg:p-8',
            workspaceMaximized ? 'max-w-none' : 'max-w-[1500px]',
          )}
        >
          <Outlet />
        </main>
        {role !== 'admin' && !isViewOnly ? <AttendanceConfirmationPrompt /> : null}
        {role !== 'admin' && !isViewOnly ? <AttendanceFab role={role} /> : null}
      </div>
      {isStaffWorkspace ? (
        <AdminRightQuickSidebar
          role={role}
          open={rightSidebarOpen}
          width={rightWidth}
          onToggle={() => setLayoutPrefs((current) => ({ ...current, rightOpen: !current.rightOpen }))}
          onResize={(nextWidth) => setLayoutPrefs((current) => ({ ...current, rightWidth: nextWidth }))}
          onResizingChange={setIsResizing}
        />
      ) : null}
      {confirmSignOut ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" onKeyDown={(event) => { if (event.key === 'Escape' && !signingOut) setConfirmSignOut(false) }}><div role="alertdialog" aria-modal="true" aria-labelledby="sign-out-title" aria-describedby="sign-out-text" className="w-full max-w-md overflow-hidden rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-[var(--sl-shadow-l)]"><div className="px-6 py-5"><h2 id="sign-out-title" className="font-display text-lg font-semibold text-[var(--sl-text-header)]">Are you sure you want to sign out?</h2><p id="sign-out-text" className="mt-2 text-sm text-[var(--sl-text-secondary)]">You will need to sign in again to use this portal.</p></div><div className="flex flex-wrap justify-end gap-2 border-t border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-6 py-3"><button type="button" disabled={signingOut} onClick={() => setConfirmSignOut(false)} className="min-h-[38px] rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-hover)] disabled:opacity-50">Cancel</button><button type="button" disabled={signingOut} onClick={() => void signOut()} className="min-h-[38px] rounded-[6px] bg-[#0b5ea2] px-4 text-sm font-semibold text-white hover:bg-[#094e87] disabled:opacity-50">{signingOut ? 'Signing out…' : 'Sign out now'}</button></div></div></div> : null}
    </div>
  )
}
