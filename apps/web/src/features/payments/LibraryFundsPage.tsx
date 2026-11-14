import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import { moneyOutApi, moneyOutStatus, type MoneyOutRecord, type PracticeTransfer } from './money-out-api'
import { DestinationForm, MoneyOutDialog, MoneyOutSummary } from './RefundReview'
import { PracticeTransferDialog } from './PracticeBankTransfers'
import { LibraryFundsSummary } from './LibraryFundsSummary'
import { FundsActivity } from './FundsActivity'
import { WithdrawalReview } from './WithdrawalReview'
import { useLibraryFunds } from './useLibraryFunds'
import { paymentMoney } from './payments-api'
import './payments.css'

export function LibraryFundsPage() {
  const { data, error, setError, refreshing, refresh, refreshAfterChange } = useLibraryFunds()
  const [busy, setBusy] = useState(false), [manageBank, setManageBank] = useState(false), [addBank, setAddBank] = useState(false)
  const [withdraw, setWithdraw] = useState(false), [addition, setAddition] = useState(false)
  const [selectedLocal, setSelectedLocal] = useState<PracticeTransfer | null>(null)
  const [selected, setSelected] = useState<MoneyOutRecord | null>(null), [providerId, setProviderId] = useState('')
  useEffect(() => { if (data) setSelected(current => current ? data.operations.find(row => row.id === current.id) ?? current : null) }, [data])
  function saved() { window.dispatchEvent(new Event('library-payments-updated')); void refreshAfterChange() }
  async function action(run?: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError('')
    try { if (run) { await run(); window.dispatchEvent(new Event('library-payments-updated')) }; await (run ? refreshAfterChange() : refresh()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be checked.') }
    finally { setBusy(false) }
  }
  const closed = selected && ['Succeeded', 'Failed', 'Cancelled', 'Reversed'].includes(selected.state)
  return <div className="payment-ui payment-page">
    <header className="payment-page-header"><div><p className="payment-eyebrow">Library administration</p><h1>Library funds</h1><p>Keep track of collections and school-bank transfers.</p></div><Button variant="secondary" className="payment-button" disabled={busy || refreshing} onClick={() => void action()}><RefreshCw size={17}/>Refresh funds</Button></header>
    {error ? <p role="alert" className="payment-error mb-5">{error}</p> : null}
    {!data && !error ? <p role="status">Loading library funds…</p> : null}
    {data ? <>
      <LibraryFundsSummary data={data} busy={busy} onAdd={() => setAddition(true)} onWithdraw={() => setWithdraw(true)} onBank={() => setManageBank(true)}/>
      <FundsActivity operations={data.operations} additions={data.practiceTransfers} onSelect={row => { if (row.local) { setSelectedLocal(row.local); setAddition(true) } else if (row.provider) { setSelected(row.provider); setProviderId('') } }}/>
      <aside className="funds-refund-link"><div><strong>Need to return a payment?</strong><p className="payment-muted text-sm">Open its original record. Printing refunds are available only before printing starts.</p></div><Link className="payment-link" to="/librarian/payments">Open online payments<ArrowRight size={17}/></Link></aside>
      <details className="payment-surface mt-6 p-5"><summary className="min-h-11 cursor-pointer font-semibold">Collection summary and void history</summary><dl className="funds-metrics mt-4">{[['Total collections', data.collections.totalCollectionsCentavos], ['Online payment amounts', data.totals.appliedPrincipal], ['User transaction fees', data.totals.userFees], ['Refunded amounts', data.totals.refundedPrincipal], ['Refunded fees', data.totals.refundedFees], ['Withdrawals', data.totals.withdrawals]].map(([label, value]) => <div key={String(label)}><dt className="payment-muted text-sm">{label}</dt><dd className="mt-1 font-bold">{paymentMoney(Number(value))}</dd></div>)}</dl><p className="payment-muted text-sm">Provider costs need confirmed settlement evidence. Bank additions are funding, separate from collections.</p>{data.voids.map(row => <p className="mt-4 text-sm" key={row.id}>Voided unpaid charge · {paymentMoney(row.amount)} · {row.reason}</p>)}</details>
      <details className="payment-surface mt-6 p-5"><summary className="min-h-11 cursor-pointer font-semibold">Advanced settings</summary><h2 className="mt-4 font-bold">Transfer fee</h2><TransferFeeSetup current={data.payoutFeeCentavos} onSaved={saved}/></details>
    </> : null}
    {manageBank && data ? <MoneyOutDialog title="School bank accounts" busy={busy} onClose={() => setManageBank(false)}><div className="space-y-5">{data.beneficiaries.filter(row => row.type === 'SchoolBank').map(row => <div className="funds-bank" key={row.id}><strong>{row.label}</strong><p className="payment-muted text-sm">{row.name} · {row.bank} · {row.account}</p><p className="payment-field-note">{row.isSample ? 'Xendit sample destination' : 'Approved school destination'}</p></div>)}<Button variant="secondary" className="payment-button" disabled={busy} onClick={() => { setManageBank(false); setAddBank(true) }}>Add school bank</Button>{!data.beneficiaries.some(row => row.isSample) ? <Button variant="secondary" className="payment-button" disabled={busy} onClick={() => void action(() => moneyOutApi.sampleBank())}>Use Xendit sample bank</Button> : null}{data.setupMessage ? <p className="payment-field-note">{data.setupMessage}</p> : null}</div></MoneyOutDialog> : null}
    {addBank ? <MoneyOutDialog title="Approved school bank" busy={false} onClose={() => setAddBank(false)}><DestinationForm onSaved={() => { setAddBank(false); saved() }} onCancel={() => setAddBank(false)}/></MoneyOutDialog> : null}
    {withdraw && data ? <WithdrawalReview data={data} onClose={() => setWithdraw(false)} onSaved={saved}/> : null}
    {addition && data ? <PracticeTransferDialog direction={selectedLocal?.direction ?? 'TopUp'} selected={selectedLocal} legacyWithdrawal={selectedLocal?.direction === 'Withdrawal'} available={data.balance?.availableCentavos ?? 0} fee={data.payoutFeeCentavos ?? 0} onSaved={saved} onClose={() => { setAddition(false); setSelectedLocal(null) }}/> : null}
    {selected ? <MoneyOutDialog title={selected.type === 'Refund' ? 'Refund details' : 'Withdrawal details'} busy={busy} onClose={() => setSelected(null)}><div className="space-y-5"><div className="flex justify-between gap-3"><strong>{moneyOutStatus(selected.state, selected.type)}</strong><span className="payment-muted text-sm">{selected.reference}</span></div><MoneyOutSummary row={selected}/><p className="text-sm">Reason: {selected.reason}</p><ol className="refund-timeline">{selected.events.map((event, index) => <li key={index}><strong>{moneyOutStatus(event.state, selected.type)}</strong><p className="payment-muted text-sm">{new Date(event.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p></li>)}</ol>
      {selected.state === 'Review' && selected.rail === 'Transfer' ? <label className="block text-sm font-semibold">Xendit transfer reference, if available<input className="payment-field mt-2" placeholder="po-…" value={providerId} onChange={event => setProviderId(event.target.value)}/><span className="payment-field-note">Use the reference for this request. Do not send another transfer.</span></label> : null}
      <div className="flex flex-wrap gap-2">{selected.state === 'Draft' ? <><Button className="payment-button" disabled={busy} onClick={() => void action(async () => setSelected(await moneyOutApi.confirm(selected.id)))}>Confirm {selected.type.toLowerCase()}</Button><Button variant="secondary" className="payment-button" disabled={busy} onClick={() => void action(async () => setSelected(await moneyOutApi.cancel(selected.id)))}>Cancel review</Button></> : closed ? <Button className="payment-button" onClick={() => setSelected(null)}>Done</Button> : <Button className="payment-button" disabled={busy} onClick={() => void action(async () => setSelected(await moneyOutApi.check(selected.id, providerId || undefined)))}><RefreshCw size={16}/>Check status</Button>}</div></div></MoneyOutDialog> : null}
  </div>
}

function TransferFeeSetup({current,onSaved}:{current:number|null;onSaved:()=>void}) {
  const [amount,setAmount]=useState(current===null?'':(current/100).toFixed(2)),[reference,setReference]=useState(''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(){if(busy)return;setBusy(true);try{await moneyOutApi.setTransferFee(amount,reference);setReview(false);onSaved()}catch(cause){setError(cause instanceof Error?cause.message:'The fee could not be saved.')}finally{setBusy(false)}}
  return <div className="mt-5 max-w-xl space-y-4"><p className="payment-muted text-sm">Enter the flat transfer fee confirmed in the library’s Xendit agreement. The library covers this provider cost. Leave it unset if the rate is unknown or varies by destination.</p><label className="block text-sm font-semibold">Confirmed fee in pesos<input className="payment-field mt-2" inputMode="decimal" value={amount} disabled={review} onChange={event=>setAmount(event.target.value)}/></label><label className="block text-sm font-semibold">Provider agreement or pricing reference<textarea className="payment-field mt-2" rows={2} value={reference} disabled={review} maxLength={500} onChange={event=>setReference(event.target.value)}/></label>{review?<p className="payment-summary">Confirm the agreed flat fee of <strong>{paymentMoney(Math.round(Number(amount)*100))}</strong> for each transfer. Existing reviews must be recreated if their fee changes.</p>:null}{error?<p role="alert" className="payment-error">{error}</p>:null}<div className="flex gap-3">{review?<Button variant="secondary" className="payment-button" disabled={busy} onClick={()=>setReview(false)}>Back</Button>:null}<Button className="payment-button" disabled={busy||!/^\d+(\.\d{1,2})?$/.test(amount)||reference.trim().length<10} onClick={()=>review?void save():setReview(true)}>{busy?'Saving…':review?'Confirm provider fee':'Review provider fee'}</Button></div></div>
}

