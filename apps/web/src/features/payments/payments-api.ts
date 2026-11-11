import { getAccessToken } from '../auth/auth-storage'

export type PaymentKind='Printing'|'Fine'|'LostBook'
export type Payment={paymentId:string;kind:PaymentKind;targetId:number;principalCentavos:number;feeCentavos:number;totalCentavos:number;
  remainingCentavos:number;channelCode:string;state:string;isSample:boolean;checkoutUrl:string|null;cancellationPending?:boolean;refundReview?:boolean;
  receiptId:number|null;description?:string|null;payerName?:string|null;schoolId?:string|null;createdAt:string;expiresAt:string;reviewCode?:string|null}
export type PaymentMethod={channelCode:string;displayName:string;minTotalCentavos:number;maxTotalCentavos:number}
export type PaymentOptions={enabled:boolean;isSample:boolean;paymentAllowed:boolean;balanceCentavos:number;methods:PaymentMethod[];active:Payment|null}
export const paymentMoney=(centavos:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(centavos/100)
export function paymentStatus(payment:Payment) {
  if(payment.cancellationPending)return 'Waiting for cancellation'
  return ({Quoted:'Ready to review',Prepared:'Ready to continue',Creating:'Waiting for confirmation',Active:'Payment in progress',
    Succeeded:payment.remainingCentavos>0?'Partially paid':'Paid',Expired:'Expired',Cancelled:'Cancelled',Review:'Needs review'} as Record<string,string>)[payment.state]??'Waiting for confirmation'
}
export function providerCheckout(value:string) {
  const url=new URL(value)
  if(url.protocol!=='https:'||!['dev.xen.to','checkout-staging.xendit.co'].includes(url.hostname)||url.username||url.password||url.port||url.hash)throw new Error('This checkout address could not be verified. Contact the library.')
  return url.href
}
export class PaymentRequestError extends Error {code?:string;details?:Record<string,unknown>}
async function request<T>(path:string,body?:unknown) {
  const headers=new Headers({Accept:'application/json'}),token=getAccessToken()
  if(token)headers.set('Authorization','Bearer '+token)
  if(body!==undefined)headers.set('Content-Type','application/json')
  const response=await fetch('/api/v1/'+path,{method:body===undefined?'GET':'POST',headers,credentials:'include',
    ...(body!==undefined?{body:JSON.stringify(body)}:{})})
  const payload=await response.json().catch(()=>null) as {success?:boolean;data?:T;message?:string;code?:string;details?:Record<string,unknown>}|null
  if(!response.ok||!payload?.success||payload.data===undefined){const error=new PaymentRequestError(payload?.message??'Payment information could not load. Please try again.');error.code=payload?.code;error.details=payload?.details;throw error}
  return payload.data
}
const base='user/payments'
export const paymentsApi={
  options:(kind:PaymentKind,targetId:number)=>request<PaymentOptions>(base+'/options?'+new URLSearchParams({kind,targetId:String(targetId)})),
  quote:(input:{kind:PaymentKind;targetId:number;channelCode:string;amount?:string})=>request<Payment>(base+'/quote',input),
  checkout:(quoteId:string,requestKey:string)=>request<Payment>(base+'/checkout',{quoteId,requestKey}),
  read:(id:string)=>request<Payment>(base+'/'+encodeURIComponent(id)),
  check:(id:string)=>request<Payment>(base+'/'+encodeURIComponent(id)+'/check',{}),
  resume:(id:string)=>request<Payment>(base+'/'+encodeURIComponent(id)+'/resume',{}),
  cancel:(id:string)=>request<Payment>(base+'/'+encodeURIComponent(id)+'/cancel',{}),
  list:(filters:{state:string;channel:string;kind:string;page:number})=>request<{items:Payment[];pagination:{page:number;limit:number;total:number};methods?:Array<Pick<PaymentMethod,'channelCode'|'displayName'>>}>('admin/payments?'+new URLSearchParams({...filters,page:String(filters.page)})),
  adminCheck:(id:string)=>request<Payment>('admin/payments/'+encodeURIComponent(id)+'/check',{}),
  adminCancel:(id:string)=>request<Payment>('admin/payments/'+encodeURIComponent(id)+'/cancel',{}),
}

export async function downloadPaymentRecord(payment:Payment,admin=false) {
  if(!payment.receiptId)throw new Error('The payment record is not ready yet. Check its status again.')
  const path=payment.kind==='Printing'?`${admin?'admin/printing':'printing'}/receipts/${payment.receiptId}/pdf`:
    `${admin?'admin/':''}fines/receipts/${payment.receiptId}.pdf?download=1`
  const headers=new Headers({Accept:'application/pdf'}),token=getAccessToken()
  if(token)headers.set('Authorization','Bearer '+token)
  const response=await fetch('/api/v1/'+path,{headers,credentials:'include'})
  if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('The payment record could not be downloaded. Please try again.')
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download='library-payment-'+payment.paymentId.slice(0,8)+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
