import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentIdentity } from '../auth/auth-storage'
import { usePaymentUpdates } from './payment-updates'
import { refundRequestsApi } from './refund-requests-api'

export function RefundRequestsNotice() {
  const [pending,setPending]=useState(0)
  const refresh=useCallback(async()=>{if(getCurrentIdentity()?.role!=='Librarian')return;try{setPending((await refundRequestsApi.summary()).pending)}catch{/* Main dashboard stays available; refund details report their own errors. */}},[])
  useEffect(()=>{void refresh()},[refresh]);usePaymentUpdates(refresh)
  return pending?<Link className="mb-5 flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-900 dark:border-white/20 dark:bg-white/5 dark:text-blue-100" to="/librarian/payments?view=refunds"><span>{pending} refund request{pending===1?'':'s'} awaiting review</span><span>Review requests →</span></Link>:null
}
