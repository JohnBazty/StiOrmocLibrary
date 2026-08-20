import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { resolveSessionIdentity } from './auth-api'
import {
  clearAccessToken, dashboardForRole, getCurrentIdentity, getCurrentClaims,
  type AuthenticatedIdentity, type AuthRole,
} from './auth-storage'
import { useMockAuth } from '../inventory/MockAuthContext'

function LoadingAuthentication() {
  return <main className="flex min-h-screen items-center justify-center bg-[#FFFFFF] text-[#003399]"><div className="text-center"><div className="mx-auto h-10 w-10 animate-pulse rounded-xl bg-[#FFF200]" /><p className="mt-4 text-sm font-bold">Opening your secure workspace…</p></div></main>
}

function useResolvedIdentity() {
  const preview = useMockAuth()
  const immediate = getCurrentIdentity()
  const [identity, setIdentity] = useState<AuthenticatedIdentity | null>(immediate)
  const [checking, setChecking] = useState(!immediate)

  useEffect(() => {
    if (preview.enabled) return
    if (identity) return
    let active = true
    resolveSessionIdentity().then((resolved) => {
      if (active) { setIdentity(resolved); setChecking(false) }
    })
    return () => { active = false }
  }, [identity, preview.enabled])

  if (preview.enabled) return { identity: preview.identity, checking: !preview.ready, error: preview.error }
  return { identity, checking, error: null }
}

export function ProtectedRoute({ roles }: { roles: AuthRole[] }) {
  const location = useLocation()
  const tokenClaims = getCurrentClaims()
  const { identity, checking, error } = useResolvedIdentity()
  if (checking) return <LoadingAuthentication />
  if (error) return <main className="flex min-h-screen items-center justify-center bg-[#FFFFFF] p-6 text-center text-[#003399]"><div><h1 className="text-xl font-bold">Inventory preview could not start</h1><p className="mt-2 text-sm text-[#003399]/65">{error}</p><a className="mt-5 inline-flex rounded-xl bg-[#003399] px-4 py-2 text-sm font-bold text-[#FFFFFF]" href="/login">Use normal sign in</a></div></main>
  if (!identity || !roles.includes(identity.role)) {
    if (tokenClaims) clearAccessToken()
    return <Navigate to="/login" replace state={{ deniedPath: location.pathname }} />
  }
  return <Outlet />
}

export function AuthenticatedHome() {
  const { identity, checking, error } = useResolvedIdentity()
  if (checking) return <LoadingAuthentication />
  if (error) return <Navigate to="/login" replace />
  if (!identity) return <Navigate to="/login" replace />
  return <Navigate to={dashboardForRole(identity.role)} replace />
}
