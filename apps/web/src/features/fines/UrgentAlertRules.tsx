import { useEffect, useState, type FormEvent } from 'react'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { getCsrfToken } from '../auth/auth-storage'

type Settings = { version: number; amount: number | null; overdue_days: number | null; unpaid_days: number | null; email_enabled: boolean }

/** Setup, not daily work: lives in Library setup next to the other rules. */
export function UrgentAlertRules() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [review, setReview] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const response = await fetch('/api/v1/admin/fines/urgent-cases', { credentials: 'include' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Alert rules are unavailable.')
      setSettings(body.data.settings)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Alert rules are unavailable.')
    }
  }
  useEffect(() => { void load() }, [])

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setReview({
      version: settings.version,
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
      const response = await fetch('/api/v1/admin/fines/urgent-settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() ?? '' },
        body: JSON.stringify(review),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'The alert rules could not be saved.')
      setReview(null)
      setNotice('Alert rules saved. Existing charges are unchanged.')
      setError('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The alert rules could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[var(--sl-border)] px-5 py-4">
        <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Urgent alert rules</h2>
        <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
          Decide when Fines → Urgent alerts flags a case. A case matches any rule that is on. Alerts never add a penalty.
        </p>
      </div>
      <div className="p-5">
        {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
        {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
        {!settings && !error ? <p role="status" className="text-sm text-[var(--sl-text-secondary)]">Loading alert rules…</p> : null}
        {settings ? (
          <form key={settings.version} onSubmit={preview} onChange={() => setReview(null)} className="grid gap-3 sm:grid-cols-3">
            {([
              ['amount', 'Outstanding amount (PHP)', settings.amount],
              ['overdueDays', 'Days since return deadline', settings.overdue_days],
              ['unpaidDays', 'Days since charge assessment', settings.unpaid_days],
            ] as const).map(([name, label, value]) => (
              <label key={name} className="flex flex-col gap-1 text-xs font-semibold text-[var(--sl-text-secondary)]">
                {label}
                <input
                  name={name}
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
              <input type="checkbox" name="emailEnabled" defaultChecked={settings.email_enabled} />
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
                  <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Save reviewed rules</Button>
                </div>
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </SectionCard>
  )
}
