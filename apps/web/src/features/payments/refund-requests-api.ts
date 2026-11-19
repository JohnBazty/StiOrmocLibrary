import { paymentRequest, type Payment } from './payments-api'
import type { MoneyOutRecord } from './money-out-api'

export type RefundRequest = {
  id: string; paymentId: string; reference: string; kind: 'Printing'|'Fine'|'LostBook'; version: number
  state: 'PendingReview'|'Approved'|'Rejected'|'Withdrawn'; status: string; createdAt: string; updatedAt: string
  requestedPrincipalCentavos: number; requestedFeeCentavos: number; approvedPrincipalCentavos?: number; approvedFeeCentavos?: number; approvedTotalCentavos?: number
  reasonCode: string; reason: string; reviewNote?: string; operationId?: string
  events: Array<{at:string;state:string;note?:string}>
}
export type RefundRequestOptions = {
  refundRequestAllowed: boolean; refundRequestReason: string|null; refundableCentavos: number
  principalCentavos: number; feeCentavos: number
  quote: {principalCentavos:number;feeCentavos:number;totalCentavos:number}
}
export type RefundQueueRow = RefundRequest & {payerName:string;schoolId:string;operation:MoneyOutRecord|null}
export type RefundRequestDetails = {request:RefundRequest;payment:Payment;evidence:{assessed:string;paid:string;adjusted:string;jobStatus?:string;accruing:boolean;history:Array<Record<string,unknown>>}}
const base = (admin:boolean) => admin ? 'admin/payments' : 'user/payments'
export const refundRequestsApi = {
  summary: () => paymentRequest<{pending:number}>('admin/payments/refund-requests-summary'),
  options: (id:string, admin=false, amount?:string) => paymentRequest<RefundRequestOptions>(`${base(admin)}/${id}/refund-options${amount === undefined ? '' : '?amount='+encodeURIComponent(amount)}`),
  create: (id:string, body:{amount:string;reasonCode:string;reason:string;requestKey:string;expectedTotalCentavos:number}, admin=false) => paymentRequest<RefundRequest>(`${base(admin)}/${id}/refund-requests`,body),
  withdraw: (id:string,version:number) => paymentRequest<RefundRequest>(`user/payments/refund-requests/${id}/withdraw`,{version}),
  list: (query:{state:string;kind:string;search:string;page:number}) => paymentRequest<{items:RefundQueueRow[];pending:number;pagination:{page:number;limit:number;total:number}}>('admin/payments/refund-requests?'+new URLSearchParams({...query,page:String(query.page)})),
  details: (id:string) => paymentRequest<RefundRequestDetails>('admin/payments/refund-requests/'+id),
  reject: (id:string,version:number,reason:string) => paymentRequest<RefundRequest>('admin/payments/refund-requests/'+id+'/reject',{version,reason}),
}
