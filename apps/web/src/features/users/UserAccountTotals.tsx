import { useEffect, useState } from 'react'
import { BadgeCheck, Users, UserRoundX } from 'lucide-react'
import { Button, StatCard } from '../../components/ui'
import { getCsrfToken } from '../auth/auth-storage'
import type { UserSummary } from './users-api'

type Totals = { activeUsers: number; cleared: number; notCleared: number; unknown: number; generatedAt: string }

export function UserAccountTotals({ refreshKey, accounts }: { refreshKey: number; accounts: UserSummary | null }) {
  const [data, setData] = useState<Totals | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true); setData(null); setError('')
    void fetch('/api/v1/admin/account-dashboard', { credentials: 'include', headers: { Accept: 'application/json', 'X-CSRF-Token': getCsrfToken() ?? '' } })
      .then(async response => { const payload = await response.json(); if (!response.ok || !payload.data) throw new Error(payload.message ?? 'Account totals are unavailable.'); return payload.data as Totals })
      .then(value => { if (active) setData(value) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Account totals are unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshKey, retry])
  return <section aria-label="Account totals" className="mb-5 space-y-3">
    <h2 className="text-lg font-bold">Accounts & clearance</h2>
    <p className="text-sm opacity-75">Library-wide totals. The filters below apply to the account directory.</p>
    {loading ? <p role="status" className="text-sm">Loading account totals…</p> : null}
    {error ? <div role="alert" className="auth-error rounded-xl p-3 text-sm"><p>{error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry account totals</Button></div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard label="Active users" value={data ? String(data.activeUsers) : '—'} icon={Users}/>
      <StatCard label="Cleared active students" value={data ? String(data.cleared) : '—'} icon={BadgeCheck}/>
      <StatCard label="Not-cleared active students" value={data ? String(data.notCleared) : '—'} icon={UserRoundX}/>
      <StatCard label="Deactivated" value={accounts ? String(accounts.deactivated_accounts) : '—'} icon={Users}/>
      <StatCard label="Archived" value={accounts ? String(accounts.archived_accounts) : '—'} icon={BadgeCheck}/>
    </div>
    {data ? <p className="text-xs opacity-75">{data.unknown} active students have an unknown clearance state. Updated {new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.</p> : null}
  </section>
}
