import { enhancedRequest } from '../catalog/enhanced-catalog-api'
import { getAccessToken } from '../auth/auth-storage'
export const operationsBase='/api/v1/admin/operations-maintenance'
export const operationsGet=<T>(path:string)=>enhancedRequest<T>(operationsBase+path)
export const operationsSend=<T=unknown>(path:string,body:unknown,method='POST')=>enhancedRequest<T>(operationsBase+path,{method,body:JSON.stringify(body)})
export async function downloadItems(kind:string,q:string){
  const token=getAccessToken(),response=await fetch(`${operationsBase}/stock/${kind}/report.csv?q=${encodeURIComponent(q)}`,{credentials:'include',headers:token?{Authorization:`Bearer ${token}`}:{}})
  if(!response.ok)throw Error((await response.json().catch(()=>null))?.message??'The stock list could not be downloaded.')
  const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`${kind}-current-stock.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export const maintenanceField='mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-2 focus:outline-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
export const money=(value:unknown)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value??0))
export const localDate=(value:unknown)=>value?new Date(String(value)).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Not recorded'
export type ChangeEvent={event_id:number;reason:string;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>;created_at:string;actor?:string}
