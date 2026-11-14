import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../../components/ui'
import { moneyOutApi, moneyOutStatus, type FundsOverview, type MoneyOutRecord } from './money-out-api'
import { MoneyOutDialog, MoneyOutSummary } from './RefundReview'
import { paymentMoney } from './payments-api'

export function WithdrawalReview({ data, onClose, onSaved }: { data: FundsOverview; onClose: () => void; onSaved: () => void }) {
  const banks = data.beneficiaries.filter(value => value.type === 'SchoolBank')
  const [bank, setBank] = useState(banks[0]?.id ?? ''), [amount, setAmount] = useState(''), [reason, setReason] = useState('')
  const [row, setRow] = useState<MoneyOutRecord | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const key = useRef(crypto.randomUUID()), sending = useRef(false)
  const amountNote = useId()
  useEffect(() => {
    setRow(current => {
      const latest = data.operations.find(value => value.id === current?.id)
      return current && latest && latest.events.length >= current.events.length ? latest : current
    })
  }, [data.operations])
  async function close() {
    if (sending.current) return
    sending.current = true; setBusy(true)
    try { if (row?.state === 'Draft') await moneyOutApi.cancel(row.id); onSaved(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Cancel the review first.') }
    finally { sending.current = false; setBusy(false) }
  }
  async function submit() {
    if (sending.current) return
    sending.current = true; setBusy(true); setError('')
    try {
      setRow(row ? await moneyOutApi.confirm(row.id) : await moneyOutApi.withdrawal({ beneficiaryId: bank, amount, reason, requestKey: key.current }))
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The withdrawal could not be prepared.') }
    finally { sending.current = false; setBusy(false) }
  }
  return <MoneyOutDialog title="Withdraw to school bank" busy={busy} onClose={() => void close()}><div className="space-y-5">
    {row ? <>
      <h3 className="text-lg font-bold">{row.state === 'Draft' ? 'Review before sending' : moneyOutStatus(row.state, row.type)}</h3>
      <MoneyOutSummary row={row}/><p className="break-words">Purpose: {row.reason}</p>
      {row.providerReference ? <p className="payment-muted break-all text-sm">Xendit reference: <span>{row.providerReference}</span></p> : null}
      {row.state === 'Draft' ? <Button className="payment-button w-full" disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : 'Confirm withdrawal'}</Button> : <>
        <p role="status" className="payment-muted text-sm">{row.state === 'Succeeded' ? 'Xendit confirmed the school-bank transfer.'
          : row.state === 'Review' ? 'Confirmation is delayed. This request stays reserved while its result is checked. Do not send another transfer.'
          : row.state === 'Failed' ? 'Xendit could not complete this transfer. The reserved amount is available again.'
          : row.state === 'Reversed' ? 'Xendit reversed this transfer. The balance has been updated.'
          : row.state === 'Cancelled' ? 'This review was cancelled. No transfer was sent.'
          : 'Xendit is processing the transfer. Status updates automatically while this page is open.'}</p>
        <Button className="payment-button" disabled={busy} onClick={() => void close()}>Done</Button>
      </>}
    </> : <>
      <p className="payment-muted">Withdraw online collections and confirmed bank additions through Xendit to the school bank. Cash collected at the counter stays separate.</p>
      {banks.length === 1 ? <div className="funds-bank"><p className="payment-muted text-sm">To school bank</p><strong>{banks[0].label}</strong><p className="payment-muted text-sm">{banks[0].bank} · {banks[0].account}</p></div> : <label className="block font-semibold">School bank<select className="payment-field mt-2" value={bank} onChange={event => setBank(event.target.value)}>{banks.map(value => <option key={value.id} value={value.id}>{value.label} · {value.account}</option>)}</select></label>}
      <label className="block font-semibold">Amount in pesos<input className="payment-field mt-2" inputMode="decimal" aria-describedby={amountNote} value={amount} onChange={event => setAmount(event.target.value)}/></label>
      <p id={amountNote} className="payment-field-note">Available: {paymentMoney(data.balance?.availableCentavos ?? 0)}. Transfer fee: {paymentMoney(data.payoutFeeCentavos ?? 0)}.</p>
      {data.payoutFeeIsSample ? <p className="payment-field-note">The ₱5 transfer fee is the approved practice rate, not a confirmed provider charge.</p> : null}
      <label className="block font-semibold">Purpose<textarea className="payment-field mt-2" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label>
      {Number(amount) > 0 && Math.round(Number(amount) * 100) + (data.payoutFeeCentavos ?? 0) > (data.balance?.availableCentavos ?? 0) ? <p role="alert" className="payment-error">Amount plus transfer fee exceeds available funds.</p> : null}
      <Button className="payment-button w-full" disabled={busy || !bank || reason.trim().length < 10 || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Math.round(Number(amount) * 100) + (data.payoutFeeCentavos ?? 0) > (data.balance?.availableCentavos ?? 0)} onClick={() => void submit()}>{busy ? 'Preparing…' : 'Review withdrawal'}<ArrowRight size={16}/></Button>
    </>}
    {error ? <p role="alert" className="payment-error">{error}</p> : null}
  </div></MoneyOutDialog>
}
