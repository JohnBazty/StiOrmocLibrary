import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck, Wallet } from 'lucide-react'
import { Button } from '../../components/ui'
import { paymentMoney, type Payment } from './payments-api'

type Step = 'number' | 'pin' | 'review'
const mobileNumber = (value:string) => {
  const digits=value.replace(/\D/g,'')
  return digits.startsWith('63') ? '0'+digits.slice(2) : digits.startsWith('9') ? '0'+digits : digits
}

/** Assigned library wallet fixtures only; actual GCash credentials belong on the provider's page. */
export function DemoWalletCheckout({ payment, accounts, busy, error, onPay, onBack, onClose }: {
  payment: Payment; accounts: Array<{ number: string; pin: string }>; busy: boolean; error: string
  onPay: (number: string, pin: string) => void; onBack: () => void; onClose: () => void
}) {
  const id=useId(), [number,setNumber]=useState(''), [pin,setPin]=useState('')
  const [step,setStep]=useState<Step>('number'), [visible,setVisible]=useState(false), [hint,setHint]=useState(''), [sent,setSent]=useState(false)
  const submitting=useRef(false), field=useRef<HTMLInputElement>(null), heading=useRef<HTMLHeadingElement>(null)
  const selected=accounts.find(row=>row.number===mobileNumber(number)), locked=busy||sent
  useEffect(()=>{if(step==='review')heading.current?.focus({preventScroll:true});else field.current?.focus({preventScroll:true})},[step])
  useEffect(()=>{if(error){submitting.current=false;setSent(false);setPin('');setVisible(false);setStep('pin')}},[error])
  function back(){
    if(locked)return
    setPin('');setVisible(false);setHint('')
    if(step==='number')onBack();else setStep(step==='review'?'pin':'number')
  }
  function submit(event:FormEvent){
    event.preventDefault()
    if(locked||submitting.current)return
    setHint('')
    if(!selected){setHint('Enter a valid mobile number and try again.');return}
    if(step==='number'){setStep('pin');return}
    if(!/^\d{4}$/.test(pin)||pin!==selected.pin){setHint('PIN does not match this library wallet. Please try again.');return}
    if(step==='pin'){setVisible(false);setStep('review');return}
    submitting.current=true;setSent(true)
    const value=pin;setPin('');onPay(selected.number,value)
  }
  const title=step==='number'?'Enter mobile number':step==='pin'?'Enter PIN':'Confirm payment'
  return <form className="wallet-checkout-card payment-surface" onSubmit={submit} autoComplete="off" aria-busy={locked}>
    <div className="wallet-merchant"><span className="payment-service-icon"><Wallet size={24} aria-hidden="true"/></span><div><p className="payment-muted text-sm">Payment to</p><p className="font-bold">STI College Ormoc Library</p></div><strong className="wallet-merchant-amount">{paymentMoney(payment.totalCentavos)}</strong></div>
    <div className="wallet-checkout-content" data-step={step}>
      <ol className="wallet-progress" aria-label="Payment steps">{(['number','pin','review'] as const).map((value,index)=><li key={value} aria-current={step===value?'step':undefined}><span aria-hidden="true">{index+1}</span>{['Number','PIN','Review'][index]}</li>)}</ol>
      <h1 ref={heading} tabIndex={-1}>{title}</h1>
      <p className="payment-muted text-sm leading-6">{step==='number'?'Enter your mobile number.':step==='pin'?'Enter your four-digit PIN to continue.':'Check the amount before continuing to secure payment.'}</p>
      {step==='number'?<div className="wallet-number-field"><span aria-hidden="true">+63</span><label className="min-w-0 flex-1"><span className="sr-only">Mobile number</span><input ref={field} id={id+'-number'} type="tel" inputMode="tel" autoComplete="off" placeholder="Mobile number" maxLength={16} value={number} disabled={locked} onChange={event=>{setNumber(event.target.value.replace(/[^\d+ ]/g,''));setHint('')}}/></label></div>:<>
        <div className="wallet-selected-number"><span className="payment-muted text-sm">Mobile number</span><strong className="tabular-nums">+63 {mobileNumber(number).slice(1)}</strong></div>
        {step==='pin'?<div className="wallet-pin-panel">
          <label htmlFor={id+'-pin'} className="sr-only">PIN</label>
          <div className="wallet-pin-entry"><div className="wallet-pin-digits">
            <input ref={field} id={id+'-pin'} aria-label="PIN" className="wallet-pin-input" type={visible?'text':'password'} inputMode="numeric" autoComplete="off" maxLength={4} value={pin} disabled={locked} onChange={event=>{setPin(event.target.value.replace(/\D/g,'').slice(0,4));setHint('')}}/>
            <div className="wallet-pin-circles" aria-hidden="true">{Array.from({length:4},(_,index)=><span key={index} className="wallet-pin-circle" data-filled={Boolean(pin[index])} data-current={index===pin.length}>{visible?pin[index]:''}</span>)}</div>
          </div></div>
          <button type="button" className="wallet-pin-visibility" disabled={locked} aria-label={visible?'Hide PIN':'Show PIN'} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}<span>{visible?'Hide PIN':'Show PIN'}</span></button>
        </div>:<dl className="wallet-review"><div><dt>Payment amount</dt><dd>{paymentMoney(payment.principalCentavos)}</dd></div><div><dt>Transaction fee</dt><dd>{paymentMoney(payment.feeCentavos)}</dd></div><div className="wallet-review-total"><dt>Total to pay</dt><dd>{paymentMoney(payment.totalCentavos)}</dd></div></dl>}
      </>}
      {error||hint?<p role="alert" className="payment-error">{hint||error}</p>:null}
      <div className="wallet-checkout-actions">
        <Button className="payment-button wallet-primary-action" type="submit" disabled={locked||!number||step==='pin'&&pin.length!==4}><span>{locked?'Opening payment…':step==='number'?'Next':step==='pin'?'Review payment':'Pay '+paymentMoney(payment.totalCentavos)}</span><ArrowRight size={17} aria-hidden="true"/></Button>
        <p className="payment-trust-note"><ShieldCheck size={16} aria-hidden="true"/>Secure checkout through Xendit.</p>
        <div className="wallet-secondary-actions">
          <Button className="payment-button" type="button" variant="ghost" disabled={locked} onClick={back}><ArrowLeft size={17} aria-hidden="true"/>Back</Button>
          <button type="button" className="wallet-cancel" disabled={locked} onClick={onClose}>Cancel payment</button>
        </div>
      </div>
      {step==='number'?<details className="payment-optional"><summary>Assigned library wallets</summary><p>These credentials work only in this library flow. Never enter your personal GCash PIN here.</p><table className="wallet-accounts"><caption className="sr-only">Assigned numbers and PINs</caption><thead><tr><th>Mobile number</th><th>PIN</th></tr></thead><tbody>{accounts.map(row=><tr key={row.number}><td>{row.number}</td><td>{row.pin}</td></tr>)}</tbody></table></details>:null}
    </div>
  </form>
}
