import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { LogOut, Moon, Sun, UserRound } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../features/theme/ThemeProvider'
import type { AuthenticatedIdentity } from '../features/auth/auth-storage'
import { PROFILE_UPDATED_EVENT } from '../features/users/profile-events'
import { usersApi, type OwnProfile } from '../features/users/users-api'

export function AccountMenu({ identity, preview = false, profilePath, signingOut = false, onSignOut }: {
  identity: AuthenticatedIdentity | null; preview?: boolean; profilePath?: string; signingOut?: boolean; onSignOut: () => void
}) {
  const location = useLocation()
  const { isDark, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false) }
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keydown) }
  }, [open])
  function keyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  useEffect(() => {
    if (!identity || preview) return
    let active = true
    let loading = false
    let refreshQueued = false
    const refresh = async () => {
      if (loading) { refreshQueued = true; return }
      loading = true
      // A photo service outage must not hide the person's name and school ID.
      const results = await Promise.allSettled([usersApi.myProfile(), usersApi.myAvatar()])
      if (active) {
        if (results[0].status === 'fulfilled') setProfile(results[0].value ?? null)
        if (results[1].status === 'fulfilled') { setPhoto(results[1].value?.currentUrl ?? null); setFailedPhoto(null) }
      }
      loading = false
      if (active && refreshQueued) { refreshQueued = false; void refresh() }
    }
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    // Avatar URLs expire after five minutes; refresh while the workspace is visible.
    const timer = window.setInterval(refreshVisible, 60000)
    window.addEventListener('focus', refreshVisible)
    window.addEventListener(PROFILE_UPDATED_EVENT, refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      active = false; window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener(PROFILE_UPDATED_EVENT, refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [identity?.userId, identity?.source, preview, location.pathname])
  const name = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || identity?.fullName || 'Library account'
  const schoolId = profile?.school_id || identity?.schoolId || 'STI account'
  const role = profile?.role || identity?.role || 'Account'
  const parts = name.trim().split(/\s+/)
  const initials = name === 'Library account' ? role.slice(0, 2).toUpperCase() : `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts.at(-1)?.[0] ?? '' : ''}`.toUpperCase()
  const itemClass = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#0b5ea2] transition hover:bg-[#0b5ea2]/5 dark:text-white dark:hover:bg-white/10'
  return <div className="relative" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={`Account menu for ${name}`} disabled={signingOut} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF200] text-sm font-black text-[#0b5ea2] ring-2 ring-[#FFF200]/80 transition hover:ring-[#FFF200] disabled:opacity-50">
      {photo && photo !== failedPhoto ? <img src={photo} alt="Your profile picture" onError={() => setFailedPhoto(photo)} className="h-full w-full object-cover" /> : <span aria-label="Profile initials">{initials}</span>}
    </button>
    {open ? <div id={menuId} ref={menu} role="menu" aria-label="Account options" onKeyDown={keyboard} className="absolute right-0 top-[calc(100%+0.5rem)] z-40 max-h-[calc(100dvh-7rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-[#0b5ea2]/15 bg-white p-1.5 shadow-xl dark:border-white/15 dark:bg-[#22232e]">
      <section aria-label="Signed-in account" className="border-b border-[#0b5ea2]/10 px-3 py-2.5 dark:border-white/10">
        <p className="break-words text-sm font-bold text-[#0b5ea2] dark:text-white">{name}</p>
        <p className="mt-0.5 break-all text-xs text-[#0b5ea2]/60 dark:text-white/70">{schoolId}</p>
        <p className="mt-0.5 text-xs text-[#0b5ea2]/60 dark:text-white/70">{role === 'Librarian' ? 'Librarian / Admin' : role}</p>
      </section>
      <div className="pt-1">
        {profilePath ? <Link role="menuitem" tabIndex={-1} className={itemClass} to={profilePath} onClick={() => setOpen(false)}><UserRound size={17} />Profile</Link> : null}
        <button type="button" role="menuitem" tabIndex={-1} className={itemClass} onClick={toggleTheme}>{isDark ? <Sun size={17} /> : <Moon size={17} />}{isDark ? 'Light mode' : 'Dark mode'}</button>
        <button type="button" role="menuitem" tabIndex={-1} className={itemClass} disabled={signingOut} onClick={() => { setOpen(false); onSignOut() }}><LogOut size={17} />Sign out</button>
      </div>
    </div> : null}
  </div>
}
