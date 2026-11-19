import { ArrowDownToLine, ArrowUpFromLine, Building2, ShieldCheck } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { type FundsOverview } from './money-out-api'
import { paymentMoney } from './payments-api'

export function LibraryFundsSummary({
  data,
  onAdd,
  onWithdraw,
  onBank,
  busy,
}: {
  data: FundsOverview
  onAdd: () => void
  onWithdraw: () => void
  onBank: () => void
  busy: boolean
}) {
  const bank =
    data.beneficiaries.find(row => row.type === 'SchoolBank' && row.isDefault) ??
    data.beneficiaries.find(row => row.type === 'SchoolBank')
  const available = data.balance?.availableCentavos
  const canWithdraw =
    data.payoutsEnabled &&
    data.payoutFeeCentavos !== null &&
    Boolean(bank) &&
    typeof available === 'number' &&
    available > data.payoutFeeCentavos

  return (
    <section aria-label="Library balances">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-[10px] border border-[#0b5ea2]/25 bg-[#0b5ea2]/5 p-5 shadow-[var(--sl-shadow-xs)] dark:border-white/15 dark:bg-white/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0b5ea2] dark:text-[#93c5fd]">
            Available to withdraw
          </p>
          <strong className="mt-1.5 block font-display text-2xl font-bold tabular-nums text-[var(--sl-text-header)]">
            {typeof available === 'number' ? paymentMoney(available) : 'Unavailable'}
          </strong>
          <p className="mt-2 text-xs text-[var(--sl-text-secondary)]">
            Online collections and bank additions, after transfers, refunds, and holds.
          </p>
        </article>

        <article className="rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-5 shadow-[var(--sl-shadow-xs)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sl-text-secondary)]">
            Online collections
          </p>
          <strong className="mt-1.5 block font-display text-2xl font-bold tabular-nums text-[var(--sl-text-header)]">
            {paymentMoney(data.collections.onlineCollectionsCentavos)}
          </strong>
          <p className="mt-2 text-xs text-[var(--sl-text-secondary)]">
            Confirmed online payments, after refunds.
          </p>
        </article>

        <article className="rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-5 shadow-[var(--sl-shadow-xs)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sl-text-secondary)]">
            Cash collected
          </p>
          <strong className="mt-1.5 block font-display text-2xl font-bold tabular-nums text-[var(--sl-text-header)]">
            {paymentMoney(data.collections.cashCollectedCentavos)}
          </strong>
          <p className="mt-2 text-xs text-[var(--sl-text-secondary)]">
            Received at the counter. Not available for online withdrawal.
          </p>
        </article>
      </div>

      <SectionCard className="mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-[8px] bg-[#0b5ea2]/10 p-2.5 text-[#0b5ea2] dark:bg-white/10 dark:text-[#93c5fd]">
              <Building2 size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">School bank</h2>
              {bank ? (
                <>
                  <p className="mt-0.5 break-words text-sm font-semibold text-[var(--sl-text)]">{bank.label}</p>
                  <p className="text-xs text-[var(--sl-text-secondary)]">
                    {bank.bank} · {bank.account}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[var(--sl-success-text)]">
                    <ShieldCheck size={14} aria-hidden="true" />
                    {bank.isSample ? 'Xendit sample destination' : 'Approved school destination'}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                  Add the approved school bank before withdrawing.
                </p>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onBank}>
            Manage bank
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button disabled={busy || !canWithdraw} onClick={onWithdraw}>
            <ArrowDownToLine size={16} aria-hidden="true" /> Withdraw funds
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onAdd}>
            <ArrowUpFromLine size={16} aria-hidden="true" /> Add funds
          </Button>
        </div>

        {!canWithdraw ? (
          <p className="mt-2.5 text-xs font-medium text-[var(--sl-text-secondary)]">
            {!data.payoutsEnabled
              ? 'Online payouts are not enabled for this environment.'
              : !bank
                ? 'Set up the school bank to enable withdrawals.'
                : data.payoutFeeCentavos === null
                  ? 'Set the transfer fee in Advanced settings first.'
                  : 'No online funds are currently available to withdraw.'}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-[var(--sl-text-muted)]">
          Available funds cannot exceed the Xendit balance. Bank additions are local funding records; they do not create a bank deposit or count as student collections.
        </p>

        <dl className="mt-4 grid gap-3 border-t border-[var(--sl-border)] pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--sl-text-muted)]">Bank additions</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
              {paymentMoney(data.collections.topUpsCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--sl-text-muted)]">Withdrawals and fees</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
              {paymentMoney(data.collections.providerWithdrawalsCentavos ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--sl-text-muted)]">Reserved for requests</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sl-text-header)]">
              {paymentMoney(data.balance?.reservedCentavos ?? 0)}
            </dd>
          </div>
        </dl>
      </SectionCard>
    </section>
  )
}
