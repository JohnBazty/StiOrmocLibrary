import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { AuthenticatedIdentity } from '../features/auth/auth-storage'
import { PROFILE_UPDATED_EVENT } from '../features/users/profile-events'
import { usersApi, type OwnProfile } from '../features/users/users-api'

export function SidebarAccountCard({ identity, preview = false }: { identity: AuthenticatedIdentity | null; preview?: boolean }) {
  const location = useLocation()
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
  return <section aria-label="Signed-in account" className="mt-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF200] text-sm font-black text-[#003399] ring-2 ring-white/20">
        {photo && photo !== failedPhoto ? <img src={photo} alt="Your approved profile picture" onError={() => setFailedPhoto(photo)} className="h-full w-full object-cover" /> : <span aria-label="Profile initials">{initials}</span>}
      </div>
      <div className="min-w-0 flex-1"><p className="break-words text-xs font-bold leading-snug text-white">{name}</p><p className="mt-1 break-all text-[10px] font-medium text-white/80">{schoolId}</p><p className="mt-0.5 text-[10px] text-white/55">{role}</p></div>
    </div>
  </section>
}
