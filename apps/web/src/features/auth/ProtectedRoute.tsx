import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { rememberedDeviceExpired, resolveSessionIdentity, resumeDeviceSession } from './auth-api'
import {
  clearAccessToken, dashboardForRole, getCurrentIdentity, getCurrentClaims,
  type AuthenticatedIdentity, type AuthRole,
} from './auth-storage'
import { useMockAuth } from '../inventory/MockAuthContext'

function LoadingAuthentication() {
  return <main className="flex min-h-screen items-center justify-center bg-[#FFFFFF] text-[#0b5ea2]"><div className="text-center"><div className="mx-auto h-10 w-10 animate-pulse rounded-xl bg-[#FFF200]" /><p className="mt-4 text-sm font-bold">Opening your secure workspace…</p></div></main>
}

function useResolvedIdentity() {
  const preview = useMockAuth()
  const immediate = getCurrentIdentity()
  const [identity, setIdentity] = useState<AuthenticatedIdentity | null>(immediate)
  const [checking, setChecking] = useState(!immediate)
  const [retry, setRetry] = useState(0)
  const [reconnectError, setReconnectError] = useState(false)
  const [rememberedExpired] = useState(rememberedDeviceExpired)

  useEffect(() => {
    if (preview.enabled) return
    if (identity) return
    let active = true
    setChecking(true)
    setReconnectError(false)
    resumeDeviceSession().then(device => device ?? resolveSessionIdentity()).then(resolved => {
      if (active) { setIdentity(resolved); setChecking(false) }
    }).catch(() => {
      if (active) { setReconnectError(true); setChecking(false) }
    })
    return () => { active = false }
  }, [identity, preview.enabled, retry])

  if (preview.enabled) return { identity: preview.identity, checking: !preview.ready, error: preview.error }
  return { identity, checking, error: null, rememberedExpired, reconnect: reconnectError ? () => setRetry(value => value + 1) : undefined }
}

function ReconnectAuthentication({ retry }: { retry: () => void }) {
  return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-bold">Your device could not reconnect</h1><p className="mt-2 text-sm">Check your connection and try again.</p><button type="button" onClick={retry} className="mt-4 min-h-11 rounded-xl bg-[#0b5ea2] px-5 font-bold text-white">Try again</button></div></main>
}

export function ProtectedRoute({ roles }: { roles: AuthRole[] }) {
  const location = useLocation()
  const tokenClaims = getCurrentClaims()
  const { identity, checking, error, reconnect, rememberedExpired } = useResolvedIdentity()
  if (checking) return <LoadingAuthentication />
  if (reconnect) return <ReconnectAuthentication retry={reconnect} />
  if (error) return <main className="flex min-h-screen items-center justify-center bg-[#FFFFFF] p-6 text-center text-[#0b5ea2]"><div><h1 className="text-xl font-bold">Inventory preview could not start</h1><p className="mt-2 text-sm text-[#0b5ea2]/65">{error}</p><a className="mt-5 inline-flex rounded-xl bg-[#0b5ea2] px-4 py-2 text-sm font-bold text-[#FFFFFF]" href="/login">Use normal sign in</a></div></main>
  if (identity && !roles.includes(identity.role)) return <Navigate to={dashboardForRole(identity.role)} replace />
  if (!identity) {
    if (tokenClaims) clearAccessToken()
    return <Navigate to={roles.some(role => ['Admin', 'Librarian', 'Staff'].includes(role)) ? '/staff' : '/login'} replace state={{ deniedPath: location.pathname + location.search + location.hash, rememberedExpired }} />
  }
  return <Outlet />
}

export function AuthenticatedHome() {
  const { identity, checking, error, reconnect } = useResolvedIdentity()
  if (checking) return <LoadingAuthentication />
  if (reconnect) return <ReconnectAuthentication retry={reconnect} />
  if (error) return <Navigate to="/login" replace />
  if (!identity) return <Navigate to="/login" replace />
  return <Navigate to={dashboardForRole(identity.role)} replace />
}
