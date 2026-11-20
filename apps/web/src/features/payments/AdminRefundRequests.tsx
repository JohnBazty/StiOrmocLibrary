import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { moneyOutApi, moneyOutStatus, type MoneyOutRecord, type RefundOptions } from './money-out-api'
import { notifyPaymentUpdate, usePaymentUpdates } from './payment-updates'
import { paymentMoney } from './payments-api'
import { RefundApproval } from './RefundApproval'
import { refundRequestsApi, type RefundQueueRow, type RefundRequestDetails } from './refund-requests-api'
import { MoneyOutDialog, MoneyOutSummary } from './RefundReview'
import { RefreshButton } from '../../components/RefreshButton'

export function AdminRefundRequests() {
  const [filters, setFilters] = useState({ state: 'PendingReview', kind: '', search: '', page: 1 })
  const [data, setData] = useState<Awaited<ReturnType<typeof refundRequestsApi.list>> | null>(null)
  const [selected, setSelected] = useState<RefundQueueRow | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const version = useRef(0)
  const latest = useRef(filters)
  const flight = useRef<Promise<void> | null>(null)
  const queued = useRef(false)
  const mounted = useRef(true)
  const recoveredAt = useRef(0)
  latest.current = filters

  const hasFilters = Boolean(filters.state !== 'PendingReview' || filters.kind || filters.search.trim())

  const refresh = useCallback(() => {
    if (flight.current) {
      queued.current = true
      return flight.current
    }
    setLoading(true)
    const run = (async () => {
      do {
        queued.current = false
        const request = ++version.current
        const query = { ...latest.current }
        try {
          if (Date.now() - recoveredAt.current >= 10000) {
            await moneyOutApi.recover()
            recoveredAt.current = Date.now()
          }
          const result = await refundRequestsApi.list(query)
          if (
            mounted.current &&
            request === version.current &&
            JSON.stringify(query) === JSON.stringify(latest.current)
          ) {
            setData(result)
            setError('')
            setSelected(current => (current ? result.items.find(row => row.id === current.id) ?? current : null))
          }
        } catch (cause) {
          if (mounted.current && request === version.current) {
            setError(cause instanceof Error ? cause.message : 'Refund requests could not load.')
          }
        }
      } while (queued.current && mounted.current)
    })().finally(() => {
      flight.current = null
      if (mounted.current) setLoading(false)
    })
    flight.current = run
    return run
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queued.current = false
      version.current++
    }
  }, [])

  usePaymentUpdates(refresh, 10000)

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), filters.search ? 250 : 0)
    return () => {
      version.current++
      clearTimeout(timer)
    }
  }, [filters, refresh])

  function saved() {
    notifyPaymentUpdate()
  }

  return (
    <section aria-label="Refund request queue">
      <SectionCard className="mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Refund requests</h2>
            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
              {data?.pending ?? '…'} awaiting librarian review. Verify the payment and bill before approving.
            </p>
          </div>
          <RefreshButton label="Refresh requests" onRefresh={() => refresh()} variant="secondary" size="sm" disabled={loading} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Request status
            <select
              className="sl-input mt-1"
              value={filters.state}
              onChange={event => setFilters(value => ({ ...value, state: event.target.value, page: 1 }))}
            >
              <option value="">All requests</option>
              <option value="PendingReview">Pending review</option>
              <option value="Approved">Approved / processing</option>
              <option value="Rejected">Rejected</option>
              <option value="Withdrawn">Withdrawn</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Service
            <select
              className="sl-input mt-1"
              value={filters.kind}
              onChange={event => setFilters(value => ({ ...value, kind: event.target.value, page: 1 }))}
            >
              <option value="">All services</option>
              <option value="Printing">Printing</option>
              <option value="Fine">Library fines</option>
              <option value="LostBook">Replacement charges</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Search requests
            <input
              className="sl-input mt-1"
              placeholder="Name, School ID or reference"
              value={filters.search}
              maxLength={120}
              onChange={event => setFilters(value => ({ ...value, search: event.target.value, page: 1 }))}
            />
          </label>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ state: 'PendingReview', kind: '', search: '', page: 1 })}
            >
              <X size={14} aria-hidden="true" /> Clear filters
            </Button>
          ) : null}
        </div>
      </SectionCard>

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {loading && !data ? (
        <p role="status" className="p-4 text-sm text-[var(--sl-text-secondary)]">
          Loading requests…
        </p>
      ) : null}

      <SectionCard className="overflow-hidden">
        <ResponsiveTable label="Refund requests">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                {['Requester & service', 'Reference & date', 'Reason', 'Amount', 'Status', 'Actions'].map(col => (
                  <th key={col} scope="col" className="px-4 py-2.5">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {data?.items.length ? (
                data.items.map(row => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[var(--sl-text-header)]">{row.payerName}</p>
                      <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                        {row.schoolId} ·{' '}
                        {row.kind === 'Printing'
                          ? 'Printing'
                          : row.kind === 'Fine'
                            ? 'Library fine'
                            : 'Replacement charge'}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)] tabular-nums">
                      <p className="font-mono font-semibold text-[var(--sl-text-header)]">{row.reference}</p>
                      <p className="mt-0.5">
                        {new Date(row.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                      </p>
                    </td>
                    <td className="max-w-xs px-4 py-3.5 text-xs text-[var(--sl-text)] break-words">{row.reason}</td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
                      {paymentMoney(row.requestedPrincipalCentavos + row.requestedFeeCentavos)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>
                        {row.state === 'PendingReview' ? 'Review request' : 'View request'}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : data ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center">
                    <h3 className="font-semibold text-[var(--sl-text-header)]">No requests match these filters.</h3>
                    <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">
                      User requests appear here after submission from Transactions.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>
      </SectionCard>

      {data && data.pagination.total > 25 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-xs text-[var(--sl-text-secondary)]">
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || filters.page === 1}
            onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}
          >
            Previous
          </Button>
          <span className="tabular-nums">Page {filters.page}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || filters.page * 25 >= data.pagination.total}
            onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}
          >
            Next
          </Button>
        </div>
      ) : null}

      {selected ? <RefundRequestReview selected={selected} onSaved={saved} onClose={() => setSelected(null)} /> : null}
    </section>
  )
}

function RefundRequestReview({
  selected,
  onSaved,
  onClose,
}: {
  selected: RefundQueueRow
  onSaved: () => void
  onClose: () => void
}) {
  const [details, setDetails] = useState<RefundRequestDetails | null>(null)
  const [options, setOptions] = useState<RefundOptions | null>(null)
  const [operation, setOperation] = useState<MoneyOutRecord | null>(selected.operation)
  const [amount, setAmount] = useState((selected.requestedPrincipalCentavos / 100).toFixed(2))
  const [note, setNote] = useState('')
  const [decision, setDecision] = useState(selected.kind === 'Printing' ? 'Cancel' : '')
  const [verified, setVerified] = useState(false)
  const [approved, setApproved] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const flight = useRef(false)
  const key = useRef(crypto.randomUUID())

  useEffect(() => {
    let active = true
    void Promise.all([refundRequestsApi.details(selected.id), moneyOutApi.options(selected.paymentId)])
      .then(([detail, value]) => {
        if (active) {
          setDetails(detail)
          setOptions(value)
        }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Request details could not load.')
      })
    return () => {
      active = false
    }
  }, [selected.id, selected.version, version])

  useEffect(() => {
    setOperation(current =>
      selected.operation && (!current || selected.operation.events.length >= current.events.length)
        ? selected.operation
        : current,
    )
  }, [selected.operation])

  async function run(action: 'review' | 'confirm' | 'reject' | 'check' | 'cancel') {
    if (flight.current) return
    flight.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'reject') {
        await refundRequestsApi.reject(selected.id, details?.request.version ?? selected.version, note)
        onSaved()
        onClose()
        return
      }
      if (action === 'review') {
        setOperation(
          await moneyOutApi.refund(selected.paymentId, {
            amount,
            decision,
            reason: selected.reason,
            reasonCode: selected.reasonCode,
            requestKey: key.current,
            requestId: selected.id,
            requestVersion: details?.request.version ?? selected.version,
            verificationNote: note,
            verified,
          }),
        )
      }
      if (action === 'confirm' && operation && approved) {
        setOperation(await moneyOutApi.confirm(operation.id, { confirmed: true }))
      }
      if (action === 'check' && operation) {
        setOperation(await moneyOutApi.check(operation.id))
      }
      if (action === 'cancel' && operation) {
        await moneyOutApi.cancel(operation.id)
        onSaved()
        onClose()
        return
      }
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be updated.')
    } finally {
      flight.current = false
      setBusy(false)
    }
  }

  const valid =
    verified &&
    note.trim().length >= 10 &&
    decision &&
    options?.eligible &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) > 0 &&
    Math.round(Number(amount) * 100) <= Math.min(selected.requestedPrincipalCentavos, options.refundableCentavos)
  const state = details?.request.state ?? selected.state

  return (
    <MoneyOutDialog title="Review refund request" busy={busy} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-bold">{selected.payerName}</h3>
          <p className="payment-muted text-sm">
            {selected.schoolId} · {selected.reference}
          </p>
        </div>
        {operation ? (
          <>
            <h3 className="font-bold">
              {operation.state === 'Draft' ? 'Final approval' : moneyOutStatus(operation.state)}
            </h3>
            <MoneyOutSummary row={operation} />
            <p className="break-words text-sm">Verification: {details?.request.reviewNote ?? note}</p>
            {operation.state === 'Draft' ? (
              <>
                <RefundApproval total={operation.totalCentavos} checked={approved} disabled={busy} onChange={setApproved} />
                <Button
                  className="payment-button w-full"
                  disabled={busy || !approved || !options?.enabled || details?.payment.refundEligible === false}
                  onClick={() => void run('confirm')}
                >
                  {busy ? 'Sending…' : 'Approve and send refund'}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void run('cancel')}>
                  Cancel unsent review
                </Button>
              </>
            ) : (
              <>
                <p role="status" className="payment-muted">
                  {operation.state === 'Succeeded'
                    ? 'The provider confirmed the refund. Linked balances have been updated.'
                    : operation.state === 'Failed'
                      ? 'The refund failed. The original payment stays applied.'
                      : operation.state === 'Review'
                        ? 'Confirmation is delayed. Keep this request; do not send another refund.'
                        : operation.state === 'Processing'
                          ? 'The provider is processing this refund. The original payment stays applied until confirmation.'
                          : 'This refund review is closed.'}
                </p>
                {['Processing', 'Review'].includes(operation.state) ? (
                  <Button
                    className="payment-button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run('check')}
                  >
                    Check refund status
                  </Button>
                ) : null}
                <Button className="payment-button" disabled={busy} onClick={onClose}>
                  Done
                </Button>
              </>
            )}
          </>
        ) : details && options ? (
          <>
            <div className="payment-summary">
              <p className="font-semibold">
                Requested: {paymentMoney(selected.requestedPrincipalCentavos)} + {paymentMoney(selected.requestedFeeCentavos)} fee
              </p>
              <p className="mt-3 break-words text-sm">{selected.reason}</p>
              <p className="payment-field-note">Original method: GCash. Returns to the original payer.</p>
            </div>
            <details className="rounded-xl border border-current/15 p-4">
              <summary className="min-h-11 cursor-pointer font-semibold">Payment and service history</summary>
              <p className="text-sm">
                Paid {new Date(details.payment.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} ·{' '}
                {paymentMoney(details.payment.totalCentavos)}
              </p>
              {details.evidence.jobStatus ? <p className="mt-2 text-sm">Printing status: {details.evidence.jobStatus}</p> : null}
              {details.evidence.history.map((row, index) => (
                <p className="mt-2 text-sm" key={index}>
                  {row.to_status
                    ? `${row.from_status ?? 'Created'} → ${row.to_status}`
                    : `${row.fine_type ?? 'Charge'} · ${row.transaction_status ?? 'No linked loan'}`}
                  {row.returned_at
                    ? ` · Returned ${new Date(String(row.returned_at)).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`
                    : ''}
                </p>
              ))}
              <p className="payment-field-note">
                Check these records and the actual service issue. This system does not read printer hardware logs.
              </p>
            </details>
            {state === 'PendingReview' ? (
              <>
                {!options.eligible ? (
                  <p role="alert" className="payment-error">
                    This bill is no longer eligible. Review the history and reject with an explanation.
                  </p>
                ) : null}
                {!rejecting ? (
                  <>
                    <label className="block font-semibold">
                      Payment amount to approve
                      <input
                        className="payment-field mt-2"
                        inputMode="decimal"
                        value={amount}
                        onChange={event => setAmount(event.target.value)}
                      />
                    </label>
                    <p className="payment-field-note">
                      Approve up to the requested amount. Explain any reduction in your verification note. The matching fee is calculated before final approval.
                    </p>
                    {selected.kind !== 'Printing' ? (
                      <label className="block font-semibold">
                        Effect on the charge
                        <select
                          className="payment-field mt-2"
                          value={decision}
                          onChange={event => setDecision(event.target.value)}
                        >
                          <option value="">Choose an action</option>
                          <option value="Restore">Restore unpaid balance</option>
                          <option value="Cancel">Cancel incorrect charge</option>
                        </select>
                      </label>
                    ) : (
                      <p className="payment-field-note">
                        The unstarted print request is cancelled after the refund is confirmed.
                      </p>
                    )}
                  </>
                ) : null}
                <label className="block font-semibold">
                  {rejecting ? 'Reason for rejection' : 'Verification note'}
                  <textarea
                    className="payment-field mt-2"
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={event => setNote(event.target.value)}
                  />
                </label>
                {!rejecting ? (
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={verified}
                      onChange={event => setVerified(event.target.checked)}
                    />
                    I checked the original payment, service history and reason. This refund is justified.
                  </label>
                ) : (
                  <p className="payment-field-note">The user will see your explanation. Rejection sends no money.</p>
                )}
                <div className="flex flex-wrap gap-3">
                  {rejecting ? (
                    <>
                      <Button variant="secondary" disabled={busy} onClick={() => setRejecting(false)}>
                        Back
                      </Button>
                      <Button
                        className="payment-button"
                        disabled={busy || note.trim().length < 10}
                        onClick={() => void run('reject')}
                      >
                        Confirm rejection
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
                        Reject request
                      </Button>
                      <Button
                        className="payment-button flex-1"
                        disabled={busy || !valid}
                        onClick={() => void run('review')}
                      >
                        Review refund
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <p role="status">{details.request.status}</p>
                {details.request.reviewNote ? <p className="break-words">{details.request.reviewNote}</p> : null}
                <Button className="payment-button" onClick={onClose}>
                  Done
                </Button>
              </>
            )}
          </>
        ) : !error ? (
          <p role="status">Loading verified details…</p>
        ) : null}
        {error ? (
          <>
            <p role="alert" className="payment-error">
              {error}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setError('')
                setVersion(value => value + 1)
              }}
            >
              Reload request details
            </Button>
          </>
        ) : null}
      </div>
    </MoneyOutDialog>
  )
}
