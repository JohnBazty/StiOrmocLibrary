import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { decodeAccessToken, getAccessToken, saveAccessToken, clearAccessToken, setSessionIdentity } from './auth-storage'
import { resumeDeviceSession } from './auth-api'

const IDLE = 600_000
const CHANNEL = 'sti-library-session-activity'
export function SessionActivity() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = useRef('')
  currentPath.current = location.pathname + location.search + location.hash
  const [seconds, setSeconds] = useState(600)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const initialToken = getAccessToken()
    if (!initialToken) return
    const initial = decodeAccessToken(initialToken, true)
    const sessionId = initial?.sessionId
    const rememberedUntil = initial?.rememberedUntil
    let lastActivity = initial?.idleUntil ? initial.idleUntil - IDLE : Date.now()
    let lastSent = 0, pending = false, ended = false
    let hasGesture = !initial?.deviceSession
    const token = () => getAccessToken()
    // Broadcast contains timestamps and account identity only, never credentials or QR data.
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
    const accountId = initial?.userId
    const exit = (reason: 'idle' | 'expired' | 'logout' = 'idle') => {
      if (ended) return
      ended = true
      clearAccessToken(); setSessionIdentity(null)
      const login = initial && ['Admin', 'Librarian', 'Staff'].includes(initial.role) ? '/staff' : '/login'
      navigate(login, { replace: true, state: { deniedPath: currentPath.current, sessionExpired: reason !== 'logout', rememberedExpired: reason === 'expired' } })
    }
    const resume = async () => {
      if (pending || ended || !initial?.deviceSession || document.visibilityState === 'hidden') return
      if (rememberedUntil && Date.now() >= rememberedUntil) { exit('expired'); return }
      pending = true
      try {
        const identity = await resumeDeviceSession(sessionId)
        if (ended) return
        if (!identity) { exit(); return }
        const resumed = decodeAccessToken(token() ?? '')
        lastActivity = resumed?.idleUntil ? resumed.idleUntil - IDLE : Date.now()
        lastSent = Date.now()
        setUnavailable(false)
      } catch { if (!ended) setUnavailable(true) }
      finally { pending = false }
    }
    const sendActivity = async () => {
      if (pending || ended || !hasGesture || Date.now() - lastSent < 30_000 || Date.now() - lastActivity > 35_000) return
      if (initial?.deviceSession && !decodeAccessToken(token() ?? '')) { void resume(); return }
      pending = true
      hasGesture = false
      try {
        const response = await fetch('/api/v1/auth/activity', { method: 'POST', headers: { Authorization: `Bearer ${token() ?? ''}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) })
        if (response.status === 401 || response.status === 403) {
          if (initial?.deviceSession) { pending = false; void resume() }
          else exit()
          return
        }
        if (!response.ok) throw new Error('Session renewal unavailable')
        const payload = await response.json()
        if (ended || !token() || (sessionId && decodeAccessToken(token() ?? '', true)?.sessionId !== sessionId)) return
        if (payload.data?.token) saveAccessToken(payload.data.token)
        lastSent = Date.now(); setUnavailable(false)
      } catch { if (!ended) { hasGesture = true; setUnavailable(true) } } finally { pending = false }
    }
    const activity = (event: Event) => {
      if (!event.isTrusted || ended) return
      if (initial?.deviceSession && !decodeAccessToken(token() ?? '')) { void resume(); return }
      if (Date.now() - lastActivity >= IDLE) { exit(); return }
      lastActivity = Date.now()
      hasGesture = true
      channel?.postMessage({ type: 'activity', accountId, sessionId, at: lastActivity })
      void sendActivity()
    }
    channel?.addEventListener('message', event => {
      if (event.data?.accountId !== accountId || (sessionId && event.data.sessionId !== sessionId)) return
      if (event.data.type === 'logout') exit('logout')
      else if (event.data.type === 'activity' && Number.isFinite(event.data.at)) {
        lastActivity = Math.max(lastActivity, Math.min(Date.now(), event.data.at))
        if (document.visibilityState !== 'hidden') { hasGesture = true; void sendActivity() }
      }
    })
    const returned = () => {
      if (initial?.deviceSession && !decodeAccessToken(token() ?? '')) void resume()
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'click']
    events.forEach(name => window.addEventListener(name, activity, { passive: true, capture: true }))
    window.addEventListener('focus', returned)
    window.addEventListener('online', returned)
    document.addEventListener('visibilitychange', returned)
    void sendActivity()
    const timer = window.setInterval(() => {
      if (rememberedUntil) {
        if (Date.now() >= rememberedUntil) exit('expired')
        else if (hasGesture && decodeAccessToken(token() ?? '')) void sendActivity()
        return
      }
      const remaining = Math.max(0, Math.ceil((IDLE - (Date.now() - lastActivity)) / 1000))
      setSeconds(remaining)
      if (!remaining && !pending) exit()
      else void sendActivity()
    }, 1000)
    return () => {
      ended = true; clearInterval(timer); channel?.close()
      events.forEach(name => window.removeEventListener(name, activity, true))
      window.removeEventListener('focus', returned)
      window.removeEventListener('online', returned)
      document.removeEventListener('visibilitychange', returned)
    }
  }, [navigate])
  return <>{seconds <= 60 ? <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-lg lg:left-72">You will be signed out in <span className="tabular-nums" aria-live="off">{seconds}</span> seconds because of inactivity. <button type="button" className="ml-2 min-h-11 rounded-lg bg-[#0b5ea2] px-4 font-semibold text-white">Keep me signed in</button></div> : null}{unavailable ? <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Connection interrupted. Your session will renew when the connection returns; keep a copy of unfinished work.</p> : null}</>
}
