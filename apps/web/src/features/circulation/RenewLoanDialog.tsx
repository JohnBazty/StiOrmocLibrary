import { formatLoanDate } from './loan-time'
import { AlertTriangle, CalendarClock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, LumoDialog, NoticeBanner } from '../../components/ui'
import { circulationApi } from './circulation-api'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import type { RenewalDecisionData, RenewalPreflightData } from './types'

function createRequestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `renewal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatDate(value: string | null) { return formatLoanDate(value, 'Unavailable') }

export function RenewLoanDialog({
  transactionId,
  title,
  onCancel,
  onSuccess,
}: {
  transactionId: number
  title: string
  onCancel: () => void
  onSuccess: (decision: RenewalDecisionData) => void
}) {
  const [requestKey] = useState(createRequestKey)
  const [preflight, setPreflight] = useState<RenewalPreflightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { ask, dialog: confirmSave } = useConfirmSave()

  async function loadPreflight() {
    setLoading(true)
    setError('')
    try {
      setPreflight(await circulationApi.preflightRenewal(transactionId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Renewal eligibility could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPreflight() }, [transactionId])

  async function confirmRenewal() {
    if (busy || !preflight?.canRequestRenewal) return
    setBusy(true)
    setError('')
    try {
      const decision = await circulationApi.submitRenewal(transactionId, requestKey)
      if (decision.status === 'Approved') onSuccess(decision)
      else {
        setPreflight((current) => current ? { ...current, blockers: decision.blockers, canRequestRenewal: false } : current)
        setError(decision.decisionSummary)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The renewal request could not be submitted.')
    } finally {
      setBusy(false)
    }
  }

  const usage = preflight?.maxRenewals === null
    ? `${preflight?.renewalCount ?? 0} used`
    : `${preflight?.renewalCount ?? 0} of ${preflight?.maxRenewals ?? 0} used`

  return (
    <>
      <LumoDialog
        eyebrow="Loan renewal"
        title="Request renewal"
        description={title}
        busy={busy}
        onClose={onCancel}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
            {error && !preflight ? <Button variant="secondary" disabled={loading} onClick={() => void loadPreflight()}>Retry</Button> : null}
            <Button
              disabled={loading || busy || !preflight?.canRequestRenewal}
              onClick={() => ask(`Renew ${title}.`, () => { void confirmRenewal() }, { title: 'Confirm loan renewal?', confirmLabel: 'Renew loan' })}
            >
              {busy ? 'Renewing…' : 'Confirm renewal'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {loading ? <div className="flex items-center gap-2 text-sm font-medium text-[var(--sl-text-secondary)]"><RefreshCw className="animate-spin" size={16} /> Checking renewal eligibility…</div> : null}
          {preflight ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[8px] border border-[var(--sl-border)] p-3"><p className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Current due</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--sl-text-header)]">{formatDate(preflight.currentDueAt)}</p></div>
                <div className="rounded-[8px] border border-[var(--sl-info-border)] bg-[var(--sl-info-soft)] p-3"><p className="text-[11px] font-semibold uppercase text-[#0b5ea2] dark:text-[#93c5fd]">Proposed due</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--sl-text-header)]">{formatDate(preflight.proposedDueAt)}</p></div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--sl-text-secondary)]"><CalendarClock size={16} className="text-[#0b5ea2] dark:text-[#93c5fd]" /> Renewals: <strong className="text-[var(--sl-text-header)]">{usage}</strong></div>
              {preflight.blockers.length ? (
                <NoticeBanner tone="warning" title="Renewal blocked" className="mb-0">
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">{preflight.blockers.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
                </NoticeBanner>
              ) : null}
            </>
          ) : null}
          {error ? <NoticeBanner tone="error" className="mb-0">{error}</NoticeBanner> : null}
        </div>
      </LumoDialog>
      {confirmSave}
    </>
  )
}
