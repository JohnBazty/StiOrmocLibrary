import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import {
  Button,
  LumoDialog,
  NoticeBanner,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { AdminRefundRequests } from './AdminRefundRequests'
import { moneyOutApi } from './money-out-api'
import { notifyPaymentUpdate, usePaymentUpdates } from './payment-updates'
import { PaymentOperationsPanel, SettlementReview } from './PaymentOperationsPanel'
import {
  canRefundPayment,
  downloadPaymentRecord,
  paymentMoney,
  paymentsApi,
  paymentStatus,
  type Payment,
} from './payments-api'
import { RefundRequestDialog } from './RefundRequestDialog'
import { RefundTimeline, VoidFineReview } from './RefundReview'
import { RefreshButton } from '../../components/RefreshButton'

export function AdminPaymentsPage() {
  const [filters, setFilters] = useState({ state: '', channel: '', kind: '', page: 1 })
  const [searchQuery, setSearchQuery] = useState('')
  const [rows, setRows] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [methods, setMethods] = useState<Array<{ channelCode: string; displayName: string }>>([])
  const [settlement, setSettlement] = useState<Payment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null)
  const [refund, setRefund] = useState<Payment | null>(null)
  const [voidPayment, setVoidPayment] = useState<Payment | null>(null)
  const [local, setLocal] = useState<boolean | null>(null)

  const requestVersion = useRef(0)
  const latestFilters = useRef(filters)
  latestFilters.current = filters
  const [tab, setTab] = useState<'payments' | 'refunds'>(
    new URLSearchParams(window.location.search).get('view') === 'refunds' ? 'refunds' : 'payments',
  )
  const canManage = getCurrentIdentity()?.role === 'Librarian'

  function switchTab(next: 'payments' | 'refunds') {
    setTab(next)
    try {
      const url = new URL(window.location.href)
      if (next === 'refunds') url.searchParams.set('view', 'refunds')
      else url.searchParams.delete('view')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    } catch {
      // ignore URL replace errors in non-standard test hosts
    }
  }

  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      let result = await paymentsApi.list(latestFilters.current)
      if (
        canManage &&
        result.localPreview &&
        result.items.some(row => row.refunds?.some(item => ['Draft', 'Processing', 'Review'].includes(item.state)))
      ) {
        await moneyOutApi.recover()
        result = await paymentsApi.list(latestFilters.current)
      }
      if (version !== requestVersion.current) return
      setRows(result.items)
      setLocal(Boolean(result.localPreview))
      setTotal(result.pagination.total)
      setMethods(result.methods ?? [])
    } catch (err) {
      if (version !== requestVersion.current) return
      setError(err instanceof Error ? err.message : 'Online payments could not load.')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [canManage])

  useEffect(() => {
    void load()
    return () => {
      requestVersion.current++
    }
  }, [load, filters])

  usePaymentUpdates(load, 10000)

  useEffect(() => {
    setRefund(current => (current ? rows.find(row => row.paymentId === current.paymentId) ?? current : null))
  }, [rows])

  async function action(payment: Payment, run: () => Promise<unknown>) {
    if (busy) return
    setBusy(payment.paymentId)
    setError('')
    try {
      await run()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This payment could not be updated.')
    } finally {
      setBusy('')
    }
  }

  const methodNames = useMemo(
    () => new Map(methods.map(item => [item.channelCode, item.displayName])),
    [methods],
  )

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleRows = useMemo(() => {
    if (!normalizedSearch) return rows
    return rows.filter(payment =>
      [payment.payerName, payment.schoolId, payment.description, payment.kind, payment.paymentId, payment.channelCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [rows, normalizedSearch])

  const hasFilters = Boolean(filters.state || filters.channel || filters.kind || normalizedSearch)

  function clearFilters() {
    setSearchQuery('')
    setFilters({ state: '', channel: '', kind: '', page: 1 })
  }

  return (
    <>
      <PageHeader
        eyebrow="Payment support"
        title="Online payments"
        description="Verify online payment statuses before accepting counter cash, review refund requests, and inspect provider settlement records."
        action={
          <RefreshButton onRefresh={() => load()} variant="secondary" disabled={loading || Boolean(busy)} />
        }
      />

      {canManage ? (
        <div role="group" aria-label="Payment views" className="mb-5 flex flex-wrap gap-1 border-b border-[var(--sl-border)]">
          {(
            [
              ['payments', 'Payments'],
              ['refunds', 'Refund requests'],
            ] as const
          ).map(([key, label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => switchTab(key)}
                className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[#0b5ea2] text-[#0b5ea2] dark:border-[#93c5fd] dark:text-[#93c5fd]'
                    : 'border-transparent text-[var(--sl-text-secondary)] hover:border-[var(--sl-border-strong)] hover:text-[var(--sl-text-header)]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      ) : null}

      {tab === 'refunds' && canManage ? (
        <AdminRefundRequests />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-4 py-3 text-xs text-[var(--sl-text-secondary)]">
            <p className="max-w-3xl">
              Check a payment before accepting cash. Cancel an online checkout and wait for confirmation before changing its bill. Printing payments can be refunded only before printing starts.
            </p>
            {canManage ? (
              <a
                className="inline-flex min-h-8 items-center font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
                href={local ? '/librarian/funds' : '/librarian/reports?kind=onlinePayments'}
              >
                {local ? 'Open Library funds and refund history' : 'Open payment reports'}
              </a>
            ) : null}
          </div>

          {canManage && local === false ? <PaymentOperationsPanel /> : null}

          <SectionCard className="mb-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                Find payer or reference
                <div className="relative mt-1">
                  <Search
                    size={15}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--sl-text-muted)]"
                  />
                  <input
                    type="search"
                    className="sl-input pl-9"
                    placeholder="Name, School ID, or reference"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </label>

              <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                Payment status
                <select
                  className="sl-input mt-1"
                  value={filters.state}
                  onChange={event => setFilters(value => ({ ...value, state: event.target.value, page: 1 }))}
                >
                  <option value="">All statuses</option>
                  {[
                    ['Active', 'Payment in progress'],
                    ['Creating', 'Waiting for confirmation'],
                    ['Prepared', 'Ready to continue'],
                    ['Succeeded', 'Paid / partially paid'],
                    ['Review', 'Needs review'],
                    ['Cancelled', 'Cancelled'],
                    ['Expired', 'Expired'],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                Payment method
                <select
                  className="sl-input mt-1"
                  value={filters.channel}
                  onChange={event => setFilters(value => ({ ...value, channel: event.target.value, page: 1 }))}
                >
                  <option value="">All methods</option>
                  {methods.map(method => (
                    <option key={method.channelCode} value={method.channelCode}>
                      {method.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                Payment for
                <select
                  className="sl-input mt-1"
                  value={filters.kind}
                  onChange={event => setFilters(value => ({ ...value, kind: event.target.value, page: 1 }))}
                >
                  <option value="">Printing and fines</option>
                  <option value="Printing">Printing</option>
                  <option value="Fine">Library fine</option>
                  <option value="LostBook">Lost-book charge</option>
                </select>
              </label>

              {hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X size={14} aria-hidden="true" /> Clear filters
                </Button>
              ) : null}
            </div>
          </SectionCard>

          {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
          {loading ? (
            <p role="status" className="p-4 text-sm text-[var(--sl-text-secondary)]">
              Loading online payments…
            </p>
          ) : null}

          <SectionCard className="overflow-hidden">
            <ResponsiveTable label="Online payments">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                  <tr>
                    {['Payer & purpose', 'Reference & date', 'Method', 'Principal', 'Fee', 'Total', 'Status', 'Actions'].map(
                      col => (
                        <th key={col} scope="col" className="px-4 py-2.5">
                          {col}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {visibleRows.length ? (
                    visibleRows.map(payment => {
                      const statusText = paymentStatus(payment)
                      const methodLabel = methodNames.get(payment.channelCode) ?? payment.channelCode
                      return (
                        <tr key={payment.paymentId} className="align-top">
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-[var(--sl-text-header)]">
                              {payment.payerName ?? 'Library user'}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                              {payment.schoolId} · {payment.description ?? payment.kind}
                            </p>
                            {payment.state === 'Review' ? (
                              <p className="mt-1 text-xs font-semibold text-[var(--sl-warning-text)]">
                                Check the provider record before any further payment, refund, or bill change.
                              </p>
                            ) : null}
                            {payment.refunds?.length ? (
                              <div className="payment-ui mt-2">
                                <RefundTimeline rows={payment.refunds} />
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)] tabular-nums">
                            <p className="font-mono font-semibold text-[var(--sl-text-header)]">
                              {payment.paymentId.slice(0, 8).toUpperCase()}
                            </p>
                            <p className="mt-0.5">
                              {new Date(payment.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-medium text-[var(--sl-text)]">{methodLabel}</td>
                          <td className="px-4 py-3.5 tabular-nums">{paymentMoney(payment.principalCentavos)}</td>
                          <td className="px-4 py-3.5 tabular-nums text-[var(--sl-text-secondary)]">
                            {paymentMoney(payment.feeCentavos)}
                          </td>
                          <td className="px-4 py-3.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
                            {paymentMoney(payment.totalCentavos)}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={statusText} />
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={Boolean(busy)}
                                onClick={() => void action(payment, () => paymentsApi.adminCheck(payment.paymentId))}
                              >
                                Check status
                              </Button>
                              {canManage && !payment.refundReview && !['Succeeded', 'Cancelled', 'Expired'].includes(payment.state) ? (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={Boolean(busy)}
                                  onClick={() => setCancelTarget(payment)}
                                >
                                  Cancel online payment
                                </Button>
                              ) : null}
                              {canManage && payment.receiptId ? (
                                <Button
                                  size="sm"
                                  disabled={Boolean(busy)}
                                  onClick={() => void action(payment, () => downloadPaymentRecord(payment, true))}
                                >
                                  Download payment record
                                </Button>
                              ) : null}
                              {canManage && canRefundPayment(payment) && payment.refundRequestAllowed !== false ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={Boolean(busy)}
                                  onClick={() => setRefund(payment)}
                                >
                                  Request refund
                                </Button>
                              ) : null}
                              {canManage &&
                              payment.localPreview &&
                              payment.state === 'Succeeded' &&
                              payment.kind === 'Fine' &&
                              !payment.refundReview &&
                              !payment.refunds?.some(row => ['Draft', 'Processing', 'Review'].includes(row.state)) &&
                              payment.remainingCentavos > 0 ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={Boolean(busy)}
                                  onClick={() => setVoidPayment(payment)}
                                >
                                  Void unpaid remainder
                                </Button>
                              ) : null}
                              {canManage && !payment.localPreview && payment.state === 'Succeeded' ? (
                                <Button size="sm" variant="secondary" onClick={() => setSettlement(payment)}>
                                  Settlement evidence
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : !loading && !error ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center">
                        <p className="font-semibold text-[var(--sl-text-header)]">No online payments match these filters.</p>
                        {hasFilters ? (
                          <div className="mt-3">
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTable>
          </SectionCard>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 text-xs text-[var(--sl-text-secondary)]">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || filters.page === 1}
              onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {filters.page} of {Math.max(1, Math.ceil(total / 25))}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || filters.page * 25 >= total}
              onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}
            >
              Next
            </Button>
          </div>

          {settlement ? <SettlementReview payment={settlement} onClose={() => setSettlement(null)} /> : null}
        </>
      )}

      {cancelTarget ? (
        <LumoDialog
          title="Cancel online payment?"
          description={`Cancel the active online checkout (${cancelTarget.paymentId.slice(0, 8).toUpperCase()}) for ${cancelTarget.payerName ?? 'Library user'}?`}
          busy={Boolean(busy)}
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <Button variant="secondary" disabled={Boolean(busy)} onClick={() => setCancelTarget(null)}>
                Keep checkout
              </Button>
              <Button
                variant="danger"
                disabled={Boolean(busy)}
                onClick={() => {
                  const target = cancelTarget
                  setCancelTarget(null)
                  void action(target, () => paymentsApi.adminCancel(target.paymentId))
                }}
              >
                Confirm cancel
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--sl-text)]">
            Wait for cancellation confirmation before accepting cash at the counter or editing the linked bill.
          </p>
        </LumoDialog>
      ) : null}

      {refund ? (
        <RefundRequestDialog admin payment={refund} onClose={() => setRefund(null)} onSaved={() => notifyPaymentUpdate()} />
      ) : null}
      {voidPayment ? <VoidFineReview payment={voidPayment} onClose={() => setVoidPayment(null)} onSaved={() => void load()} /> : null}
    </>
  )
}
