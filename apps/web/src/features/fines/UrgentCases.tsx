import { useEffect, useState, type FormEvent } from 'react'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { getCsrfToken } from '../auth/auth-storage'

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

export function UrgentCases({ setup = false }: { setup?: boolean }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [review, setReview] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await fetch('/api/v1/admin/fines/urgent-cases', { credentials: 'include' })
      const b = await r.json()
      if (!r.ok) throw new Error(b.message)
      setData(b.data)
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
  }, [])

  function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!data) return
    const values = Object.fromEntries(new FormData(e.currentTarget))
    setReview({
      version: data.settings.version,
      amount: values.amount || null,
      overdueDays: values.overdueDays || null,
      unpaidDays: values.unpaidDays || null,
      emailEnabled: values.emailEnabled === 'on',
    })
  }

  async function save() {
    if (!review) return
    setBusy(true)
    try {
      const r = await fetch('/api/v1/admin/fines/urgent-settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() ?? '' },
        body: JSON.stringify(review),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.message)
      setReview(null)
      setNotice('Alert rules saved. Existing charges are unchanged.')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard className="my-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Urgent library cases</h2>
          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
            Cases match any enabled rule. Partial payments reduce balances without resetting age. Alerts never add a penalty.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Refresh urgent cases
        </Button>
      </div>

      <div className="p-5">
        {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
        {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}

        {setup && data ? (
          <details className="mb-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5">
            <summary className="min-h-9 cursor-pointer text-sm font-semibold text-[var(--sl-text-header)]">
              Set urgent alert rules
            </summary>
            <form key={data.settings.version} onSubmit={preview} onChange={() => setReview(null)} className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['amount', 'Outstanding amount (PHP)', data.settings.amount],
                ['overdueDays', 'Days since return deadline', data.settings.overdue_days],
                ['unpaidDays', 'Days since charge assessment', data.settings.unpaid_days],
              ].map(([name, label, value]) => (
                <label key={String(name)} className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                  {label}
                  <input
                    name={String(name)}
                    type="number"
                    min={name === 'amount' ? '0.01' : '1'}
                    max={name === 'amount' ? '999999999' : '3650'}
                    step={name === 'amount' ? '0.01' : '1'}
                    defaultValue={value ?? ''}
                    className="sl-input"
                  />
                </label>
              ))}
              <p className="text-xs text-[var(--sl-text-muted)] sm:col-span-3">
                Blank means off. Days are complete 24-hour periods. These settings change alerts only.
              </p>
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--sl-text)] sm:col-span-3">
                <input type="checkbox" name="emailEnabled" defaultChecked={data.settings.email_enabled} />
                Also email the librarian a private-portal reminder
              </label>
              <div className="sm:col-span-3">
                <Button type="submit" size="sm">Review rules</Button>
              </div>
              {review ? (
                <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3 text-xs sm:col-span-3">
                  <p className="font-medium text-[var(--sl-text)]">
                    Amount: {String(review.amount ?? 'Off')} · Overdue days: {String(review.overdueDays ?? 'Off')} · Unpaid days:{' '}
                    {String(review.unpaidDays ?? 'Off')} · Email: {review.emailEnabled ? 'On' : 'Off'}
                  </p>
                  <div className="mt-2.5">
                    <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
                      Save reviewed rules
                    </Button>
                  </div>
                </div>
              ) : null}
            </form>
          </details>
        ) : null}

        {!data && !error ? <p role="status" className="text-sm text-[var(--sl-text-secondary)]">Loading urgent cases…</p> : null}
        {data && !data.settings.amount && !data.settings.overdue_days && !data.settings.unpaid_days ? (
          <NoticeBanner
            tone="info"
            action={
              !setup ? (
                <a href="/librarian/fines" className="inline-flex min-h-8 items-center text-xs font-semibold underline">
                  Open Fines management
                </a>
              ) : undefined
            }
          >
            No urgent rules are enabled. Set thresholds in Fines management.
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
