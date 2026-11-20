import { ArrowRight, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, NoticeBanner, PageHeader, SectionCard } from '../../components/ui'
import { FundsActivity } from './FundsActivity'
import { LibraryFundsSummary } from './LibraryFundsSummary'
import { moneyOutApi, moneyOutStatus, type MoneyOutRecord, type PracticeTransfer } from './money-out-api'
import { notifyPaymentUpdate } from './payment-updates'
import { paymentMoney } from './payments-api'
import './payments.css'
import { PracticeTransferDialog } from './PracticeBankTransfers'
import { RefundApproval } from './RefundApproval'
import { MoneyOutDialog, MoneyOutSummary } from './RefundReview'
import { SchoolBankManager } from './SchoolBankManager'
import { useLibraryFunds } from './useLibraryFunds'
import { WithdrawalReview } from './WithdrawalReview'
import { RefreshButton } from '../../components/RefreshButton'

export function LibraryFundsPage() {
  const { data, error, setError, refreshing, refresh, refreshAfterChange } = useLibraryFunds()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [manageBank, setManageBank] = useState(false)
  const [withdraw, setWithdraw] = useState(false)
  const [addition, setAddition] = useState(false)
  const [selectedLocal, setSelectedLocal] = useState<PracticeTransfer | null>(null)
  const [selected, setSelected] = useState<MoneyOutRecord | null>(null)
  const [providerId, setProviderId] = useState('')
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    if (data) {
      setSelected(current => (current ? data.operations.find(row => row.id === current.id) ?? current : null))
    }
  }, [data])

  useEffect(() => {
    setApproved(false)
  }, [selected?.id, selected?.state])

  function saved(successMessage?: string) {
    if (successMessage) setNotice(successMessage)
    notifyPaymentUpdate()
    void refreshAfterChange()
  }

  async function action(run?: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (run) {
        await run()
        notifyPaymentUpdate()
      }
      await (run ? refreshAfterChange() : refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be checked.')
    } finally {
      setBusy(false)
    }
  }

  const closed = selected && ['Succeeded', 'Failed', 'Cancelled', 'Reversed'].includes(selected.state)

  return (
    <div className="payment-ui payment-page">
      <PageHeader
        eyebrow="Library administration"
        title="Library funds"
        description="Track counter and online collections, manage approved school-bank accounts, and review payouts or refunds."
        action={
          <RefreshButton label="Refresh funds" onRefresh={() => action()} variant="secondary" disabled={busy || refreshing} />
        }
      />

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
      {data?.enabled ? (
        <NoticeBanner tone="info">
          Practice mode — sandbox transfers and test balances only. No real money is moved.
        </NoticeBanner>
      ) : null}
      {!data && !error ? (
        <p role="status" className="p-4 text-sm text-[var(--sl-text-secondary)]">
          Loading library funds…
        </p>
      ) : null}

      {data ? (
        <>
          <LibraryFundsSummary
            data={data}
            busy={busy}
            onAdd={() => setAddition(true)}
            onWithdraw={() => setWithdraw(true)}
            onBank={() => setManageBank(true)}
            onUseSampleBank={() =>
              void action(async () => {
                await moneyOutApi.sampleBank()
                setNotice('Sample school bank added and ready for transfers.')
              })
            }
          />

          <FundsActivity
            operations={data.operations}
            additions={data.practiceTransfers}
            onSelect={row => {
              if (row.local) {
                setSelectedLocal(row.local)
                setAddition(true)
              } else if (row.provider) {
                setSelected(row.provider)
                setProviderId('')
              }
            }}
          />

          <aside className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-4">
            <div>
              <strong className="text-sm font-semibold text-[var(--sl-text-header)]">Need to return a payment?</strong>
              <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                Open its original record. Printing refunds are available only before printing starts.
              </p>
            </div>
            <Link
              className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
              to="/librarian/payments"
            >
              Review payments for refund <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </aside>

          <details className="mt-5 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-5 shadow-[var(--sl-shadow-xs)]">
            <summary className="min-h-9 cursor-pointer text-sm font-semibold text-[var(--sl-text-header)]">
              Collection summary and void history
            </summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Total collections', data.collections.totalCollectionsCentavos],
                ['Online payment amounts', data.totals.appliedPrincipal],
                ['User transaction fees', data.totals.userFees],
                ['Refunded amounts', data.totals.refundedPrincipal],
                ['Refunded fees', data.totals.refundedFees],
                ['Withdrawals', data.totals.withdrawals],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5">
                  <dt className="text-xs font-semibold text-[var(--sl-text-secondary)]">{label}</dt>
                  <dd className="mt-1 text-base font-bold tabular-nums text-[var(--sl-text-header)]">
                    {paymentMoney(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-[var(--sl-text-muted)]">
              Provider costs need confirmed settlement evidence. Bank additions are funding, separate from collections.
            </p>
            {data.voids.map(row => (
              <p className="mt-3 text-xs text-[var(--sl-text)]" key={row.id}>
                Voided unpaid charge · <strong>{paymentMoney(row.amount)}</strong> · {row.reason}
              </p>
            ))}
          </details>

          <details className="mt-5 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-5 shadow-[var(--sl-shadow-xs)]">
            <summary className="min-h-9 cursor-pointer text-sm font-semibold text-[var(--sl-text-header)]">
              Advanced settings
            </summary>
            <h2 className="mt-4 font-display text-base font-semibold text-[var(--sl-text-header)]">Transfer fee</h2>
            <TransferFeeSetup current={data.payoutFeeCentavos} onSaved={() => saved('Provider transfer fee saved.')} />
          </details>
        </>
      ) : null}

      {manageBank && data ? (
        <MoneyOutDialog title="School bank accounts" busy={busy} onClose={() => setManageBank(false)}>
          <SchoolBankManager data={data} onSaved={() => saved('School bank settings updated.')} />
        </MoneyOutDialog>
      ) : null}

      {withdraw && data ? (
        <WithdrawalReview data={data} onClose={() => setWithdraw(false)} onSaved={() => saved('Withdrawal request updated.')} />
      ) : null}

      {addition && data ? (
        <PracticeTransferDialog
          banks={data.beneficiaries}
          bankOptions={data.bankOptions}
          direction={selectedLocal?.direction ?? 'TopUp'}
          selected={selectedLocal}
          legacyWithdrawal={selectedLocal?.direction === 'Withdrawal'}
          available={data.balance?.availableCentavos ?? data.collections.availableCentavos}
          fee={data.payoutFeeCentavos ?? 0}
          onSaved={() => saved('Bank funding entry updated.')}
          onClose={() => {
            setAddition(false)
            setSelectedLocal(null)
          }}
        />
      ) : null}

      {selected ? (
        <MoneyOutDialog
          title={selected.type === 'Refund' ? 'Refund details' : 'Withdrawal details'}
          busy={busy}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-5">
            <div className="flex justify-between gap-3">
              <strong>{moneyOutStatus(selected.state, selected.type)}</strong>
              <span className="payment-muted font-mono text-sm">{selected.reference}</span>
            </div>
            <MoneyOutSummary row={selected} />
            <p className="text-sm">Reason: {selected.reason}</p>
            <ol className="refund-timeline">
              {selected.events.map((event, index) => (
                <li key={index}>
                  <strong>{moneyOutStatus(event.state, selected.type)}</strong>
                  <p className="payment-muted text-sm">
                    {new Date(event.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                  </p>
                </li>
              ))}
            </ol>
            {selected.state === 'Review' && selected.rail === 'Transfer' ? (
              <label className="block text-sm font-semibold">
                Xendit transfer reference, if available
                <input
                  className="payment-field mt-2"
                  placeholder="po-…"
                  value={providerId}
                  onChange={event => setProviderId(event.target.value)}
                />
                <span className="payment-field-note">
                  Use the reference for this request. Do not send another transfer.
                </span>
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {selected.state === 'Draft' ? (
                <>
                  {selected.type === 'Refund' ? (
                    <RefundApproval
                      total={selected.totalCentavos}
                      checked={approved}
                      disabled={busy}
                      onChange={setApproved}
                    />
                  ) : null}
                  <Button
                    className="payment-button"
                    disabled={busy || (selected.type === 'Refund' && !approved)}
                    onClick={() =>
                      void action(async () =>
                        setSelected(
                          await moneyOutApi.confirm(selected.id, selected.type === 'Refund' ? { confirmed: true } : undefined),
                        ),
                      )
                    }
                  >
                    Confirm {selected.type.toLowerCase()}
                  </Button>
                  <Button
                    variant="secondary"
                    className="payment-button"
                    disabled={busy}
                    onClick={() => void action(async () => setSelected(await moneyOutApi.cancel(selected.id)))}
                  >
                    Cancel review
                  </Button>
                </>
              ) : closed ? (
                <Button className="payment-button" onClick={() => setSelected(null)}>
                  Done
                </Button>
              ) : (
                <Button
                  className="payment-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => setSelected(await moneyOutApi.check(selected.id, providerId || undefined)))
                  }
                >
                  <RefreshCw size={16} aria-hidden="true" /> Check status
                </Button>
              )}
            </div>
          </div>
        </MoneyOutDialog>
      ) : null}
    </div>
  )
}

function TransferFeeSetup({ current, onSaved }: { current: number | null; onSaved: () => void }) {
  const [amount, setAmount] = useState(current === null ? '' : (current / 100).toFixed(2))
  const [reference, setReference] = useState('')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) <= 1000
  const validReference = reference.trim().length >= 10

  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await moneyOutApi.setTransferFee(amount, reference)
      setReview(false)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The fee could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 max-w-xl space-y-4">
      <p className="text-xs text-[var(--sl-text-secondary)]">
        Enter the flat transfer fee (from ₱0.00 to ₱1,000.00) confirmed in the library’s Xendit agreement. The library covers this provider cost.
      </p>
      <label className="block text-xs font-semibold text-[var(--sl-text-secondary)]">
        Confirmed fee in pesos
        <input
          className="sl-input mt-1"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          disabled={review}
          onChange={event => setAmount(event.target.value)}
        />
        {amount && !validAmount ? (
          <span className="field-error mt-1 block">Enter a valid peso amount between 0.00 and 1000.00.</span>
        ) : null}
      </label>
      <label className="block text-xs font-semibold text-[var(--sl-text-secondary)]">
        Provider agreement or pricing reference
        <textarea
          className="sl-input mt-1"
          rows={2}
          placeholder="At least 10 characters citing the pricing schedule or contract"
          value={reference}
          disabled={review}
          maxLength={500}
          onChange={event => setReference(event.target.value)}
        />
        {reference && !validReference ? (
          <span className="field-error mt-1 block">Enter at least 10 characters for the agreement reference.</span>
        ) : null}
      </label>
      {review ? (
        <SectionCard className="bg-[var(--sl-bg-subtle)] p-3.5 text-xs text-[var(--sl-text)]">
          Confirm the agreed flat fee of <strong>{paymentMoney(Math.round(Number(amount) * 100))}</strong> for each transfer. Existing reviews must be recreated if their fee changes.
        </SectionCard>
      ) : null}
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      <div className="flex gap-2">
        {review ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(false)}>
            Back
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={busy || !validAmount || !validReference}
          onClick={() => (review ? void save() : setReview(true))}
        >
          {busy ? 'Saving…' : review ? 'Confirm provider fee' : 'Review provider fee'}
        </Button>
      </div>
    </div>
  )
}
