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
  PackageOpen,
  PanelLeftClose,
  Printer,
  QrCode,
  Search,
  Settings,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../components/ui'
import { getCurrentIdentity } from '../features/auth/auth-storage'
import { logout } from '../features/auth/auth-api'
import { useMockAuth } from '../features/inventory/MockAuthContext'

type Role = 'student' | 'admin'
type NavItem = { label: string; to: string; icon: LucideIcon; section?: string }

const studentNav: NavItem[] = [
  { label: 'Overview', to: '/student/dashboard', icon: LayoutDashboard, section: 'My library' },
  { label: 'Book catalog', to: '/student/catalog', icon: BookOpen },
  { label: 'Research & thesis', to: '/student/research', icon: FileText },
  { label: 'Borrowing history', to: '/student/borrowing', icon: CalendarClock, section: 'My activity' },
  { label: 'Reservations', to: '/student/reservations', icon: BookMarked },
  { label: 'Printing service', to: '/student/printing', icon: Printer },
  { label: 'QR attendance', to: '/student/attendance', icon: QrCode },
  { label: 'Notifications', to: '/student/notifications', icon: Bell, section: 'My account' },
  { label: 'Clearance status', to: '/student/clearance', icon: BadgeCheck },
]

const adminNav: NavItem[] = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, section: 'Operations' },
  { label: 'Books & research', to: '/admin/catalog', icon: BookOpen },
  { label: 'Categories', to: '/admin/categories', icon: Tags },
  { label: 'Borrow & return', to: '/admin/circulation', icon: CalendarClock },
  { label: 'Reservations', to: '/admin/reservations', icon: BookMarked },
  { label: 'Fines', to: '/admin/fines', icon: CircleDollarSign },
  { label: 'Inventory', to: '/admin/inventory', icon: Archive, section: 'Resources' },
  { label: 'Printing queue', to: '/admin/printing', icon: Printer },
  { label: 'Print supplies', to: '/admin/supplies', icon: PackageOpen },
  { label: 'Attendance', to: '/admin/attendance', icon: QrCode, section: 'People & records' },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'Clearance', to: '/admin/clearance', icon: ClipboardCheck },
  { label: 'Reports', to: '/admin/reports', icon: FileBarChart },
]

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFF200] text-[#003399] shadow-sm"><LibraryBig size={22} strokeWidth={2.5} /><span className="absolute bottom-0 h-1 w-full bg-[#003399]" /></div>
      {!compact ? <div><p className="font-display text-sm font-black leading-tight tracking-tight text-white">STI ORMOC</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Smart Library</p></div> : null}
    </div>
  )
}

function Sidebar({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const nav = role === 'student' ? studentNav : adminNav
  const preview = useMockAuth()
  const claims = preview.identity ?? getCurrentIdentity()
  return (
    <>
      {open ? <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-[#003399]/45 backdrop-blur-sm lg:hidden" /> : null}
      <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#003399] text-white transition-transform duration-300 lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5"><Brand /><button onClick={onClose} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button></div>
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {nav.map((item) => {
            const Icon = item.icon
            return <div key={item.to}>{item.section ? <p className="mb-2 mt-4 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40 first:mt-0">{item.section}</p> : null}<NavLink onClick={onClose} to={item.to} className={({ isActive }) => cn('mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-white text-[#003399] shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white')}><Icon size={17} /><span>{item.label}</span></NavLink></div>
          })}
        </nav>
        <div className="border-t border-white/10 p-3"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"><Settings size={17} /> Settings</button><div className="mt-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF200] text-xs font-black text-[#003399]">{claims?.role.slice(0, 2).toUpperCase() ?? 'ST'}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-white">{claims?.schoolId ?? 'STI account'}</p><p className="mt-0.5 text-[10px] text-white/50">{claims?.role ?? role}</p></div></div></div></div>
      </aside>
    </>
  )
}

export function PortalLayout({ role }: { role: Role }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const nav = role === 'student' ? studentNav : adminNav
  const current = nav.find((item) => location.pathname.startsWith(item.to))
  const signOut = async () => { await logout(); navigate('/login', { replace: true }) }

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#003399]">
      <Sidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center border-b border-[#003399]/10 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="mr-3 rounded-xl border border-[#003399]/15 p-2.5 text-[#003399]/65 lg:hidden"><Menu size={19} /></button>
          <div className="hidden sm:block"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#003399]/45">{role === 'student' ? 'Student portal' : 'Admin workspace'}</p><p className="mt-0.5 font-display text-sm font-bold text-[#003399]">{current?.label ?? 'Smart Library'}</p></div>
          <label className="relative ml-auto hidden w-64 xl:block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#003399]/45" size={15} /><input placeholder="Search anywhere..." className="h-10 w-full rounded-xl border border-[#003399]/15 bg-[#003399]/5 pl-9 pr-3 text-sm outline-none transition focus:border-[#003399]/15 focus:bg-white focus:ring-4 focus:ring-[#003399]/10" /></label>
          <div className="ml-auto flex items-center gap-2 xl:ml-3">
            <button aria-label="Notifications" className="relative rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 transition hover:bg-[#003399]/5"><Bell size={18} /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#FFF200] ring-2 ring-white" /></button>
            <button onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 transition hover:bg-[#003399]/5"><LogOut size={18} /></button>
            <button aria-label="Collapse sidebar" className="hidden rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]/65 lg:block"><PanelLeftClose size={18} /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
