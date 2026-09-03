import { getAccessToken } from '../auth/auth-storage'
import type { FineFilters,FineList,FineReceipt,FineReceiptSummary,FineTerm } from './types'

function headers(accept='application/json'){const value=new Headers({Accept:accept});const token=getAccessToken();if(token)value.set('Authorization',`Bearer ${token}`);return value}
async function request<T>(url:string,options:RequestInit={}){const requestHeaders=headers();if(options.body)requestHeaders.set('Content-Type','application/json');const response=await fetch(url,{...options,headers:requestHeaders,credentials:'include'});const payload=await response.json().catch(()=>null) as {success?:boolean;data?:T;message?:string}|null;if(!response.ok||!payload?.success)throw new Error(payload?.message??'The fines request failed.');return payload.data as T}
function query(filters:FineFilters){const values=new URLSearchParams();Object.entries(filters).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=='')values.set(key,String(value))});return values.toString()}
async function download(url:string,filename:string){const response=await fetch(url,{headers:headers('application/pdf'),credentials:'include'});if(!response.ok){const payload=await response.json().catch(()=>null) as {message?:string}|null;throw new Error(payload?.message??'The PDF could not be generated.')}const blob=await response.blob();const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=filename;anchor.click();URL.revokeObjectURL(objectUrl)}
export const finesApi={
  adminList:(filters:FineFilters)=>request<FineList>(`/api/v1/admin/fines?${query(filters)}`),
  mine:(filters:FineFilters)=>request<FineList>(`/api/v1/fines/me?${query(filters)}`),
  terms:()=>request<FineTerm[]>('/api/v1/fines/terms'),
  adminTerms:()=>request<FineTerm[]>('/api/v1/admin/fines/terms'),
  issueInfraction:(input:{schoolId:string;category:string;amount:number;incidentAt:string;location?:string;details:string})=>request('/api/v1/admin/fines/infractions',{method:'POST',body:JSON.stringify(input)}),
  pay:(input:{requestKey:string;allocations:Array<{fineId?:number;lostBookReportId?:number;amount:number}>;notes?:string})=>request<FineReceipt>('/api/v1/admin/fines/payments',{method:'POST',body:JSON.stringify(input)}),
  adjust:(fineId:number,input:{type:'Waiver'|'Reduction'|'Void';amount?:number;reason:string})=>request(`/api/v1/admin/fines/${fineId}/adjustments`,{method:'POST',body:JSON.stringify(input)}),
  receipts:()=>request<FineReceiptSummary[]>('/api/v1/fines/receipts'),
  receipt:(receiptId:number,admin=false)=>request<FineReceipt>(`/api/v1/${admin?'admin/':''}fines/receipts/${receiptId}`),
  reverse:(receiptId:number,reason:string)=>request<FineReceipt>(`/api/v1/admin/fines/receipts/${receiptId}/reverse`,{method:'POST',body:JSON.stringify({reason})}),
  downloadReceipt:(receiptId:number,receiptNumber:string,admin=false)=>download(`/api/v1/${admin?'admin/':''}fines/receipts/${receiptId}.pdf?download=1`,`${receiptNumber}.pdf`),
  downloadReport:(filters:FineFilters)=>download(`/api/v1/admin/fines/report.pdf?${query(filters)}`,'smartlib-fines-audit.pdf'),
}
