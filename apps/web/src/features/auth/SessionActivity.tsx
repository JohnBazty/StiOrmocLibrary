import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccessToken, saveAccessToken, clearAccessToken, setSessionIdentity } from './auth-storage'
import { logout } from './auth-api'

const IDLE = 600_000
const CHANNEL = 'sti-library-session-activity'
export function SessionActivity() {
  const navigate = useNavigate()
  const [seconds, setSeconds] = useState(600)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    if (!getAccessToken()) return
    let lastActivity = Date.now(), lastSent = 0, pending = false, ended = false
    const token = () => getAccessToken()
    // Broadcast contains timestamps and account identity only, never credentials or QR data.
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
    const account = () => { try { return JSON.parse(atob((token() ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).accountId } catch { return null } }
    const accountId = account()
    const exit = async (broadcast = true) => {
      if (ended) return
      ended = true
      if (broadcast) channel?.postMessage({ type: 'logout', accountId })
      void logout().catch(() => {})
      clearAccessToken(); setSessionIdentity(null)
      navigate('/login', { replace: true, state: { sessionExpired: true } })
    }
    const sendActivity = async () => {
      if (pending || ended || Date.now() - lastSent < 30_000 || Date.now() - lastActivity > 35_000) return
      pending = true
      try {
        const response = await fetch('/api/v1/auth/activity', { method: 'POST', headers: { Authorization: `Bearer ${token() ?? ''}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) })
        if (response.status === 401 || response.status === 403) { void exit(); return }
        if (!response.ok) throw new Error('Session renewal unavailable')
        const payload = await response.json()
        if (ended) return
        if (payload.data?.token) saveAccessToken(payload.data.token)
        lastSent = Date.now(); setUnavailable(false)
      } catch { setUnavailable(true) } finally { pending = false }
    }
    const activity = (event: Event) => {
      if (!event.isTrusted || ended) return
      // Expired sessions cannot be revived by a late click after device sleep.
      if (Date.now() - lastActivity >= IDLE) { void exit(); return }
      lastActivity = Date.now()
      channel?.postMessage({ type: 'activity', accountId, at: lastActivity })
      void sendActivity()
    }
    channel?.addEventListener('message', event => {
      if (event.data?.accountId !== accountId) return
      if (event.data.type === 'logout') void exit(false)
      else if (event.data.type === 'activity' && Number.isFinite(event.data.at)) { lastActivity = Math.max(lastActivity, Math.min(Date.now(), event.data.at)); void sendActivity() }
    })
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'click']
    events.forEach(name => window.addEventListener(name, activity, { passive: true, capture: true }))
    void sendActivity()
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((IDLE - (Date.now() - lastActivity)) / 1000))
      setSeconds(remaining)
      if (!remaining) void exit()
      else void sendActivity()
    }, 1000)
    return () => { ended = true; clearInterval(timer); channel?.close(); events.forEach(name => window.removeEventListener(name, activity, true)) }
  }, [navigate])
  return <>{seconds <= 60 ? <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-lg lg:left-72">You will be signed out in <span className="tabular-nums" aria-live="off">{seconds}</span> seconds because of inactivity. <button type="button" className="ml-2 min-h-11 rounded-lg bg-[#003399] px-4 font-semibold text-white">Keep me signed in</button></div> : null}{unavailable ? <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Connection interrupted. Your session will renew when the connection returns; keep a copy of unfinished work.</p> : null}</>
}
