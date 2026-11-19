import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '../components/ui'
import { adminNavigation, type AdminNavGroup, type AdminNavItem } from './admin-navigation'

function containsPath(item: AdminNavItem, pathname: string): boolean {
  return 'children' in item
    ? item.children.some(child => containsPath(child, pathname))
    : pathname === item.to || pathname.startsWith(item.to + '/')
}

function NavigationGroup({ item, pathname, onNavigate }: { item: AdminNavGroup; pathname: string; onNavigate: () => void }) {
  const element = useRef<HTMLDetailsElement>(null)
  const active = containsPath(item, pathname)
  useEffect(() => {
    if (element.current) element.current.open = active
  }, [pathname, active])
  const Icon = item.icon
  return (
    <details ref={element} open={active || undefined} className="sidebar-nav-group">
      <summary
        className={cn(
          'flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-[6px] px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden',
          active ? 'bg-white/12 text-white font-semibold' : 'text-white/75 hover:bg-white/10 hover:text-white',
        )}
      >
        <Icon size={17} className="shrink-0 opacity-90" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <ChevronDown size={15} aria-hidden="true" className="sidebar-nav-chevron shrink-0 opacity-65 transition-transform" />
      </summary>
      <NavigationList items={item.children} pathname={pathname} onNavigate={onNavigate} />
    </details>
  )
}

function NavigationList({
  items,
  pathname,
  onNavigate,
  root = false,
  sectionLabel,
}: {
  items: AdminNavItem[]
  pathname: string
  onNavigate: () => void
  root?: boolean
  sectionLabel?: string
}) {
  return (
    <ul
      aria-label={root ? 'Admin menu' : sectionLabel}
      className={root || sectionLabel ? 'space-y-0.5' : 'my-1 ml-3.5 space-y-0.5 border-l border-white/15 pl-2.5'}
    >
      {items.map(item => {
        if ('children' in item) {
          if (item.section) {
            return (
              <li key={item.id}>
                <h2 className="px-2.5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">
                  {item.label}
                </h2>
                <NavigationList items={item.children} pathname={pathname} onNavigate={onNavigate} sectionLabel={item.label} />
              </li>
            )
          }
          return (
            <li key={item.id}>
              <NavigationGroup item={item} pathname={pathname} onNavigate={onNavigate} />
            </li>
          )
        }
        const Icon = item.icon
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              end={item.to.endsWith('/dashboard')}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center gap-3 rounded-[6px] px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  isActive
                    ? 'bg-white font-semibold text-[#0b5ea2] shadow-[var(--sl-shadow-xs)] dark:bg-[#FFF200] dark:text-[#0b5ea2]'
                    : 'font-medium text-white/75 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon size={17} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}

export function AdminSidebarNavigation({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation()
  return <NavigationList items={adminNavigation} pathname={pathname} onNavigate={onNavigate} root />
}
