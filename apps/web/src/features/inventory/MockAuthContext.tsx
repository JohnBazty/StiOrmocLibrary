import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthenticatedIdentity } from '../auth/auth-storage'

export const INVENTORY_MOCK_SESSION = Object.freeze({
  user_id: null,
  username: 'admin_authenticated',
  role: 'Admin' as const,
  school_id: '',
})

const enabled = import.meta.env.DEV && import.meta.env.VITE_INVENTORY_MOCK_AUTH === 'true'
let bootstrapPromise: Promise<void> | null = null

type MockAuthState = {
  enabled: boolean
  ready: boolean
  error: string | null
  session: typeof INVENTORY_MOCK_SESSION | null
  identity: AuthenticatedIdentity | null
}

const MockAuthContext = createContext<MockAuthState>({ enabled: false, ready: true, error: null, session: null, identity: null })

function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = fetch('/api/dev/inventory/session', {
      method: 'POST', credentials: 'include', headers: { Accept: 'application/json' },
    }).then(async (response) => {
      const payload = await response.json() as { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Unable to start Inventory preview mode.')
    })
  }
  return bootstrapPromise
}

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    bootstrap().then(() => { if (active) setReady(true) }).catch((reason: unknown) => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Unable to start Inventory preview mode.'); setReady(true) }
    })
    return () => { active = false }
  }, [])

  const value = useMemo<MockAuthState>(() => ({
    enabled,
    ready,
    error,
    session: enabled ? INVENTORY_MOCK_SESSION : null,
    identity: enabled && !error ? { userId: 0, schoolId: '', fullName: 'admin_authenticated', role: 'Admin', source: 'session' } : null,
  }), [ready, error])

  return <MockAuthContext.Provider value={value}>{children}</MockAuthContext.Provider>
}

export function useMockAuth() { return useContext(MockAuthContext) }
