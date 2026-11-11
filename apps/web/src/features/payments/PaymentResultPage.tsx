import { useCallback,useEffect,useRef,useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button,PageHeader,SectionCard } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { paymentsApi,type Payment } from './payments-api'
import { PaymentStatusPanel,PaymentSummary } from './PaymentAction'

export function PaymentResultPage() {
  const [params]=useSearchParams(),id=params.get('payment')??''
  const [payment,setPayment]=useState<Payment|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const automaticChecks=useRef(0)
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    if(!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)){setPayment(null);setError('Choose a payment from your printing or fines page.');setLoading(false);return}
    try{let saved:Payment;try{saved=await paymentsApi.check(id)}catch{saved=await paymentsApi.read(id)}setPayment(saved)}
    catch(error){setPayment(null);setError(error instanceof Error?error.message:'This payment could not be loaded.')}
    finally{setLoading(false)}
  },[id])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{automaticChecks.current=0},[id])
  useEffect(()=>{
    if(loading||!payment||!['Active','Prepared','Creating'].includes(payment.state)||automaticChecks.current>=4)return
    const timer=setTimeout(()=>{automaticChecks.current++;void load()},15000)
    return()=>clearTimeout(timer)
  },[id,loading,payment?.state,load])
  const back=prefix+(payment?.kind==='Printing'?'/printing':'/fines')
  return <main className="mx-auto min-h-screen max-w-2xl space-y-5 px-4 py-8 text-slate-900 dark:text-white sm:px-6">
    <PageHeader eyebrow="Library payments" title="Your payment" action={<Button variant="secondary" disabled={loading} onClick={()=>void load()}>Refresh status</Button>}/>
    {loading?<p role="status">Checking your saved payment…</p>:null}
    {error?<p role="alert" className="auth-error rounded-xl p-4">{error}</p>:null}
    {payment?<SectionCard className="space-y-5 p-5"><p className="break-words font-semibold">{payment.description??(payment.kind==='Printing'?'Printing bill':'Library fine')}</p>
      {payment.isSample?<p className="text-sm text-amber-800 dark:text-amber-200">Sandbox test payment. No real money is collected.</p>:null}
      <PaymentSummary payment={payment}/><PaymentStatusPanel payment={payment} onChange={setPayment}/>
      <p className="text-sm opacity-70">This page shows the saved, verified status. Closing checkout or returning here does not confirm payment.</p>
    </SectionCard>:null}
    <div className="flex flex-wrap gap-3"><a className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold dark:border-white/25" href={prefix+'/payments'}>All payments</a><a className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold dark:border-white/25" href={back}>Back to {payment?.kind==='Printing'?'printing':'library fines'}</a></div>
  </main>
}
