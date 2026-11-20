import { useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { moneyOutApi, type Destination } from './money-out-api'

export function SchoolBankForm({bankOptions,onSaved,onCancel}:{bankOptions:Array<{code:string;name:string}>;onSaved:(bank:Destination)=>void;onCancel:()=>void}) {
  const [values,setValues]=useState({name:'',bankCode:'',accountNumber:'',confirmAccountNumber:'',street:'',city:'',province:'',postalCode:'',evidence:''})
  const [confirmed,setConfirmed]=useState(false),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const flight=useRef(false)
  const matches=values.accountNumber===values.confirmAccountNumber
  const valid=confirmed&&matches&&/^\d{6,30}$/.test(values.accountNumber)&&bankOptions.some(bank=>bank.code===values.bankCode)&&values.name.trim().length>=2&&values.name.trim().length<=50&&values.evidence.trim().length>=10&&[values.street,values.city,values.province].every(value=>value.trim().length>=2)&&/^\d{4}$/.test(values.postalCode)
  async function save(){if(flight.current||!valid)return;flight.current=true;setBusy(true);setError('');try{onSaved(await moneyOutApi.beneficiary({...values,type:'SchoolBank',confirmed:true}))}catch(cause){setError(cause instanceof Error?cause.message:'The school account could not be saved.')}finally{flight.current=false;setBusy(false)}}
  const field=(key:keyof typeof values,label:string,numeric=false)=><label className="block text-sm font-semibold" key={key}>{label}<input className="payment-field mt-2" value={values[key]} maxLength={key==='evidence'?500:key==='name'?50:100} inputMode={numeric?'numeric':'text'} autoComplete="off" onChange={event=>setValues(value=>({...value,[key]:event.target.value}))}/></label>
  return <div className="space-y-5"><div><h3 className="text-lg font-bold">Add school bank account</h3><p className="payment-muted mt-2 text-sm">Use an account owned and authorized by the school. Saving it does not debit the bank or independently verify ownership with the bank.</p></div>
    {review?<div className="payment-summary space-y-3"><strong>{values.name}</strong><p>{bankOptions.find(bank=>bank.code===values.bankCode)?.name}</p><p>Account · •••• {values.accountNumber.slice(-4)}</p><p className="break-words text-sm">School authorization: {values.evidence}</p><p className="payment-muted text-sm">{values.street}, {values.city}, {values.province} {values.postalCode}</p></div>:<>
      <label className="block text-sm font-semibold">Bank<select className="payment-field mt-2" value={values.bankCode} onChange={event=>setValues(value=>({...value,bankCode:event.target.value}))}><option value="">Choose school bank</option>{bankOptions.map(bank=><option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
      {field('name','School account holder name')}
      {values.name.trim().length>0&&values.name.trim().length<2?<p role="alert" className="payment-error">Enter at least 2 characters for the account holder name.</p>:null}
      <div className="grid gap-4 sm:grid-cols-2">{field('accountNumber','Account number',true)}{field('confirmAccountNumber','Confirm account number',true)}</div>
      {values.accountNumber&&!/^\d{6,30}$/.test(values.accountNumber)?<p role="alert" className="payment-error">Use 6 to 30 digits for the account number.</p>:null}
      {values.confirmAccountNumber&&!matches?<p role="alert" className="payment-error">Account numbers must match.</p>:null}
      {field('evidence','School authorization reference')}
      {values.evidence.trim().length>0&&values.evidence.trim().length<10?<p role="alert" className="payment-error">Enter at least 10 characters for the school authorization reference.</p>:null}
      <fieldset className="rounded-xl border border-current/15 p-4"><legend className="px-1 text-sm font-semibold">School address</legend><p className="payment-field-note mb-3">Required for the provider’s bank-transfer recipient record.</p><div className="grid gap-4 sm:grid-cols-2">{field('street','Street address')}{field('city','City')}{field('province','Province')}{field('postalCode','Postal code',true)}</div>{[values.street,values.city,values.province].some(value=>value.trim().length===1)?<p role="alert" className="payment-error mt-2">Address fields must contain at least 2 characters.</p>:null}{values.postalCode&&!/^\d{4}$/.test(values.postalCode)?<p role="alert" className="payment-error mt-2">Enter a 4-digit postal code.</p>:null}</fieldset>
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I checked school ownership and authorization for this account.</label>
    </>}
    {error?<p role="alert" className="payment-error">{error}</p>:null}
    <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>review?setReview(false):onCancel()}>{review?'Edit details':'Cancel'}</Button><Button className="payment-button flex-1" disabled={busy||!valid} onClick={()=>review?void save():setReview(true)}>{busy?'Saving…':review?'Save school account':'Review bank account'}</Button></div>
  </div>
}
