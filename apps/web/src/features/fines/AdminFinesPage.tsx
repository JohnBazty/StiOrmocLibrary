import {
  AlertTriangle,
  Download,
  FileText,
  PhilippinePeso,
  ReceiptText,
  RefreshCw,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import {
  Button,
  FormField,
  LumoDialog,
  NoticeBanner,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { getCurrentIdentity } from '../auth/auth-storage'
import { usePaymentUpdates } from '../payments/payment-updates'
import { ServiceChargesPanel } from '../payments/ServiceChargesPanel'
import { currentMonth, fineDate, fineMoney, today } from './fine-format'
import { finesApi } from './fines-api'
import type { FineFilterOptions, FineFilters, FineList, FineObligation, FineReceipt, FineTerm } from './types'
import { UrgentCases } from './UrgentCases'
import { ViolationsRecords } from './ViolationsRecords'

type FinesTab = 'fines' | 'urgent' | 'violations' | 'service-charges'

const tabs: Array<{ key: FinesTab; label: string; caption: string }> = [
  { key: 'fines', label: 'Fines & charges', caption: 'Overdue fines are added automatically. Record cash payments and adjustments here.' },
  { key: 'urgent', label: 'Urgent alerts', caption: 'People whose balance or overdue items need follow-up today.' },
  { key: 'violations', label: 'Violations', caption: 'Record library conduct. Warnings and fines follow Library setup → Violation rules.' },
  { key: 'service-charges', label: 'Service charges', caption: 'Other one-off services. Separate from printing and fines.' },
]
const fallbackOptions: FineFilterOptions = {
  types: [{ value: 'Overdue', label: 'Overdue' }, { value: 'Lost Book', label: 'Lost book' }, { value: 'Damage Replacement', label: 'Damage replacement' }],
  violations: [{ type: 'Infraction', category: null, label: 'All violations' }],
}
// One select carries both the fine type and the violation category.
const filterValue = (type: string, category?: string | null) => (category ? `${type}::${category}` : type)

const initial: FineFilters = { search: '', status: 'all', type: 'all', period: 'all', page: 1, limit: 100 }

function requestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function AdminFinesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab: FinesTab = tabs.some(tab => tab.key === requestedTab) ? (requestedTab as FinesTab) : 'fines'
  const incidentParam = Number(searchParams.get('incident'))
  const incidentId = Number.isSafeInteger(incidentParam) && incidentParam > 0 ? incidentParam : null
  const [options, setOptions] = useState<FineFilterOptions>(fallbackOptions)
  const [urgentCount, setUrgentCount] = useState(0)
  const [filters, setFilters] = useState<FineFilters>(initial)
  const [data, setData] = useState<FineList | null>(null)
  const [terms, setTerms] = useState<FineTerm[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [auditReason, setAuditReason] = useState('')
  const [paying, setPaying] = useState<FineObligation | null>(null)
  const [adjusting, setAdjusting] = useState<FineObligation | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<'Reduction' | 'Waiver' | 'Void'>('Reduction')
  const [receipt, setReceipt] = useState<FineReceipt | null>(null)
  const [reversingReceipt, setReversingReceipt] = useState(false)
  const [reversalReason, setReversalReason] = useState('')
  const [reversalError, setReversalError] = useState('')

  const loadSequence = useRef(0)
  const paymentKey = useRef('')
  const { ask, dialog: confirmSave } = useConfirmSave()
  const appliedFilters = useRef(initial)

  const invalidDateRange =
    filters.period === 'custom' &&
    Boolean(filters.from && filters.to && filters.from > filters.to)

  const hasActiveFilters =
    filters.period !== 'all' ||
    filters.type !== 'all' ||
    Boolean(filters.category) ||
    filters.status !== 'all' ||
    Boolean(filters.search.trim())

  const load = useCallback(
    async (current = filters) => {
      if (current.period === 'custom' && current.from && current.to && current.from > current.to) {
        setError('Start date cannot be after end date.')
        return
      }
      const sequence = ++loadSequence.current
      appliedFilters.current = current
      try {
        const result = await finesApi.adminList(current)
        if (sequence !== loadSequence.current) return
        setData(result)
        setError('')
        setPaying(value => {
          const latest = result.items.find(row => row.id === value?.id)
          return latest ? (latest.paymentAllowed ? latest : null) : value
        })
        setAdjusting(value => {
          const latest = result.items.find(row => row.id === value?.id)
          return latest ? (latest.paymentAllowed ? latest : null) : value
        })
      } catch (cause) {
        if (sequence !== loadSequence.current) return
        setError(cause instanceof Error ? cause.message : 'Fine records are unavailable.')
      }
    },
    [filters],
  )

  useEffect(() => {
    void load(initial)
    void finesApi
      .adminTerms()
      .then(setTerms)
      .catch(() => setTerms([]))
    void finesApi.filterOptions().then(setOptions).catch(() => setOptions(fallbackOptions))
    void finesApi.urgentCaseCount().then(setUrgentCount).catch(() => setUrgentCount(0))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  usePaymentUpdates(() => (busy ? undefined : load(appliedFilters.current)))

  const controls = useMemo(() => {
    if (filters.period === 'all') return null
    if (filters.period === 'daily') {
      return (
        <input
          type="date"
          aria-label="Daily filter date"
          value={filters.date ?? today()}
          onChange={event => setFilters({ ...filters, date: event.target.value })}
          className="sl-input"
        />
      )
    }
    if (filters.period === 'weekly') {
      return (
        <>
          <input
            type="month"
            aria-label="Weekly filter month"
            value={filters.month ?? currentMonth()}
            onChange={event => setFilters({ ...filters, month: event.target.value })}
            className="sl-input"
          />
          <select
            aria-label="Week in month"
            value={filters.week ?? 1}
            onChange={event => setFilters({ ...filters, week: Number(event.target.value) })}
            className="sl-input"
          >
            {[1, 2, 3, 4].map(week => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </select>
        </>
      )
    }
    if (filters.period === 'monthly') {
      return (
        <input
          type="month"
          aria-label="Monthly filter month"
          value={filters.month ?? currentMonth()}
          onChange={event => setFilters({ ...filters, month: event.target.value })}
          className="sl-input"
        />
      )
    }
    if (filters.period === 'semester') {
      return (
        <select
          aria-label="Semester"
          value={filters.termId ?? ''}
          onChange={event =>
            setFilters({
              ...filters,
              termId: event.target.value ? Number(event.target.value) : undefined,
            })
          }
          className="sl-input"
        >
          <option value="">Select semester</option>
          {terms.map(term => (
            <option key={term.id} value={term.id}>
              {term.name} {term.academicYear}
            </option>
          ))}
        </select>
      )
    }
    return (
      <>
        <input
          type="date"
          aria-label="Start date"
          value={filters.from ?? today()}
          onChange={event => setFilters({ ...filters, from: event.target.value })}
          className="sl-input"
        />
        <input
          type="date"
          aria-label="End date"
          value={filters.to ?? today()}
          onChange={event => setFilters({ ...filters, to: event.target.value })}
          className="sl-input"
        />
      </>
    )
  }, [filters, terms])

  function clearFilters() {
    setFilters(initial)
    void load(initial)
  }

  function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paying || busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    ask(`Record a cash payment of ${values.amount} for ${paying.userName}.`, () => {
      void sendPayment(values)
    })
  }

  async function sendPayment(values: Record<string, FormDataEntryValue>) {
    if (!paying) return
    setBusy(true)
    setFormError('')
    try {
      const created = await finesApi.pay({
        requestKey: paymentKey.current || (paymentKey.current = requestKey()),
        allocations: [
          {
            ...(paying.fineId ? { fineId: paying.fineId } : { lostBookReportId: paying.lostBookReportId! }),
            amount: Number(values.amount),
          },
        ],
        notes: String(values.notes || '') || undefined,
      })
      setReceipt(created)
      setPaying(null)
      setNotice(`Cash payment recorded under payment record ${created.receiptNumber}.`)
      await load()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The cash payment could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adjusting?.fineId || busy) return
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    ask(
      `${adjustmentType === 'Reduction' ? 'Record a partial payment' : `Record a ${adjustmentType.toLowerCase()}`} for ${adjusting.userName}.`,
      () => {
        void sendAdjustment(values)
      },
    )
  }

  async function sendAdjustment(values: Record<string, FormDataEntryValue>) {
    if (!adjusting?.fineId) return
    setBusy(true)
    setFormError('')
    try {
      if (adjustmentType === 'Reduction') {
        const created = await finesApi.pay({
          requestKey: paymentKey.current || (paymentKey.current = requestKey()),
          allocations: [{ fineId: adjusting.fineId, amount: Number(values.amount) }],
          notes: String(values.reason || '') || undefined,
        })
        setReceipt(created)
        setNotice(`Partial cash payment recorded under payment record ${created.receiptNumber}.`)
      } else {
        await finesApi.adjust(adjusting.fineId, { type: adjustmentType, reason: String(values.reason) })
        setNotice(`${adjustmentType} recorded. No payment record was generated.`)
      }
      setAdjusting(null)
      setAuditReason('')
      setError('')
      await load()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The fine could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  async function submitReversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!receipt || busy) return
    const reason = reversalReason.trim()
    if (reason.length < 5) {
      setReversalError('Enter at least 5 characters explaining why this receipt is being reversed.')
      return
    }
    setBusy(true)
    setReversalError('')
    try {
      setReceipt(await finesApi.reverse(receipt.receiptId, reason))
      setReversingReceipt(false)
      setReversalReason('')
      setNotice('The payment record was reversed and remains visible for audit.')
      await load()
    } catch (cause) {
      setReversalError(cause instanceof Error ? cause.message : 'The receipt could not be reversed.')
    } finally {
      setBusy(false)
    }
  }

  async function viewReceipt(receiptId: number) {
    setBusy(true)
    setError('')
    try {
      setReceipt(await finesApi.receipt(receiptId, true))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The receipt could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadReport() {
    setError('')
    try {
      await finesApi.downloadReport(filters)
    } catch (cause) {
      setError(cause instanceof Error ? `PDF export failed: ${cause.message}` : 'The PDF export failed.')
    }
  }

  function openTab(key: FinesTab, extra: Record<string, string> = {}, replace = false) {
    setSearchParams(key === 'fines' ? {} : { tab: key, ...extra }, { replace })
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (target < 0) return
    event.preventDefault()
    const next = tabs[target]
    // Moving along the tab row replaces the address, so Back leaves the page instead of stepping through every tab.
    openTab(next.key, {}, true)
    requestAnimationFrame(() => document.getElementById(`fines-tab-${next.key}`)?.focus())
  }
  const activeCaption = tabs.find(tab => tab.key === activeTab)!.caption

  return (
    <>
      <PageHeader
        eyebrow="Financial records"
        title="Fines management"
        description="Track overdue fines, replacement charges and violations; record counter cash payments or authorized adjustments."
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href="/librarian/payments"
              className="inline-flex min-h-[38px] items-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 text-sm font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] hover:bg-[var(--sl-bg-subtle)]"
            >
              Online payments
            </a>
          </div>
        }
      />

      <div role="tablist" aria-label="Fines management views" className="flex flex-wrap gap-1 border-b border-[var(--sl-border)]">
        {tabs.map((tab, index) => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              id={`fines-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="fines-tabpanel"
              tabIndex={active ? 0 : -1}
              onClick={() => openTab(tab.key)}
              onKeyDown={event => onTabKey(event, index)}
              className={`-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#0b5ea2] text-[#0b5ea2] dark:border-[#93c5fd] dark:text-[#93c5fd]'
                  : 'border-transparent text-[var(--sl-text-secondary)] hover:border-[var(--sl-border-strong)] hover:text-[var(--sl-text-header)]'
              }`}
            >
              {tab.label}
              {tab.key === 'urgent' && urgentCount > 0 ? (
                <span aria-label={`${urgentCount} urgent ${urgentCount === 1 ? 'case' : 'cases'}`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#FFF200] px-1.5 text-xs font-bold text-[#0b5ea2] ring-1 ring-[#0b5ea2]/40">
                  {urgentCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <p className="mb-5 mt-2 text-sm text-[var(--sl-text-secondary)]">{activeCaption}</p>

      <div role="tabpanel" id="fines-tabpanel" aria-labelledby={`fines-tab-${activeTab}`}>

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}

      {activeTab === 'urgent' ? <UrgentCases onCount={setUrgentCount} /> : null}
      {activeTab === 'violations' ? (
        <ViolationsRecords
          admin
          startRecording={searchParams.get('record') === '1'}
          onSaved={() => void load()}
          incidentId={incidentId}
          onIncidentChange={id => setSearchParams(id ? { tab: 'violations', incident: String(id) } : { tab: 'violations' })}
        />
      ) : null}
      {activeTab === 'service-charges' ? (
        <ServiceChargesPanel admin canManage={getCurrentIdentity()?.role === 'Librarian'} className="" />
      ) : null}

      {activeTab === 'fines' ? (
        <>
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw size={16} aria-hidden="true" /> Refresh
            </Button>
            <Button onClick={() => void downloadReport()}>
              <Download size={16} aria-hidden="true" /> Export filtered PDF
            </Button>
          </div>
          <SectionCard className="mb-5 p-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <select
                aria-label="Filter period"
                value={filters.period}
                onChange={event => setFilters({ ...filters, period: event.target.value as FineFilters['period'] })}
                className="sl-input"
              >
                <option value="all">All records</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="semester">Per semester</option>
                <option value="custom">Custom dates</option>
              </select>
              {controls}
              <select
                aria-label="Fine type"
                value={filterValue(filters.type, filters.category)}
                onChange={event => {
                  const [type, category] = event.target.value.split('::')
                  setFilters({ ...filters, type, category: category || undefined })
                }}
                className="sl-input"
              >
                <option value="all">All charges</option>
                <optgroup label="Borrowing">
                  {options.types.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Violations">
                  {options.violations.map(item => (
                    <option key={`${item.type}-${item.category ?? 'all'}`} value={filterValue(item.type, item.category)}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <select
                aria-label="Fine status"
                value={filters.status}
                onChange={event => setFilters({ ...filters, status: event.target.value })}
                className="sl-input"
              >
                <option value="all">All statuses</option>
                {['Accruing', 'Unpaid', 'Partially Paid', 'Paid', 'Waived', 'Voided'].map(status => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <input
                aria-label="Search fines and receipts"
                value={filters.search}
                onChange={event => setFilters({ ...filters, search: event.target.value })}
                placeholder="Name, ID, receipt, or verification code"
                className="sl-input"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={invalidDateRange} onClick={() => void load()}>
                  Apply filters
                </Button>
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X size={14} aria-hidden="true" /> Clear
                  </Button>
                ) : null}
              </div>
            </div>
            {invalidDateRange ? (
              <p role="alert" className="field-error mt-2">
                Start date cannot be after end date.
              </p>
            ) : null}
          </SectionCard>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Assessed" value={fineMoney(data?.summary.assessed ?? 0)} icon={PhilippinePeso} />
            <StatCard label="Outstanding" value={fineMoney(data?.summary.outstanding ?? 0)} icon={AlertTriangle} tone="warning" />
            <StatCard label="Collected" value={fineMoney(data?.summary.collected ?? 0)} icon={ReceiptText} tone="success" />
            <StatCard label="Accounts with balance" value={data?.summary.accountsWithBalance ?? 0} icon={FileText} />
          </div>

          <SectionCard className="overflow-hidden">
            <div className="border-b border-[var(--sl-border)] px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Fine audit table</h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                {data?.range.label ?? 'Selected period'} · {data?.pagination.total ?? 0} records
              </p>
            </div>
            <ResponsiveTable label="Fine audit table">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                  <tr>
                    {[
                      'Borrower',
                      'Type',
                      'Book / incident',
                      'Reason',
                      'Assessed',
                      'Paid',
                      'Waived',
                      'Balance',
                      'Receipt / verification',
                      'Status',
                      'Date',
                      'Actions',
                    ].map(value => (
                      <th key={value} scope="col" className="px-4 py-2.5">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {data?.items.length ? (
                    data.items.map(item => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-[var(--sl-text-header)]">{item.userName}</p>
                          <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{item.schoolId}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-medium text-[var(--sl-text-secondary)]">{item.typeLabel}</td>
                        <td className="max-w-48 px-4 py-3.5 font-semibold text-[var(--sl-text-header)]">{item.title}</td>
                        <td className="max-w-64 px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">{item.reason}</td>
                        <td className="px-4 py-3.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
                          {fineMoney(item.assessed)}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums">{fineMoney(item.paid)}</td>
                        <td className="px-4 py-3.5 tabular-nums">{fineMoney(item.adjusted)}</td>
                        <td className="px-4 py-3.5 font-bold tabular-nums text-[var(--sl-text-header)]">
                          {fineMoney(item.balance)}
                        </td>
                        <td className="min-w-52 px-4 py-3.5">
                          {item.receipts.length ? (
                            <div className="space-y-1.5">
                              {item.receipts.map(reference => (
                                <button
                                  key={reference.receiptId}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void viewReceipt(reference.receiptId)}
                                  className="block w-full rounded-[6px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-2 text-left transition-colors hover:bg-[var(--sl-bg-hover)]"
                                >
                                  <span className="block font-mono text-xs font-semibold text-[var(--sl-text-header)]">
                                    {reference.receiptNumber}
                                  </span>
                                  <span className="block font-mono text-xs text-[var(--sl-text-muted)]">
                                    {reference.verificationCode}
                                  </span>
                                  {reference.status === 'Reversed' ? (
                                    <span className="mt-1 block text-[10px] font-bold text-[var(--sl-error-text)]">
                                      REVERSED
                                    </span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span aria-label="No receipt" className="text-[var(--sl-text-muted)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3.5 text-xs tabular-nums text-[var(--sl-text-secondary)]">
                          {fineDate(item.occurredAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {item.paymentAllowed ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  paymentKey.current = requestKey()
                                  setFormError('')
                                  setPaying(item)
                                }}
                              >
                                Cash payment
                              </Button>
                            ) : null}
                            {item.incidentId ? (
                              <Button size="sm" variant="ghost" onClick={() => openTab('violations', { incident: String(item.incidentId) })}>
                                View violation
                              </Button>
                            ) : null}
                            {item.fineId && item.status !== 'Accruing' && !['Paid', 'Waived', 'Voided'].includes(item.status) ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  paymentKey.current = requestKey()
                                  setFormError('')
                                  setAuditReason('')
                                  setAdjustmentType('Reduction')
                                  setAdjusting(item)
                                }}
                              >
                                Adjust
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="p-10 text-center">
                        <p className="font-semibold text-[var(--sl-text-header)]">No fine records match these filters.</p>
                        {hasActiveFilters ? (
                          <div className="mt-3">
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ResponsiveTable>
          </SectionCard>
        </>
      ) : null}
      </div>

      {paying ? (
        <LumoDialog title="Record cash payment" busy={busy} onClose={() => setPaying(null)}>
          <div className="mb-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4 text-sm">
            <strong className="text-[var(--sl-text-header)]">{paying.userName}</strong>
            <p className="text-[var(--sl-text-secondary)]">{paying.title}</p>
            <p className="mt-2 font-bold tabular-nums text-[var(--sl-text-header)]">
              Remaining balance: {fineMoney(paying.balance)}
            </p>
            {paying.type === 'Lost Book' ? (
              <p className="mt-1 text-xs text-[var(--sl-text-muted)]">
                Lost-book replacement charges must be paid in full.
              </p>
            ) : null}
          </div>
          <UnsavedGuard className="contents" cleanOnSubmit>
            <form onSubmit={pay} className="space-y-3">
              {formError ? <NoticeBanner tone="error">{formError}</NoticeBanner> : null}
              <input
                aria-label="Amount received"
                name="amount"
                type="number"
                min="0.01"
                max={paying.balance}
                step="0.01"
                defaultValue={paying.balance.toFixed(2)}
                readOnly={paying.type === 'Lost Book'}
                className="sl-input"
              />
              <textarea
                name="notes"
                placeholder="Counter notes (optional)"
                className="sl-input h-24 py-2.5"
              />
              <Button type="submit" disabled={busy} className="w-full">
                Record cash payment
              </Button>
            </form>
          </UnsavedGuard>
        </LumoDialog>
      ) : null}

      {adjusting ? (
        <LumoDialog title="Document fine adjustment" busy={busy} onClose={() => setAdjusting(null)}>
          <div className="mb-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4 text-sm">
            {adjustmentType === 'Reduction' ? (
              <>
                <strong className="text-[var(--sl-text-header)]">Partial cash payment</strong>
                <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">
                  The amount entered is the cash paid now. The unpaid amount remains as the student’s balance, and a payment record will be generated.
                </p>
              </>
            ) : (
              <>
                <strong className="text-[var(--sl-text-header)]">No cash payment</strong>
                <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">
                  A waiver or void changes the fine without receiving cash, so it will not generate a payment record.
                </p>
              </>
            )}
          </div>
          <UnsavedGuard className="contents" cleanOnSubmit>
            <form onSubmit={adjust} className="space-y-3">
              {formError ? <NoticeBanner tone="error">{formError}</NoticeBanner> : null}
              <label htmlFor="fine-adjustment-type" className="block text-xs font-semibold text-[var(--sl-text-secondary)]">
                Adjustment type
              </label>
              <select
                id="fine-adjustment-type"
                name="type"
                value={adjustmentType}
                onChange={event => setAdjustmentType(event.target.value as 'Reduction' | 'Waiver' | 'Void')}
                className="sl-input"
              >
                <option value="Reduction">Reduction (partial payment)</option>
                <option>Waiver</option>
                <option>Void</option>
              </select>
              {adjustmentType === 'Reduction' ? (
                <>
                  <label htmlFor="fine-reduction-payment" className="block text-xs font-semibold text-[var(--sl-text-secondary)]">
                    Cash amount paid
                  </label>
                  <input
                    id="fine-reduction-payment"
                    name="amount"
                    type="number"
                    min="0.01"
                    max={adjusting.balance}
                    step="0.01"
                    required
                    placeholder={`Maximum ${fineMoney(adjusting.balance)}`}
                    className="sl-input"
                  />
                  <p className="text-xs text-[var(--sl-text-muted)]">
                    To pay half, enter {fineMoney(adjusting.balance / 2)}.
                  </p>
                </>
              ) : null}
              <label htmlFor="fine-adjustment-reason" className="block text-xs font-semibold text-[var(--sl-text-secondary)]">
                {adjustmentType === 'Reduction' ? 'Payment notes' : 'Mandatory audit reason'}
              </label>
              <textarea
                id="fine-adjustment-reason"
                name="reason"
                value={auditReason}
                onChange={event => setAuditReason(event.target.value)}
                required={adjustmentType !== 'Reduction'}
                minLength={adjustmentType === 'Reduction' ? undefined : 10}
                placeholder={
                  adjustmentType === 'Reduction'
                    ? 'Counter notes (optional)'
                    : 'Explain why this adjustment is authorized'
                }
                className="sl-input h-28 py-2.5"
              />
              <Button type="submit" disabled={busy} className="w-full">
                {adjustmentType === 'Reduction' ? 'Record payment' : `Record ${adjustmentType.toLowerCase()}`}
              </Button>
            </form>
          </UnsavedGuard>
        </LumoDialog>
      ) : null}

      {confirmSave}

      {receipt ? (
        <LumoDialog
          title={`Payment record ${receipt.receiptNumber}`}
          busy={busy}
          onClose={() => {
            setReceipt(null)
            setReversingReceipt(false)
            setReversalReason('')
            setReversalError('')
          }}
        >
          <div className="space-y-3 text-sm">
            <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4">
              <div className="flex justify-between">
                <strong className="text-[var(--sl-text-header)]">{receipt.student.name}</strong>
                <StatusBadge status={receipt.status} />
              </div>
              <p className="text-xs text-[var(--sl-text-muted)]">{receipt.student.schoolId}</p>
              <p className="mt-3 text-xl font-bold tabular-nums text-[var(--sl-text-header)]">
                {fineMoney(receipt.totalReceived ?? receipt.amountReceived)}
              </p>
              {receipt.confirmationSource === 'Xendit' ? (
                <p className="text-xs text-[var(--sl-text-secondary)]">
                  Applied {fineMoney(receipt.amountReceived)} · Fee {fineMoney((receipt.transactionFeeCentavos ?? 0) / 100)}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">
                {receipt.paymentMethod} · {receipt.confirmationSource === 'Xendit' ? 'Verified by' : 'Received by'}{' '}
                {receipt.receivedBy} · {fineDate(receipt.receivedAt)}
              </p>
              <div className="mt-4 grid gap-1 rounded-[6px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3">
                <span className="text-xs font-semibold text-[var(--sl-text-muted)]">Receipt number</span>
                <span className="font-mono text-xs font-semibold text-[var(--sl-text-header)]">{receipt.receiptNumber}</span>
                <span className="mt-2 text-xs font-semibold text-[var(--sl-text-muted)]">Verification code</span>
                <span className="font-mono text-xs text-[var(--sl-text-header)]">{receipt.verificationCode}</span>
              </div>
            </div>

            {receipt.allocations.map((item, index) => (
              <div key={index} className="rounded-[8px] border border-[var(--sl-border)] p-3">
                <strong className="text-[var(--sl-text-header)]">{item.title}</strong>
                <p className="mt-0.5 text-xs tabular-nums text-[var(--sl-text-secondary)]">
                  Paid {fineMoney(item.paid)} · Remaining {fineMoney(item.balanceAfter)}
                </p>
              </div>
            ))}

            {reversingReceipt ? (
              <form onSubmit={submitReversal} className="space-y-3 rounded-[8px] border border-[var(--sl-error-border)] bg-[var(--sl-error-soft)] p-3.5">
                {reversalError ? <NoticeBanner tone="error">{reversalError}</NoticeBanner> : null}
                <FormField id="receipt-reversal-reason" label="Reason for reversing this cash receipt" required>
                  <textarea
                    id="receipt-reversal-reason"
                    rows={2}
                    value={reversalReason}
                    onChange={e => {
                      setReversalReason(e.target.value)
                      if (reversalError) setReversalError('')
                    }}
                    placeholder="Explain why this receipt is being reversed (at least 5 characters)"
                    className="sl-input"
                  />
                </FormField>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setReversingReceipt(false)
                      setReversalReason('')
                      setReversalError('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="danger" size="sm" disabled={busy}>
                    {busy ? 'Reversing…' : 'Confirm reversal'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void finesApi
                      .downloadReceipt(receipt.receiptId, receipt.receiptNumber, true)
                      .catch(cause => setError(cause instanceof Error ? cause.message : 'Receipt download failed.'))
                  }
                >
                  <Download size={16} aria-hidden="true" /> Download payment PDF
                </Button>
                {receipt.status === 'Issued' && receipt.confirmationSource !== 'Xendit' ? (
                  <Button variant="secondary" disabled={busy} onClick={() => setReversingReceipt(true)}>
                    Reverse receipt
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </LumoDialog>
      ) : null}
    </>
  )
}
