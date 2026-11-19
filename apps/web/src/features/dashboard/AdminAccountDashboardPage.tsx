import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard } from '../../components/ui'
import { BadgeCheck, QrCode, RefreshCw, UserPlus, UserRoundX, Users } from 'lucide-react'
import { getCsrfToken, getCurrentIdentity } from '../auth/auth-storage'

type Summary = { activeUsers: number; cleared: number; notCleared: number; unknown: number; generatedAt: string }

export function AdminAccountDashboardPage() {
  const prefix = getCurrentIdentity()?.role === 'Librarian' ? '/librarian' : '/admin'
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/v1/admin/account-dashboard', {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() ?? '', Accept: 'application/json' },
      })
      const payload = (await response.json().catch(() => null)) as { data?: Summary; message?: string } | null
      if (!response.ok || !payload?.data) throw new Error(payload?.message ?? 'Unable to load account totals.')
      setData(payload.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load account totals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader
        eyebrow="Account administration"
        title="Admin dashboard"
        description="Monitor active campus accounts, clearance standing, and enrollment onboarding."
        action={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {error ? (
        <NoticeBanner
          tone="error"
          action={
            <button type="button" onClick={() => void load()} className="min-h-8 text-xs font-semibold underline">
              Retry
            </button>
          }
        >
          {error}
        </NoticeBanner>
      ) : null}

      {data && data.unknown > 0 ? (
        <NoticeBanner
          tone="warning"
          action={
            <Link to={`${prefix}/clearance`} className="inline-flex min-h-8 items-center text-xs font-semibold underline">
              Review clearance
            </Link>
          }
        >
          {data.unknown} active {data.unknown === 1 ? 'student has' : 'students have'} an uncomputed clearance status.
        </NoticeBanner>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Link to={`${prefix}/users?status=Active`} className="block transition-transform hover:-translate-y-0.5">
          <StatCard label="Active users" value={data?.activeUsers ?? '—'} note="View active accounts" icon={Users} tone="info" />
        </Link>
        <Link to={`${prefix}/clearance?status=Cleared&active=1`} className="block transition-transform hover:-translate-y-0.5">
          <StatCard label="Cleared active students" value={data?.cleared ?? '—'} note="View cleared students" icon={BadgeCheck} tone="success" />
        </Link>
        <Link to={`${prefix}/clearance?status=Not%20Cleared&active=1`} className="block transition-transform hover:-translate-y-0.5">
          <StatCard
            label="Not-cleared active students"
            value={data?.notCleared ?? '—'}
            note="View pending obligations"
            icon={UserRoundX}
            tone={data && data.notCleared > 0 ? 'warning' : 'default'}
          />
        </Link>
      </div>

      <SectionCard className="mt-5 p-5">
        <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Account setup &amp; rosters</h2>
        <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
          Manage staff accounts, upload semester rosters, or print student QR passes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`${prefix}/users`}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-[6px] bg-[#0b5ea2] px-4 text-sm font-semibold text-white hover:bg-[#094e87]"
          >
            <Users size={15} aria-hidden="true" /> Open library users
          </Link>
          <Link
            to={`${prefix}/users/enrollment`}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]"
          >
            <UserPlus size={15} aria-hidden="true" /> Student enrollment
          </Link>
          <Link
            to={`${prefix}/student-qr-roster`}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-4 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]"
          >
            <QrCode size={15} aria-hidden="true" /> Student QR roster
          </Link>
        </div>
      </SectionCard>

      {data ? (
        <p className="mt-4 text-xs text-[var(--sl-text-muted)]">
          {data.unknown} active students have an unknown clearance state. Updated{' '}
          {new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.
        </p>
      ) : null}
    </>
  )
}
