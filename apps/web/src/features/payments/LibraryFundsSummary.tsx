import { ArrowDownToLine, ArrowUpFromLine, Building2, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui'
import { type FundsOverview } from './money-out-api'
import { paymentMoney } from './payments-api'

export function LibraryFundsSummary({ data, onAdd, onWithdraw, onBank, busy }: { data: FundsOverview; onAdd: () => void; onWithdraw: () => void; onBank: () => void; busy: boolean }) {
  const bank = data.beneficiaries.find(row => row.type === 'SchoolBank')
  const available = data.balance?.availableCentavos
  const canWithdraw = data.payoutsEnabled && data.payoutFeeCentavos !== null && Boolean(bank) && typeof available === 'number' && available > data.payoutFeeCentavos
  return <section aria-label="Library balances">
    <div className="funds-metrics"><article className="funds-available payment-surface p-6"><p className="text-sm font-semibold">Available to withdraw</p><strong className="mt-2 block text-3xl tabular-nums">{typeof available === 'number' ? paymentMoney(available) : 'Unavailable'}</strong><p className="mt-3 text-sm">Online collections and bank additions, after transfers, refunds and holds.</p></article>
      <article className="payment-surface p-6"><p className="payment-muted text-sm font-semibold">Online collections</p><strong className="my-2 block text-2xl tabular-nums">{paymentMoney(data.collections.onlineCollectionsCentavos)}</strong><p className="payment-muted text-sm">Confirmed online payments, after refunds.</p></article>
      <article className="payment-surface p-6"><p className="payment-muted text-sm font-semibold">Cash collected</p><strong className="my-2 block text-2xl tabular-nums">{paymentMoney(data.collections.cashCollectedCentavos)}</strong><p className="payment-muted text-sm">Received at the counter. Not available for online withdrawal.</p></article>
    </div>
    <section className="payment-surface mt-5 p-5 sm:p-6" aria-label="School bank transfers"><div className="funds-bank-heading"><div className="flex min-w-0 items-start gap-3"><span className="payment-service-icon"><Building2 size={23}/></span><div className="min-w-0"><h2 className="text-lg font-bold">School bank</h2>{bank ? <><p className="mt-1 break-words font-semibold">{bank.label}</p><p className="payment-muted text-sm">{bank.bank} · {bank.account}</p><p className="payment-field-note flex items-center gap-2"><ShieldCheck size={15}/>{bank.isSample ? 'Xendit sample destination' : 'Approved school destination'}</p></> : <p className="payment-muted mt-1">Add the approved school bank before withdrawing.</p>}</div></div><Button className="payment-button" variant="secondary" disabled={busy} onClick={onBank}>Manage bank</Button></div>
      <div className="mt-6 flex flex-wrap gap-3"><Button className="payment-button" disabled={busy || !canWithdraw} onClick={onWithdraw}><ArrowDownToLine size={18}/>Withdraw funds</Button><Button variant="secondary" className="payment-button" disabled={busy} onClick={onAdd}><ArrowUpFromLine size={18}/>Add funds</Button></div>
      {!canWithdraw ? <p className="payment-field-note mt-3">{!bank ? 'Set up the school bank to enable withdrawals.' : data.payoutFeeCentavos === null ? 'Set the transfer fee in Advanced settings first.' : 'No online funds are currently available to withdraw.'}</p> : null}
      <p className="payment-field-note mt-4">Available funds cannot exceed the Xendit balance. Bank additions are local funding records; they do not create a bank deposit or count as student collections.</p>
      <dl className="funds-bank-totals"><div><dt>Bank additions</dt><dd>{paymentMoney(data.collections.topUpsCentavos)}</dd></div><div><dt>Withdrawals and fees</dt><dd>{paymentMoney(data.collections.providerWithdrawalsCentavos ?? 0)}</dd></div><div><dt>Reserved for requests</dt><dd>{paymentMoney(data.balance?.reservedCentavos ?? 0)}</dd></div></dl>
    </section>
  </section>
}
