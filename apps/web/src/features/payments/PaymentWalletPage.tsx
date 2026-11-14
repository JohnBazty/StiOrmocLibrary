import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LibraryBig, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { SessionActivity } from '../auth/SessionActivity'
import { DemoWalletCheckout } from './DemoWalletCheckout'
import { openPaymentReviewResult, paymentResultPath } from './payment-navigation'
import { paymentsApi, type Payment, type PaymentOptions } from './payments-api'
import './payments.css'

const readableError = (cause:unknown) => cause instanceof Error && !/\b(demo|test|sandbox)\b/i.test(cause.message)
  ? cause.message : 'Payment could not continue. Review your library wallet details and try again.'

export function PaymentWalletPage() {
  const [params]=useSearchParams(), id=params.get('payment')??''
  const [data,setData]=useState<{payment:Payment;options:PaymentOptions}|null>(null)
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState(''), [retry,setRetry]=useState(0)
  const flight=useRef(false), requestKey=useRef<string|null>(null)
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  // Returning to this tab must not reset a partly entered number/PIN or re-quote.
  useEffect(()=>{
    let active=true
    setData(null);setLoading(true);setError('');requestKey.current=null
    void (async()=>{
      try {
        if(!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id))throw new Error('Choose Pay beside a printing bill or fine to continue.')
        const payment=await paymentsApi.read(id)
        const options=await paymentsApi.options(payment.kind,payment.targetId)
        if(active)setData({payment,options})
      }catch(cause){if(active)setError(readableError(cause))}
      finally{if(active)setLoading(false)}
    })()
    return()=>{active=false}
  },[id,retry])
  const payment=data?.payment, options=data?.options
  const bill=prefix+(payment?.kind==='Printing'?'/printing':'/fines')
  const existing=options?.active&&options.active.paymentId!==id?options.active:null
  const savedPayment=existing??(payment?.state!=='Quoted'?payment:null)
  const eligible=payment?.state==='Quoted'&&payment.channelCode==='GCASH'&&options?.enabled&&options.paymentAllowed&&options.demoWalletEnabled
    &&Date.parse(payment.expiresAt)>Date.now()&&!existing
  async function pay(number:string,pin:string){
    if(!payment||!eligible||flight.current)return
    if(Date.parse(payment.expiresAt)<=Date.now()){setError('This payment review expired. Return to your bill and choose Pay again.');return}
    flight.current=true;setBusy(true);setError('')
    requestKey.current??=crypto.randomUUID()
    try {
      const result=await paymentsApi.demoCheckout(payment.paymentId,requestKey.current,number,pin)
      // Only a provider-verified result can update financial status. PIN entry is never payment confirmation.
      openPaymentReviewResult(result)
      setData(current=>current?{...current,payment:result}:null)
    }catch(cause){setError(readableError(cause))}
    finally{flight.current=false;setBusy(false)}
  }
  const back=()=>{if(!flight.current)window.location.assign(bill)}
  return <main className="payment-ui wallet-checkout-page">
    <SessionActivity/>
    <header className="wallet-page-header"><div><LibraryBig size={30} aria-hidden="true"/><span><strong>STI College Ormoc</strong><span>Library payment</span></span></div></header>
    <div className="wallet-page-inner">
      <Link className="wallet-page-back" to={bill} aria-disabled={busy||undefined} onClick={event=>{if(flight.current)event.preventDefault()}}><ArrowLeft size={18} aria-hidden="true"/>Back to bill</Link>
      {loading?<section className="payment-surface p-8 text-center" role="status">Loading payment…</section>:eligible&&payment&&options?
        <DemoWalletCheckout key={payment.paymentId} payment={payment} accounts={options.demoAccounts??[]} busy={busy} error={error} onPay={(number,pin)=>void pay(number,pin)} onBack={back} onClose={back}/>:
        <section className="payment-surface p-6 sm:p-8"><h1 className="text-2xl font-bold">{error?'Payment unavailable':payment?.state==='Quoted'?'Review your bill':'Payment status'}</h1>
          {error?<p className="payment-error mt-4" role="alert">{error}</p>:<p className="payment-muted mt-4">{existing?'A payment is already open for this bill. Continue that payment instead.':payment?.state==='Quoted'?'This review is no longer available. Return to your bill to check the balance and payment options.':'Continue to your saved payment for its latest status.'}</p>}
          <div className="mt-6 flex flex-wrap gap-3">{savedPayment?<Link className="payment-link" to={paymentResultPath(savedPayment)}>View payment</Link>:null}<Link className="payment-link" to={bill}>Return to bill</Link>{error?<Button className="payment-button" variant="secondary" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>Try again</Button>:null}</div>
        </section>}
    </div>
  </main>
}
