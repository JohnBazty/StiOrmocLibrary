import { ServiceChargesPanel } from '../payments/ServiceChargesPanel'
import { usePaymentUpdates } from '../payments/payment-updates'
import { AlertTriangle, PhilippinePeso, ReceiptText } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NoticeBanner, PageHeader, StatCard, StatusBadge, TableShell } from '../../components/ui'
import { fineDate,fineMoney,today } from './fine-format'
import { finesApi } from './fines-api'
import type { FineList } from './types'
import {Link} from 'react-router-dom'
import {getCurrentIdentity} from '../auth/auth-storage'
import { PaymentAction } from '../payments/PaymentAction'
import {paymentsApi} from '../payments/payments-api'
import {paymentResultPath} from '../payments/payment-navigation'
import { RefreshButton } from '../../components/RefreshButton'

export function StudentFinesPage(){
  const [data,setData]=useState<FineList|null>(null);const [error,setError]=useState('')
  const request=useRef(0);const [paymentVersion,setPaymentVersion]=useState(0)
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  const load=useCallback(async()=>{
    const current=++request.current
    try {
      await paymentsApi.sync().catch(()=>undefined)
      const records=await finesApi.mine({search:'',status:'all',type:'all',period:'custom',from:'2000-01-01',to:today(),page:1,limit:100})
      if(current===request.current){setData(records);setPaymentVersion(value=>value+1);setError('')}
    } catch(cause) { if(current===request.current)setError(cause instanceof Error?cause.message:'Fine records are unavailable.') }
  },[])
  useEffect(()=>{void load()},[load])
  usePaymentUpdates(load)
  return <>
    <PageHeader eyebrow="Account payments" title="Library fines" description="Review overdue fines and replacement charges, pay eligible balances online, or settle in cash at the counter." action={<RefreshButton onRefresh={() => load()} variant="secondary" />}/>
    {error?<NoticeBanner tone="error">{error}</NoticeBanner>:null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Total assessed" value={fineMoney(data?.summary.assessed??0)} icon={PhilippinePeso} tone="info"/><StatCard label="Outstanding balance" value={fineMoney(data?.summary.outstanding??0)} icon={AlertTriangle} tone={(data?.summary.outstanding??0)>0?'error':'success'}/><StatCard label="Payments applied" value={fineMoney(data?.summary.collected??0)} icon={ReceiptText} tone="teal"/></div>
    <NoticeBanner tone="info" title="How to pay" action={<Link className="inline-flex min-h-8 items-center text-xs font-semibold underline" to={prefix+'/transactions'}>Transactions</Link>}>
      Select Pay beside an eligible charge, or bring your school ID to pay in cash at the library counter. Confirmed payments appear in Transactions.
    </NoticeBanner>
    <div className="space-y-5">
      <TableShell title="Fine and replacement-charge history" subtitle="All overdue fines, infractions, and replacement charges on your account">
        {data?.items.length ? (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                <th scope="col" className="px-4 py-3">Charge &amp; reason</th>
                <th scope="col" className="px-4 py-3">Type &amp; date</th>
                <th scope="col" className="px-4 py-3 text-right">Assessed</th>
                <th scope="col" className="px-4 py-3 text-right">Payments applied</th>
                <th scope="col" className="px-4 py-3 text-right">Balance</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {data.items.map(item => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-[var(--sl-text-header)]">{item.title}</p>
                    <p className="mt-0.5 max-w-sm break-words text-xs text-[var(--sl-text-secondary)]">{item.reason}</p>
                    {item.adjusted > 0 ? <p className="mt-1 text-xs text-[var(--sl-text-muted)]">Waived or reduced: {fineMoney(item.adjusted)}</p> : null}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)]">{item.typeLabel} · {fineDate(item.occurredAt)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-[var(--sl-text)]">{fineMoney(item.assessed)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-[var(--sl-text)]">{fineMoney(item.paid)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[var(--sl-text-header)]">{fineMoney(item.balance)}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={item.status}/></td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-col items-end gap-2">
                      {item.localPaymentId ? <Link className="inline-flex min-h-9 items-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 text-xs font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]" to={paymentResultPath({paymentId:item.localPaymentId})}>View payment</Link> : null}
                      {item.balance > 0 ? <PaymentAction kind={item.fineId ? 'Fine' : 'LostBook'} targetId={item.fineId ?? item.lostBookReportId!} title={item.title} onUpdated={() => void load()} refreshKey={paymentVersion} allowNew={item.paymentAllowed}/> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-sm font-medium text-[var(--sl-text-muted)]">You have no fine records.</p>
        )}
      </TableShell>
    </div>
    <ServiceChargesPanel/>
  </>
}
