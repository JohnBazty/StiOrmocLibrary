import { useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Building2, Download, Wallet } from 'lucide-react'
import { Button } from '../../components/ui'
import { moneyOutApi, type FundsCollections, type PracticeTransfer } from './money-out-api'
import { MoneyOutDialog } from './RefundReview'
import { paymentMoney } from './payments-api'

const dateLabel = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
const stateLabel = (state: string) => state === 'Draft' ? 'Awaiting confirmation' : state === 'Succeeded' ? 'Completed' : 'Cancelled'

export function PracticeBankTransfers({ collections, rows, onSaved, onWithdraw, withdrawable, withdrawalEnabled }: {
  collections: FundsCollections; rows: PracticeTransfer[]; onSaved: () => void
  onWithdraw?:()=>void; withdrawable?:number|null; withdrawalEnabled?:boolean
}) {
  const [direction, setDirection] = useState<'Withdrawal' | 'TopUp' | null>(null)
  const [selected, setSelected] = useState<PracticeTransfer | null>(null)
  const [filter, setFilter] = useState('All')
  const metrics = [
    ['Total collections', collections.totalCollectionsCentavos, 'Confirmed online payments and counter cash, after refunds.'],
    ['Online collections', collections.onlineCollectionsCentavos, 'Confirmed online payments, after online refunds.'],
    ['Cash collected', collections.cashCollectedCentavos, 'Received at the counter. Excluded from online withdrawals.'],
    [onWithdraw?'Available to withdraw':'Available online funds', onWithdraw?(withdrawable??null):collections.availableCentavos, onWithdraw?'Online collections and confirmed bank additions, within the available Xendit balance.':'Online funds and bank additions, less transfers, fees and reservations.'],
  ] as const
  const visible = rows.filter(row => filter === 'All' || row.direction === filter)
  function exportRecords() {
    const cell = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""') + '"'
    const records = [['Reference', 'Type', 'Status', 'Amount PHP', 'Fee PHP', 'Total PHP', 'Purpose', 'Date (Asia/Manila)', 'Mode'],
      ...rows.map(row => [row.reference, row.direction === 'TopUp' ? 'Bank addition' : 'Withdrawal', stateLabel(row.state),
        (row.amountCentavos / 100).toFixed(2), (row.feeCentavos / 100).toFixed(2), (row.totalCentavos / 100).toFixed(2), row.reason, dateLabel(row.createdAt), 'Practice'])]
    const url = URL.createObjectURL(new Blob(['\ufeff' + records.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'library-bank-transfers.csv'; link.click(); URL.revokeObjectURL(url)
  }
  return <section aria-label="Library collections and bank transfers" className="mb-7">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value, note]) => <article key={label} className="payment-surface p-5">
        <p className="payment-muted text-sm font-semibold">{label}</p>
        <p className="my-2 text-2xl font-bold tabular-nums">{typeof value==='number'?paymentMoney(value):'Unavailable'}</p>
        <p className="payment-muted text-sm">{note}</p>
      </article>)}
    </div>
    <div className="payment-surface mt-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-3"><span className="payment-service-icon"><Building2 size={23}/></span>
          <div><h2 className="text-lg font-bold">School bank transfers</h2>
            <p className="payment-muted mt-1 max-w-xl">Withdraw online funds or add funds from the school bank.</p>
            <p className="payment-field-note mt-2">{onWithdraw?'Withdraw online collections and confirmed bank additions through Xendit. Cash stays separate.':'Practice transfers change this local balance only. No bank money moves.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" className="payment-button" onClick={() => setDirection('TopUp')}><ArrowUpFromLine size={17}/>Add funds</Button>
          <Button className="payment-button" disabled={onWithdraw?(!withdrawalEnabled||!withdrawable):collections.availableCentavos <= collections.withdrawalFeeCentavos} onClick={() => onWithdraw?onWithdraw():setDirection('Withdrawal')}><ArrowDownToLine size={17}/>Withdraw funds</Button>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-current/10 pt-5 sm:grid-cols-3">
        {([['Bank additions', collections.topUpsCentavos], [onWithdraw?'Xendit withdrawals and transfer fees':'Withdrawals and transfer fees', onWithdraw?(collections.providerWithdrawalsCentavos??0):collections.withdrawalsCentavos], ['Reserved for open requests', collections.reservedCentavos]] as const).map(([label, value]) =>
          <div key={label}><dt className="payment-muted text-sm">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{paymentMoney(value)}</dd></div>)}
      </dl>
      <p className="payment-field-note mt-4">Bank additions are funding, not student collections. Cash is recorded through the printing or fine payment screen.</p>
    </div>
    <section className="payment-surface mt-5 overflow-hidden" aria-label={onWithdraw?'Previous local records':'Bank transfer history'}>
      <div className="payment-toolbar"><div role="group" aria-label="Bank transfer filter" className="payment-filters">
        {(['All', 'Withdrawal', 'TopUp'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'All' ? 'All bank transfers' : value === 'Withdrawal' ? 'Withdrawals' : 'Additions'}</button>)}
      </div><Button variant="secondary" className="payment-button" onClick={exportRecords} disabled={!rows.length}><Download size={16}/>Export transfers</Button></div>
      {visible.length ? visible.map(row => <article className="payment-row" key={row.id}>
        <div className="payment-row-main"><span className="payment-service-icon">{row.direction === 'TopUp' ? <ArrowUpFromLine size={21}/> : <ArrowDownToLine size={21}/>}</span>
          <div className="min-w-0"><h3>{row.direction === 'TopUp' ? 'Funds added from school bank' : onWithdraw?'Previous local withdrawal':'Withdrawal to school bank'}</h3>
            <p className="payment-row-meta">{row.reference} · {dateLabel(row.createdAt)}</p>
            <span className={'payment-chip ' + (row.state === 'Succeeded' ? 'payment-chip-success' : '')}>{onWithdraw&&row.direction==='Withdrawal'&&row.state==='Succeeded'?'Recorded locally':stateLabel(row.state)}</span>
          </div><strong className="payment-row-amount">{paymentMoney(row.amountCentavos)}</strong>
        </div>{onWithdraw&&row.direction==='Withdrawal'?<p className="payment-field-note mt-3">This earlier local entry did not send a Xendit transfer.</p>:null}<div className="payment-row-footer"><p className="payment-muted text-sm break-words">{row.reason}</p>
          <Button variant="secondary" className="payment-button" onClick={() => { setSelected(row); setDirection(row.direction) }}>{row.state === 'Draft' ? 'Review transfer' : 'View transfer'}</Button></div>
      </article>) : <div className="payment-empty"><Wallet size={26}/><h3 className="text-lg font-semibold">No bank transfers yet</h3><p className="payment-muted">Confirmed additions and withdrawals stay here for your records.</p></div>}
    </section>
    {direction ? <PracticeTransferDialog direction={direction} selected={selected} available={collections.availableCentavos}
      fee={collections.withdrawalFeeCentavos} legacyWithdrawal={Boolean(onWithdraw)&&direction==='Withdrawal'} onSaved={onSaved} onClose={() => { setSelected(null); setDirection(null) }}/> : null}
  </section>
}

export function PracticeTransferDialog({ direction, selected, available, fee, legacyWithdrawal, onSaved, onClose }: {
  direction: 'Withdrawal' | 'TopUp'; selected: PracticeTransfer | null; available: number; fee: number; onSaved: () => void; onClose: () => void
  legacyWithdrawal?:boolean
}) {
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [row, setRow] = useState(selected)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const key = useRef(crypto.randomUUID()), sending = useRef(false)
  const withdrawal = direction === 'Withdrawal', noun = withdrawal ? 'withdrawal' : 'addition'
  async function run() {
    if (sending.current) return
    sending.current = true; setBusy(true); setError('')
    try {
      const result = row ? await moneyOutApi.confirmPractice(row.id) : await moneyOutApi.draftPractice({ direction, amount, reason, requestKey: key.current })
      setRow(result); onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This transfer could not be saved. Please try again.') }
    finally { sending.current = false; setBusy(false) }
  }
  async function close() {
    if (sending.current) return
    sending.current = true; setBusy(true)
    try { if (row?.state === 'Draft') await moneyOutApi.cancelPractice(row.id); onSaved(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Cancel this review before closing.') }
    finally { sending.current = false; setBusy(false) }
  }
  const valid = /^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && reason.trim().length >= 10
  return <MoneyOutDialog title={legacyWithdrawal?'Previous local withdrawal':withdrawal ? 'Withdraw to school bank' : 'Add funds from school bank'} busy={busy} onClose={() => void close()}>
    <div className="space-y-5">
      <p className="payment-field-note">Practice bank transfer. Cash collections and student bills stay unchanged.</p>
      {row ? <>
        <h3 className="text-lg font-bold">{row.state === 'Succeeded' ? legacyWithdrawal?'Recorded locally':withdrawal ? 'Withdrawal completed' : 'Funds added' : stateLabel(row.state)}</h3>
        <p className="payment-muted text-sm">{row.reference} · {row.destination}</p>
        <dl className="payment-summary space-y-3">
          <div className="flex justify-between gap-4"><dt>Amount {withdrawal ? 'to school bank' : 'from school bank'}</dt><dd className="font-semibold">{paymentMoney(row.amountCentavos)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Transfer fee</dt><dd>{paymentMoney(row.feeCentavos)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-current/10 pt-3 font-bold"><dt>{withdrawal ? 'Total deducted' : 'Added to online funds'}</dt><dd>{paymentMoney(row.totalCentavos)}</dd></div>
          {row.balanceAfterCentavos !== undefined && row.state !== 'Cancelled' ? <div className="flex justify-between gap-4"><dt>{row.state === 'Draft' ? 'Expected online balance' : 'Online balance after transfer'}</dt><dd>{paymentMoney(row.balanceAfterCentavos)}</dd></div> : null}
        </dl><p className="break-words text-sm">Purpose: {row.reason}</p>
        {row.state === 'Draft' && !legacyWithdrawal ? <><p className="payment-muted text-sm">Review these details. The online balance will be checked again when you confirm.</p><Button className="payment-button w-full" disabled={busy} onClick={() => void run()}>{busy ? 'Saving…' : 'Confirm ' + noun}</Button></> : <Button className="payment-button" disabled={busy} onClick={() => void close()}>{legacyWithdrawal&&row.state==='Draft'?'Cancel old review':'Done'}</Button>}
        {row.events.length ? <ol className="refund-timeline">{row.events.map((event, index) => <li key={index}><strong>{stateLabel(event.state)}</strong><p className="payment-muted text-sm">{dateLabel(event.at)}</p></li>)}</ol> : null}
      </> : <>
        <p className="payment-muted">{withdrawal ? 'Only available online funds can be withdrawn. Cash collected at the library is excluded.' : 'Confirmed school-bank funding becomes available for withdrawal, within the available Xendit balance. It does not count as a student payment or revenue.'}</p>
        <label className="block font-semibold">Amount in pesos<input className="payment-field mt-2" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)}/></label>
        <p className="payment-field-note">Available online: {paymentMoney(available)}. Transfer fee: {paymentMoney(withdrawal ? fee : 0)}.</p>
        <label className="block font-semibold">Purpose<textarea className="payment-field mt-2" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label>
        <Button className="payment-button w-full" disabled={busy || !valid} onClick={() => void run()}>{busy ? 'Preparing…' : 'Review ' + noun}</Button>
      </>}
      {error ? <p role="alert" className="payment-error">{error}</p> : null}
    </div>
  </MoneyOutDialog>
}
