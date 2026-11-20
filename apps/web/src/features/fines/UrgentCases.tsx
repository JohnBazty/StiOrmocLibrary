import { useEffect, useState } from 'react'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { RefreshButton } from '../../components/RefreshButton'

type Case = {
  key: string
  full_name: string
  school_id: string
  kind: string
  balance: number
  overdueDays: number | null
  unpaidDays: number
  reasons: string[]
  last_notified_at: string | null
}
type Data = {
  settings: { version: number; amount: number | null; overdue_days: number | null; unpaid_days: number | null; email_enabled: boolean }
  items: Case[]
}

/** Daily list of cases. The rules that decide what counts as urgent are set in Library setup. */
export function UrgentCases({ onCount }: { onCount?: (count: number) => void } = {}) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const r = await fetch('/api/v1/admin/fines/urgent-cases', { credentials: 'include' })
      const b = await r.json()
      if (!r.ok) throw new Error(b.message)
      setData(b.data)
      onCount?.(b.data.items.length)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60000)
    return () => clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SectionCard className="my-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
        <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Urgent library cases</h2>
        <RefreshButton onRefresh={() => load()} variant="secondary" size="sm" />
      </div>

      <div className="p-5">
        {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
        {!data && !error ? <p role="status" className="text-sm text-[var(--sl-text-secondary)]">Loading urgent cases…</p> : null}
        {data && !data.settings.amount && !data.settings.overdue_days && !data.settings.unpaid_days ? (
          <NoticeBanner
            tone="info"
            action={
              <a href="/librarian/maintenance?tab=violation-rules" className="inline-flex min-h-8 items-center text-xs font-semibold underline">
                Open Library setup
              </a>
            }
          >
            No urgent rules are enabled. Set them in Library setup → Violation rules.
          </NoticeBanner>
        ) : null}

        {data?.items.length ? (
          <ResponsiveTable label="Urgent library cases">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  {['Person', 'Case and balance', 'Age', 'Alert history'].map(h => (
                    <th className="px-3 py-2.5" key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {data.items.map(i => (
                  <tr key={i.key} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-[var(--sl-text-header)]">{i.full_name}</p>
                      <p className="font-mono text-xs text-[var(--sl-text-muted)]">{i.school_id}</p>
                    </td>
                    <td className="px-3 py-3">
                      <a className="font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]" href={i.kind === 'Printing' ? '/librarian/printing' : '/librarian/fines'}>
                        {i.kind}
                      </a>
                      <p className="mt-0.5 font-semibold tabular-nums text-[var(--sl-text-header)]">₱{Number(i.balance).toFixed(2)}</p>
                      <p className="text-xs text-[var(--sl-text-secondary)]">{i.reasons.join(', ')}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--sl-text-secondary)]">
                      {i.overdueDays !== null ? <p>{i.overdueDays} days since deadline</p> : null}
                      {i.kind !== 'Overdue book' ? <p>{i.unpaidDays} days since assessment</p> : <p>No assessed charge</p>}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--sl-text-muted)]">
                      {i.last_notified_at ? new Date(i.last_notified_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Awaiting scheduled notice'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        ) : data ? (
          <p className="py-2 text-sm text-[var(--sl-text-secondary)]">No current cases match the rules.</p>
        ) : null}
      </div>
    </SectionCard>
  )
}
