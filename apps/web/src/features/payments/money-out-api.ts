import { paymentRequest } from './payments-api'

export type MoneyOutRecord = {
  id:string;type:'Refund'|'Withdrawal';state:string;paymentId?:string;reference:string;principalCentavos:number;feeCentavos:number;
  totalCentavos:number;appliedPrincipalCentavos:number;decision?:'Restore'|'Cancel';rail:'Native'|'Transfer';reason:string;createdAt:string;expiresAt:string;
  destination:{name:string;account:string;bank:string}|null;events:Array<{at:string;state:string;code:string}>
  providerState?:string;providerReference?:string;checkedAt?:string;
}
export type Destination = {id:string;type:'SchoolBank'|'StudentRefund';label:string;accountId?:number;name:string;account:string;bank:string;isSample?:boolean}
export type FundsOverview = {enabled:boolean;refundsEnabled:boolean;payoutsEnabled:boolean;payoutFeeCentavos:number|null;
  collections:FundsCollections;practiceTransfers:PracticeTransfer[];
  payoutFeeIsSample?:boolean;
  balance:{providerBalanceCentavos:number;reservedCentavos:number;availableCentavos:number}|null;setupMessage:string|null;
  beneficiaries:Destination[];operations:MoneyOutRecord[];voids:Array<{id:string;amount:number;reason:string;createdAt:string}>;
  totals:{grossCollections:number;appliedPrincipal:number;userFees:number;refundedPrincipal:number;refundedFees:number;withdrawals:number;providerCosts:number|null}}
export type FundsCollections = {
  totalCollectionsCentavos:number;onlineCollectionsCentavos:number;cashCollectedCentavos:number;refundedCentavos:number;
  topUpsCentavos:number;withdrawalsCentavos:number;reservedCentavos:number;availableCentavos:number;withdrawalFeeCentavos:number
  providerWithdrawalsCentavos?:number;
}
export type PracticeTransfer = {
  id:string;reference:string;actorId:number;direction:'Withdrawal'|'TopUp';amountCentavos:number;feeCentavos:number;totalCentavos:number;
  reason:string;state:'Draft'|'Succeeded'|'Cancelled';createdAt:string;expiresAt:string;destination:string;practice:true;
  balanceAfterCentavos?:number;
  events:Array<{at:string;state:string;actorId:number}>
}
export type RefundOptions = {principalCentavos:number;feeCentavos:number;refundableCentavos:number;refundedCentavos:number;channel:string;kind:string;eligible:boolean;enabled:boolean;beneficiaries:Destination[];refunds:MoneyOutRecord[]}
const base='admin/payments'
export const moneyOutApi={
  overview:()=>paymentRequest<FundsOverview>(base+'/funds'),
  draftPractice:(body:{direction:'Withdrawal'|'TopUp';amount:string;reason:string;requestKey:string})=>paymentRequest<PracticeTransfer>(base+'/funds/practice-transfers',body),
  confirmPractice:(id:string)=>paymentRequest<PracticeTransfer>(base+'/funds/practice-transfers/'+id+'/confirm',{}),
  cancelPractice:(id:string)=>paymentRequest<PracticeTransfer>(base+'/funds/practice-transfers/'+id+'/cancel',{}),
  setTransferFee:(amount:string,reference:string)=>paymentRequest<unknown>(base+'/funds/transfer-fee',{amount,reference,confirmed:true}),
  options:(id:string)=>paymentRequest<RefundOptions>(base+'/'+id+'/refunds'),
  refund:(id:string,body:{amount:string;decision:string;reason:string;beneficiaryId?:string;requestKey:string})=>paymentRequest<MoneyOutRecord>(base+'/'+id+'/refunds',body),
  beneficiary:(body:Record<string,unknown>)=>paymentRequest<Destination>(base+'/funds/beneficiaries',body),
  sampleBank:()=>paymentRequest<Destination>(base+'/funds/sample-bank',{confirmed:true}),
  withdrawal:(body:{amount:string;beneficiaryId:string;reason:string;requestKey:string})=>paymentRequest<MoneyOutRecord>(base+'/funds/withdrawals',body),
  confirm:(id:string)=>paymentRequest<MoneyOutRecord>(base+'/funds/'+id+'/confirm',{}),
  cancel:(id:string)=>paymentRequest<MoneyOutRecord>(base+'/funds/'+id+'/cancel',{}),
  check:(id:string,providerId?:string)=>paymentRequest<MoneyOutRecord>(base+'/funds/'+id+'/check',providerId?{providerId}:{}),
  recover:()=>paymentRequest<Record<string,number>>(base+'/funds/recover',{}),
  voidFine:(paymentId:string,reason:string,requestKey:string)=>paymentRequest<unknown>(base+'/funds/void',{paymentId,reason,requestKey}),
}
export const moneyOutStatus=(state:string,type='Refund')=>({Draft:'Ready to review',Processing:'Processing',Succeeded:type==='Refund'?'Refunded':'Completed',Failed:'Failed',Review:'Needs review',Cancelled:'Review cancelled',Reversed:'Transfer reversed'}[state]??'Needs review')
