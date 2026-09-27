import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SectionCard, StatCard } from '../../components/ui'
import { BadgeCheck, RefreshCw, UserRoundX, Users } from 'lucide-react'
import { getAccessToken } from '../auth/auth-storage'

type Summary = { activeUsers: number; cleared: number; notCleared: number; unknown: number; generatedAt: string }

export function AdminAccountDashboardPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/v1/admin/account-dashboard', {
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}`, Accept: 'application/json' },
      })
      const payload = await response.json() as { data?: Summary; message?: string }
      if (!response.ok || !payload.data) throw new Error(payload.message ?? 'Unable to load account totals.')
      setData(payload.data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load account totals.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <>
    <PageHeader eyebrow="Account administration" title="Admin dashboard" action={<button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#003399]/20 px-4 py-2 font-bold text-[#003399]"><RefreshCw size={16} />{loading ? 'Refreshing…' : 'Refresh'}</button>} />
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{error}</p> : null}
    <div className="grid gap-4 md:grid-cols-3">
      <Link to="/admin/users?status=Active"><StatCard label="Active users" value={data?.activeUsers ?? '—'} icon={Users} /></Link>
      <Link to="/admin/clearance?status=Cleared&active=1"><StatCard label="Cleared active students" value={data?.cleared ?? '—'} icon={BadgeCheck} /></Link>
      <Link to="/admin/clearance?status=Not%20Cleared&active=1"><StatCard label="Not-cleared active students" value={data?.notCleared ?? '—'} icon={UserRoundX} /></Link>
    </div>
    <SectionCard className="mt-5 p-5"><h2 className="font-bold text-[#003399]">Account review</h2><p className="mt-2 text-sm text-[#003399]/70">Review requested Librarian and Staff accounts and pending profile pictures.</p><Link to="/admin/approvals" className="mt-4 inline-flex rounded-xl bg-[#003399] px-4 py-2 font-bold text-white">Open account approvals</Link></SectionCard>
    {data ? <p className="mt-4 text-sm text-[#003399]/60">{data.unknown} active students have an unknown clearance state. Updated {new Date(data.generatedAt).toLocaleString('en-PH')}.</p> : null}
  </>
}
