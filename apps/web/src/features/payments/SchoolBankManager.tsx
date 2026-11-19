import { useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { SchoolBankForm } from './SchoolBankForm'
import { moneyOutApi, type Destination, type FundsOverview } from './money-out-api'

export function SchoolBankManager({data,onSaved}:{data:FundsOverview;onSaved:()=>void}) {
  const [adding,setAdding]=useState(false),[change,setChange]=useState<{bank:Destination;kind:'default'|'deactivate'}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const flight=useRef(false),banks=data.schoolBanks??data.beneficiaries.filter(bank=>bank.type==='SchoolBank')
  async function apply(){if(flight.current||!change)return;flight.current=true;setBusy(true);setError('');try{await moneyOutApi.updateBank(change.bank.id,{confirmed:true,...(change.kind==='default'?{isDefault:true}:{active:false})});setChange(null);onSaved()}catch(cause){setError(cause instanceof Error?cause.message:'The school account could not be updated.')}finally{flight.current=false;setBusy(false)}}
  if(adding)return <SchoolBankForm bankOptions={data.bankOptions??[]} onCancel={()=>setAdding(false)} onSaved={()=>{setAdding(false);onSaved()}}/>
  return <div className="space-y-5"><p className="payment-muted text-sm">Use school-owned accounts for funding records and withdrawals. Historical transactions keep their original account details.</p>
    {change?<div className="payment-summary space-y-4"><strong>{change.kind==='default'?'Use as the default school account?':'Deactivate this school account?'}</strong><p>{change.bank.label}<br/>{change.bank.bank} · {change.bank.account}</p><p className="text-sm">{change.kind==='default'?'New forms will suggest this account. Each transfer still requires review.':'New funding and withdrawal reviews cannot use this account. Unsent reviews must be prepared again. Previous records stay intact.'}</p><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>setChange(null)}>Back</Button><Button disabled={busy} onClick={()=>void apply()}>{busy?'Saving…':'Confirm account change'}</Button></div></div>:<>
      {banks.map(bank=><article className="funds-bank" key={bank.id}><div className="flex flex-wrap items-start justify-between gap-3"><strong>{bank.label}</strong><span className="payment-chip">{bank.active===false?'Inactive':bank.isDefault?'Default account':'Active'}</span></div><p className="payment-muted mt-2 text-sm">{bank.name} · {bank.bank} · {bank.account}</p><div className="mt-3 flex flex-wrap gap-2">{bank.active!==false?<>{!bank.isDefault?<Button variant="secondary" className="payment-button" onClick={()=>setChange({bank,kind:'default'})}>Make default</Button>:null}<Button variant="ghost" className="payment-button" onClick={()=>setChange({bank,kind:'deactivate'})}>Deactivate account</Button></>:null}</div></article>)}
      {!banks.length?<p className="payment-field-note">No school account is saved. Add the authorized account to continue.</p>:null}
      <Button className="payment-button w-full" onClick={()=>setAdding(true)}>Add school bank account</Button>
    </>}
    {error?<p role="alert" className="payment-error">{error}</p>:null}
  </div>
}
