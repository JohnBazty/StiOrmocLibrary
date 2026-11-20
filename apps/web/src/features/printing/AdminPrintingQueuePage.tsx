import { Clock3, Download, Eye, PackageCheck, Printer, Search, WalletCards, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExportMenu } from '../../components/ExportMenu'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { RowActions } from '../../components/RowActions'
import {
  Button,
  LumoDialog,
  NoticeBanner,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { moneyOutApi } from '../payments/money-out-api'
import { PaymentProofPanel } from '../payments/PaymentProofPanel'
import { DocumentPreview } from './DocumentPreview'
import { DocumentRetentionPanel } from './DocumentRetentionPanel'
import { PrintCounterPaymentDialog } from './PrintCounterPaymentDialog'
import { PrintingDialog } from './PrintingDialog'
import { PrintingInvoice } from './PrintingInvoice'
import { PrintingReceiptModal } from './PrintingReceiptModal'
import { PrintPriceReview } from './PrintPriceReview'
import {
  printingApi,
  type PrintQueueFilters,
  type PrintRequest,
  type PrintingReceipt,
  type PrintSummary,
} from './printing-api'
import { RefreshButton } from '../../components/RefreshButton'

function totalSheets(row: PrintRequest): number {
  const sheets = Number(row.total_sheets)
  if (Number.isFinite(sheets) && sheets > 0) return sheets
  return Number(row.page_count ?? 0) * Number(row.number_of_copies ?? 0)
}

export function AdminPrintingQueuePage() {
  const [counterRow, setCounterRow] = useState<PrintRequest | null>(null)
  const [proofId, setProofId] = useState<string | null>(null)
  const [reviewRow, setReviewRow] = useState<PrintRequest | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PrintRequest | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [summary, setSummary] = useState<PrintSummary | null>(null)
  const [rows, setRows] = useState<PrintRequest[]>([])
  const [section, setSection] = useState<'active' | 'history' | 'retention'>('active')
  const [filters, setFilters] = useState<PrintQueueFilters>({
    q: '',
    status: '',
    payment: '',
    scope: 'active',
    page: 1,
    limit: 25,
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pauseError, setPauseError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<PrintingReceipt | null>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)
  const [pauseReason, setPauseReason] = useState('Temporarily paused by library staff.')

  const visibleRows = rows.filter(row =>
    filters.scope === 'history'
      ? ['Completed', 'Cancelled'].includes(row.job_status)
      : !['Completed', 'Cancelled'].includes(row.job_status),
  )

  const hasFilters = Boolean(filters.q || filters.status || filters.payment)
  const accepting = Boolean(summary && Number(summary.service_status?.accepting_requests))
  const manuallyAccepting = Boolean(
    Number(summary?.service_status?.manually_accepting_requests ?? summary?.service_status?.accepting_requests),
  )

  const currentFilters = useRef(filters)
  currentFilters.current = filters
  const requestVersion = useRef(0)
  const polling = useRef(false)

  function openSection(next: 'active' | 'history' | 'retention') {
    setSection(next)
    if (next !== 'retention') {
      setLoading(true)
      setFilters(value => ({ ...value, scope: next, status: '', page: 1 }))
    }
  }

  function clearFilters() {
    setFilters(value => ({ ...value, q: '', status: '', payment: '', page: 1 }))
  }

  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setError('')
    try {
      let [s, q] = await Promise.all([printingApi.summary(), printingApi.queue(currentFilters.current)])
      if (s.localPreview && q.rows.some(row => row.refund_pending)) {
        await moneyOutApi.recover()
        ;[s, q] = await Promise.all([printingApi.summary(), printingApi.queue(currentFilters.current)])
      }
      if (version !== requestVersion.current) return
      setSummary(s)
      setRows(q.rows)
      setPagination(q.pagination ?? { page: currentFilters.current.page ?? 1, limit: 25, total: q.rows.length, total_pages: 1 })
      if (s.service_status?.unavailable_reason) {
        setPauseReason(s.service_status.unavailable_reason)
      }
    } catch (e) {
      if (version === requestVersion.current) {
        setError(e instanceof Error ? e.message : 'Unable to load the print queue.')
      }
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setRows([])
    const timer = setTimeout(() => void load(), 250)
    return () => {
      clearTimeout(timer)
      requestVersion.current++
    }
  }, [load, filters.q, filters.status, filters.payment, filters.scope, filters.page])

  useEffect(() => {
    const refresh = async () => {
      if (document.hidden || polling.current) return
      polling.current = true
      try {
        await load()
      } finally {
        polling.current = false
      }
    }
    const timer = window.setInterval(refresh, 10000)
    window.addEventListener('focus', refresh)
    window.addEventListener('library-payments-updated', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('library-payments-updated', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  const action = async (key: string, fn: () => Promise<unknown>, successMessage?: string) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await fn()
      if (successMessage) setNotice(successMessage)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update the print request.')
    } finally {
      setBusy('')
    }
  }

  const savePauseReason = async () => {
    const trimmed = pauseReason.trim()
    if (!trimmed) {
      setPauseError('Enter a short reason students can see while requests are paused.')
      return
    }
    setPauseError('')
    await action('save-pause-reason', () => printingApi.setServiceStatus(false, trimmed), 'Pause reason updated.')
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    const target = cancelTarget
    await action(
      `cancel-${target.request_id}`,
      async () => {
        await printingApi.status(target.request_id, 'Cancelled', 'Cancelled by printing staff')
        setCancelTarget(null)
      },
      `Print request #${target.request_id} cancelled.`,
    )
  }

  const exportPdf = async () => {
    setExporting(true)
    try {
      await printingApi.printReport({ ...filters, page: undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export the report.')
    } finally {
      setExporting(false)
    }
  }

  const viewReceipt = async (id: number) => {
    setBusy(`receipt-${id}`)
    setError('')
    try {
      setSelectedReceipt(await printingApi.receipt(id, true))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the printing receipt.')
    } finally {
      setBusy('')
    }
  }

  const downloadReceipt = async (receipt: PrintingReceipt) => {
    setDownloadingReceipt(true)
    setError('')
    try {
      await printingApi.downloadReceipt(receipt, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download the printing receipt.')
    } finally {
      setDownloadingReceipt(false)
    }
  }

  const tabs: Array<['active' | 'history' | 'retention', string]> = [
    ['active', 'Active queue'],
    ['history', 'History'],
    ...(getCurrentIdentity()?.role === 'Librarian' ? ([['retention', 'Document retention']] as Array<['retention', string]>) : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow="Service operations"
        title="Printing queue"
        description="Review submitted documents, collect counter payments, and advance print jobs from printing to pickup."
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href="/librarian/payments"
              className="inline-flex min-h-[38px] items-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 text-sm font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] hover:bg-[var(--sl-bg-subtle)]"
            >
              Online payments
            </a>
            {section !== 'retention' ? (
              <RefreshButton onRefresh={() => load()} variant="secondary" />
            ) : null}
            {section !== 'retention' ? (
              <ExportMenu
                label="Export filtered results"
                disabled={exporting}
                exports={[{ label: exporting ? 'Preparing PDF…' : 'PDF', onSelect: () => void exportPdf() }]}
              />
            ) : null}
          </div>
        }
      />

      <nav aria-label="Printing tasks" className="mb-5 flex flex-wrap gap-1 border-b border-[var(--sl-border)]">
        {tabs.map(([key, label]) => {
          const active = section === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => openSection(key)}
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
      </nav>

      {section === 'retention' ? <DocumentRetentionPanel /> : null}

      {section !== 'retention' ? (
        <>
          {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
          {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}

          <SectionCard className="mb-5 flex flex-col gap-3 p-4 md:flex-row md:items-end">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--sl-text-muted)]">
                Student request availability
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[var(--sl-text-header)]">
                  {!summary
                    ? loading
                      ? 'Loading printing service…'
                      : 'Printing service status unavailable.'
                    : accepting
                      ? 'Accepting print requests'
                      : manuallyAccepting
                        ? 'Outside printing hours'
                        : 'Print requests are paused'}
                </p>
                {summary ? (
                  <StatusBadge status={accepting ? 'Open' : manuallyAccepting ? 'Scheduled' : 'Closed'} />
                ) : null}
              </div>
              {summary && !manuallyAccepting ? (
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <input
                      aria-label="Printing unavailable reason"
                      className="sl-input"
                      value={pauseReason}
                      onChange={e => {
                        setPauseReason(e.target.value)
                        if (pauseError) setPauseError('')
                      }}
                      maxLength={255}
                    />
                    {pauseError ? <p className="field-error mt-1">{pauseError}</p> : null}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== '' || loading}
                    onClick={() => void savePauseReason()}
                  >
                    {busy === 'save-pause-reason' ? 'Saving…' : 'Save reason'}
                  </Button>
                </div>
              ) : null}
            </div>
            {summary ? (
              <Button
                variant={manuallyAccepting ? 'secondary' : 'primary'}
                disabled={busy !== '' || loading}
                onClick={() =>
                  void action(
                    'service-status',
                    () => printingApi.setServiceStatus(!manuallyAccepting, manuallyAccepting ? pauseReason : undefined),
                    manuallyAccepting ? 'Print requests paused.' : 'Print requests resumed.',
                  )
                }
              >
                {manuallyAccepting ? 'Pause requests' : 'Resume requests'}
              </Button>
            ) : null}
          </SectionCard>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Pending" value={summary?.pending_jobs ?? '—'} icon={Clock3} />
            <StatCard label="Printing" value={summary?.printing_jobs ?? '—'} icon={Printer} />
            <StatCard label="Ready" value={summary?.ready_jobs ?? '—'} icon={PackageCheck} tone={summary?.ready_jobs ? 'success' : 'default'} />
            <StatCard label="Unpaid" value={summary?.unpaid_jobs ?? '—'} icon={WalletCards} tone={summary?.unpaid_jobs ? 'warning' : 'default'} />
            <StatCard
              label="Payments applied today"
              value={summary ? `₱${Number(summary.revenue_today).toFixed(2)}` : '—'}
              icon={WalletCards}
            />
          </div>

          <SectionCard className="mb-5 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
              <div className="relative">
                <Search
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--sl-text-muted)]"
                />
                <input
                  aria-label="Find print request"
                  className="sl-input pl-9"
                  placeholder="User, ID, request, receipt, or verification"
                  value={filters.q}
                  onChange={e => setFilters(v => ({ ...v, q: e.target.value, page: 1 }))}
                />
              </div>
              <select
                aria-label="Job status"
                className="sl-input"
                value={filters.status}
                onChange={e => setFilters(v => ({ ...v, status: e.target.value, page: 1 }))}
              >
                <option value="">All job statuses</option>
                {(section === 'history' ? ['Completed', 'Cancelled'] : ['Pending', 'Printing', 'Ready for Pickup']).map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                aria-label="Payment status"
                className="sl-input"
                value={filters.payment}
                onChange={e => setFilters(v => ({ ...v, payment: e.target.value, page: 1 }))}
              >
                <option value="">All payment states</option>
                <option>Unpaid</option>
                <option>Partially Paid</option>
                <option>Paid</option>
                <option>Refund pending</option>
                <option>Refunded</option>
              </select>
              {hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X size={14} aria-hidden="true" /> Clear filters
                </Button>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard className="overflow-hidden">
            <div className="border-b border-[var(--sl-border)] px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
                {section === 'history' ? 'Completed and cancelled jobs' : 'Active print requests'}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                {section === 'history'
                  ? 'Completed and cancelled requests retain their payment and document history.'
                  : 'Active requests appear in submission order, oldest first.'}
              </p>
            </div>
            <ResponsiveTable label="Print requests">
              <table className="w-full min-w-[1140px] text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                  <tr>
                    {['Request & requester', 'Document & invoice', 'Job details', 'Cost & payment', 'Receipt', 'Status', 'Actions'].map(h => (
                      <th scope="col" className="px-4 py-2.5" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-sm text-[var(--sl-text-secondary)]">
                        Loading queue…
                      </td>
                    </tr>
                  ) : visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center">
                        <p className="font-semibold text-[var(--sl-text-header)]">
                          {error ? 'Unable to load print requests. Use Refresh to try again.' : 'No print requests match these filters.'}
                        </p>
                        {!error && hasFilters ? (
                          <div className="mt-3">
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map(r => {
                      const sheets = totalSheets(r)
                      const readyToAdvance = (!r.pricing_review_state || r.pricing_review_state === 'Ready') && !r.refund_pending
                      const canStartPrinting =
                        readyToAdvance && r.job_status === 'Pending' && (r.payment_status === 'Paid' || r.pay_later_accepted)
                      const needsPriceReview = r.pricing_review_state === 'Pending' && r.job_status === 'Pending'
                      return (
                        <tr key={r.request_id} className="align-top">
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-[var(--sl-text-header)]">
                              <span className="font-mono text-xs text-[var(--sl-text-muted)]">#{r.request_id}</span> · {r.full_name}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
                              {r.school_id} · {r.user_role}
                            </p>
                          </td>
                          <td className="max-w-[260px] px-4 py-3.5">
                            <p className="truncate font-semibold text-[var(--sl-text-header)]">
                              {r.file_name}
                              {r.documents_expired_at ? (
                                <span className="ml-2 text-xs font-normal text-[var(--sl-text-muted)]">
                                  Document expired · history retained
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)] tabular-nums">
                              {new Date(r.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                            </p>
                            <PrintingInvoice request={r} admin />
                          </td>
                          <td className="px-4 py-3.5 text-[var(--sl-text)] tabular-nums">
                            <p className="font-medium">
                              {r.page_count} pages × {r.number_of_copies}
                              {sheets > 0 ? <span className="text-[var(--sl-text-muted)]"> ({sheets} sheets)</span> : null}
                            </p>
                            {sheets >= 60 ? (
                              <p className="mt-0.5 text-xs font-semibold text-[var(--sl-warning-text)]">
                                Large job · check paper stock
                              </p>
                            ) : null}
                            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                              {r.service_kind ?? 'Print'} · {r.output_mode ?? r.print_type} · {r.paper_size}
                            </p>
                            {r.output_mode === 'Automatic' && r.pricing_snapshot ? (
                              <p className="mt-1 break-words text-xs text-[var(--sl-text-muted)]">
                                Color pages: {r.pricing_snapshot.coloredPages.join(', ') || 'None'}. Remaining pages monochrome.
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 tabular-nums">
                            <p className="font-semibold text-[var(--sl-text-header)]">₱{Number(r.calculated_cost).toFixed(2)}</p>
                            <div className="mt-1">
                              <StatusBadge status={r.payment_status} />
                            </div>
                            {['Unpaid', 'Partially Paid'].includes(r.payment_status) ? (
                              <p className="mt-1.5 text-xs font-medium text-[var(--sl-text-secondary)]">
                                Due ₱{Number(r.balance ?? r.calculated_cost).toFixed(2)}
                              </p>
                            ) : null}
                            {r.pay_later_accepted ? (
                              <p className="mt-1 text-xs font-semibold text-[var(--sl-info-text)]">Pay later approved</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">
                            {r.print_receipt_id ? (
                              <>
                                <p className="font-mono text-xs font-semibold text-[var(--sl-text-header)]">{r.receipt_number}</p>
                                <p className="mt-0.5 font-mono text-xs text-[var(--sl-text-muted)]">{r.verification_code}</p>
                              </>
                            ) : (
                              <span className="text-xs text-[var(--sl-text-muted)]">
                                {r.localPaymentId ? (
                                  <a className="font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]" href="/librarian/payments">
                                    View online payment
                                  </a>
                                ) : (
                                  'Not issued'
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={r.job_status} />
                            {r.pricing_review_state && r.pricing_review_state !== 'Ready' && r.job_status !== 'Cancelled' ? (
                              <p className="mt-1.5 text-xs font-semibold text-[var(--sl-warning-text)]">
                                {r.pricing_review_state === 'Pending'
                                  ? 'Page review needed'
                                  : 'Waiting for requester price confirmation'}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-end gap-1.5">
                              {needsPriceReview ? (
                                <Button size="sm" disabled={busy !== ''} onClick={() => setReviewRow(r)}>
                                  Review pages and price
                                </Button>
                              ) : canStartPrinting ? (
                                <Button
                                  size="sm"
                                  disabled={busy !== ''}
                                  onClick={() =>
                                    void action(
                                      `start-${r.request_id}`,
                                      () => printingApi.status(r.request_id, 'Printing'),
                                      `Started printing request #${r.request_id}.`,
                                    )
                                  }
                                >
                                  Start printing
                                </Button>
                              ) : r.job_status === 'Printing' ? (
                                <Button
                                  size="sm"
                                  disabled={busy !== ''}
                                  onClick={() =>
                                    void action(
                                      `ready-${r.request_id}`,
                                      () => printingApi.status(r.request_id, 'Ready for Pickup'),
                                      `Request #${r.request_id} marked ready for pickup.`,
                                    )
                                  }
                                >
                                  Mark ready
                                </Button>
                              ) : r.job_status === 'Ready for Pickup' ? (
                                <Button
                                  size="sm"
                                  disabled={busy !== ''}
                                  onClick={() =>
                                    void action(
                                      `done-${r.request_id}`,
                                      () => printingApi.status(r.request_id, 'Completed'),
                                      `Pickup confirmed for request #${r.request_id}.`,
                                    )
                                  }
                                >
                                  Confirm pickup
                                </Button>
                              ) : null}

                              <RowActions label={`Actions for print request ${r.request_id}`}>
                                {!r.documents_expired_at && r.service_kind !== 'Photocopy' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => setPreview(`/api/v1/admin/printing/requests/${r.request_id}/preview`)}
                                    >
                                      Preview document
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      disabled={busy !== ''}
                                      onClick={() => void action(`download-${r.request_id}`, () => printingApi.downloadDocument(r))}
                                    >
                                      <Download size={14} aria-hidden="true" />
                                      {busy === `download-${r.request_id}` ? 'Downloading…' : 'Download file'}
                                    </Button>
                                  </>
                                ) : null}
                                {readyToAdvance &&
                                ['Unpaid', 'Partially Paid'].includes(r.payment_status) &&
                                r.job_status !== 'Cancelled' ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy !== ''}
                                    onClick={() => setCounterRow(r)}
                                  >
                                    Receive cash / pay later
                                  </Button>
                                ) : null}
                                {r.proof_payment_id || r.localPaymentId ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setProofId(r.proof_payment_id ?? r.localPaymentId!)}
                                  >
                                    View proof
                                  </Button>
                                ) : null}
                                {r.print_receipt_id ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy !== ''}
                                    onClick={() => void viewReceipt(Number(r.print_receipt_id))}
                                  >
                                    <Eye size={14} aria-hidden="true" />
                                    {busy === `receipt-${r.print_receipt_id}` ? 'Loading…' : 'View payment'}
                                  </Button>
                                ) : null}
                                {readyToAdvance && r.job_status === 'Pending' && r.payment_status === 'Unpaid' ? (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    disabled={busy !== ''}
                                    onClick={() => setCancelTarget(r)}
                                  >
                                    Cancel
                                  </Button>
                                ) : null}
                              </RowActions>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </ResponsiveTable>
          </SectionCard>

          <div className="my-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--sl-text-secondary)]">
            <p className="tabular-nums">
              {loading
                ? 'Loading print requests…'
                : `${pagination.total} matching requests · Page ${pagination.page} of ${Math.max(1, pagination.total_pages)}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={loading || pagination.page <= 1}
                onClick={() => {
                  setLoading(true)
                  setFilters(v => ({ ...v, page: (v.page ?? 1) - 1 }))
                }}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={loading || pagination.page >= pagination.total_pages}
                onClick={() => {
                  setLoading(true)
                  setFilters(v => ({ ...v, page: (v.page ?? 1) + 1 }))
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {cancelTarget ? (
        <LumoDialog
          title="Cancel print request?"
          description={`Request #${cancelTarget.request_id} (${cancelTarget.file_name}) for ${cancelTarget.full_name} will be marked Cancelled and removed from the active print queue.`}
          busy={busy === `cancel-${cancelTarget.request_id}`}
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <Button variant="secondary" disabled={busy !== ''} onClick={() => setCancelTarget(null)}>
                Keep request
              </Button>
              <Button variant="danger" disabled={busy !== ''} onClick={() => void confirmCancel()}>
                {busy === `cancel-${cancelTarget.request_id}` ? 'Cancelling…' : 'Cancel print request'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--sl-text)]">
            This unpaid request has not started printing yet. Its history remains on the History tab.
          </p>
        </LumoDialog>
      ) : null}

      {counterRow ? <PrintCounterPaymentDialog row={counterRow} onClose={() => setCounterRow(null)} onSaved={load} /> : null}
      {proofId ? (
        <PrintingDialog title="Payment proof" onClose={() => setProofId(null)}>
          <PaymentProofPanel paymentId={proofId} admin onUpdated={load} />
        </PrintingDialog>
      ) : null}
      <DocumentPreview url={preview} admin onClose={() => setPreview(null)} />
      {reviewRow ? <PrintPriceReview row={reviewRow} onClose={() => setReviewRow(null)} onSaved={load} /> : null}
      <PrintingReceiptModal
        receipt={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        onDownload={() => selectedReceipt && void downloadReceipt(selectedReceipt)}
        downloading={downloadingReceipt}
      />
    </>
  )
}
