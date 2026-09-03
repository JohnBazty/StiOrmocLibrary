import { getAccessToken } from '../auth/auth-storage'

export type ServiceStatus={accepting_requests:number|boolean;unavailable_reason:string|null;updated_at?:string|null}
export type PricingRule={pricing_rule_id:number;print_type:'Colored'|'Monochrome';paper_size:'Short'|'A4'|'Long';price_per_page:number|string}
export type PrintRequest={request_id:number;full_name?:string;school_id?:string;user_role?:string;file_name:string;number_of_copies:number;print_type:string;paper_size:string;page_count:number;total_sheets:number;calculated_cost:number|string;payment_status:'Unpaid'|'Paid';job_status:'Pending'|'Printing'|'Ready for Pickup'|'Completed'|'Cancelled';created_at:string;cancelled_reason?:string|null}
export type PrintSummary={pending_jobs:number;printing_jobs:number;ready_jobs:number;completed_today:number;unpaid_jobs:number;revenue_today:number;service_status:ServiceStatus}
export type InkStock={ink_id:number;cartridge_type:string;color_variation:string;available_bottles:number;low_stock_threshold_bottles:number;cost_per_bottle:number|string;is_low:number}
export type PaperStock={paper_stock_id:number;paper_size_dimension:string;unopened_reams:number|string;remaining_reams:number|string;low_stock_threshold_reams:number|string;average_expense_cost:number|string;is_low:number}
export type SupplyData={ink:InkStock[];paper:PaperStock[];summary:{low_ink_items:number;low_paper_items:number;monthly_expense:number}}
export type FinancePeriod='daily'|'weekly'|'monthly'
export type FinanceFilters={period:FinancePeriod;date:string;month:string;week:number}
export type FinanceSummary={period:FinancePeriod;label:string;from:string;to:string;revenue:number;ink_expenses:number;paper_expenses:number;total_expenses:number;net_result:number;profit_margin:number;indicator:'Net gain'|'Net loss'|'Break-even'}
export type FinanceEntry={entry_date:string;entry_name:string;entry_type:'Revenue'|'Ink restock'|'Paper restock';quantity:string;unit_cost:number|string;revenue:number|string;expense:number|string;net_impact:number|string;recorded_by:string|null}
export type RevenueSummary={period:FinancePeriod;label:string;from:string;to:string;paid_requests:number;total_sheets:number;total_copies:number;total_revenue:number}
export type RevenueEntry={received_at:string;request_id:number;full_name:string;school_id:string;file_name:string;print_type:string;paper_size:string;page_count:number;number_of_copies:number;total_sheets:number;amount_paid:number|string;received_by:string|null}
export type ExpenseSummary={period:FinancePeriod;label:string;from:string;to:string;restock_entries:number;ink_expenses:number;paper_expenses:number;total_expenses:number}
export type RestockEntry={created_at:string;supply_type:'Ink'|'Paper';supply_name:string;quantity:number|string;unit:string;unit_cost:number|string;total_expense:number|string;balance_before:number|string|null;balance_after:number|string|null;recorded_by:string|null}
export type StockUsageEntry={created_at:string;supply_type:'Ink'|'Paper';supply_name:string;activity_code:'LoadedIntoPrinter'|'OpenedReam';quantity:number|string;unit:string;balance_before:number|string;balance_after:number|string;recorded_by:string|null}

let csrfToken:string|null=null
function headers(accept='application/json'){const h=new Headers({Accept:accept}),token=getAccessToken();if(token)h.set('Authorization',`Bearer ${token}`);return h}
async function ensureCsrf(){if(getAccessToken()||csrfToken)return;const r=await fetch('/api/auth/csrf',{credentials:'include',headers:{Accept:'application/json'}}),p=await r.json() as {csrfToken?:string;message?:string};if(!r.ok||!p.csrfToken)throw new Error(p.message??'Unable to start a secure request.');csrfToken=p.csrfToken}
async function request<T>(url:string,options:RequestInit={}){const mutating=Boolean(options.method&&options.method!=='GET');if(mutating)await ensureCsrf();const h=headers();if(!(options.body instanceof FormData)&&options.body)h.set('Content-Type','application/json');if(csrfToken&&!getAccessToken())h.set('x-csrf-token',csrfToken);const r=await fetch(url,{...options,credentials:'include',headers:h}),p=await r.json().catch(()=>({})) as {data?:T;message?:string;meta?:{pagination?:{page:number;limit:number;total:number;total_pages:number}}};if(!r.ok)throw new Error(p.message??'The printing service request failed.');return{data:p.data as T,meta:p.meta}}
async function download(url:string,name:string,accept:string,expected?:string){const r=await fetch(url,{credentials:'include',headers:headers(accept)});if(!r.ok){const p=await r.json().catch(()=>({})) as {message?:string};throw new Error(p.message??'Unable to download the file.')}const contentType=r.headers.get('content-type')??'';if(expected&&!contentType.includes(expected))throw new Error('The server returned an invalid download.');const blob=await r.blob(),objectUrl=URL.createObjectURL(blob),link=document.createElement('a');link.href=objectUrl;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000)}
function filterParams(filters:FinanceFilters){const value=new URLSearchParams({period:filters.period,date:filters.date,month:filters.month});if(filters.period==='weekly')value.set('week',String(filters.week));return value}

export const printingApi={
  serviceStatus:async()=>(await request<ServiceStatus>('/api/v1/printing/service-status')).data,
  pricing:async()=>(await request<PricingRule[]>('/api/v1/printing/pricing')).data,
  mine:async()=>(await request<PrintRequest[]>('/api/v1/printing/requests')).data,
  submit:async(form:FormData)=>(await request<PrintRequest>('/api/v1/printing/requests',{method:'POST',body:form})).data,
  cancel:async(id:number)=>request(`/api/v1/printing/requests/${id}/cancel`,{method:'PUT',body:'{}'}),
  summary:async()=>(await request<PrintSummary>('/api/v1/admin/printing/summary')).data,
  setServiceStatus:async(accepting:boolean,reason?:string)=>request<ServiceStatus>('/api/v1/admin/printing/service-status',{method:'PATCH',body:JSON.stringify({accepting_requests:accepting,unavailable_reason:reason})}),
  queue:async(filters:{q:string;status:string;payment:string})=>{const q=new URLSearchParams();if(filters.q)q.set('q',filters.q);if(filters.status)q.set('status',filters.status);if(filters.payment)q.set('payment_status',filters.payment);const result=await request<PrintRequest[]>(`/api/v1/admin/printing/queue?${q}`);return{rows:result.data,pagination:result.meta?.pagination}},
  cash:async(row:PrintRequest)=>request(`/api/v1/admin/printing/requests/${row.request_id}/cash-payment`,{method:'POST',body:JSON.stringify({amount_paid:Number(row.calculated_cost)})}),
  status:async(id:number,status:string,reason?:string)=>request(`/api/v1/admin/printing/requests/${id}/status`,{method:'PATCH',body:JSON.stringify({status,reason})}),
  downloadDocument:(row:PrintRequest)=>download(`/api/v1/admin/printing/requests/${row.request_id}/document`,row.file_name,'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  supplies:async()=>(await request<SupplyData>('/api/v1/admin/printing/supplies')).data,
  financeSummary:async(filters:FinanceFilters)=>(await request<FinanceSummary>(`/api/v1/admin/printing/finance/summary?${filterParams(filters)}`)).data,
  financeEntries:async(filters:FinanceFilters)=>(await request<FinanceEntry[]>(`/api/v1/admin/printing/finance/entries?${filterParams(filters)}`)).data,
  revenueSummary:async(filters:FinanceFilters)=>(await request<RevenueSummary>(`/api/v1/admin/printing/revenue/summary?${filterParams(filters)}`)).data,
  revenueEntries:async(filters:FinanceFilters)=>(await request<RevenueEntry[]>(`/api/v1/admin/printing/revenue/entries?${filterParams(filters)}`)).data,
  expenseSummary:async(filters:FinanceFilters)=>(await request<ExpenseSummary>(`/api/v1/admin/printing/expenses/summary?${filterParams(filters)}`)).data,
  restockHistory:async(filters:FinanceFilters)=>(await request<RestockEntry[]>(`/api/v1/admin/printing/restocks?${filterParams(filters)}`)).data,
  stockUsage:async()=>(await request<StockUsageEntry[]>('/api/v1/admin/printing/stock-usage?limit=100')).data,
  stock:async(kind:'ink'|'paper',id:number,data:{movement_type:string;quantity:number;expense_amount:number;notes?:string})=>request(`/api/v1/admin/printing/supplies/${kind}/${id}/movements`,{method:'POST',body:JSON.stringify(data)}),
  restock:async(kind:'ink'|'paper',id:number,data:{quantity:number;unit_cost:number})=>request(`/api/v1/admin/printing/supplies/${kind}/${id}/restock`,{method:'POST',body:JSON.stringify(data)}),
  useInkBottle:async(id:number)=>request(`/api/v1/admin/printing/supplies/ink/${id}/use-bottle`,{method:'POST',body:'{}'}),
  openPaperReam:async(id:number)=>request(`/api/v1/admin/printing/supplies/paper/${id}/open-ream`,{method:'POST',body:'{}'}),
  createInk:async(data:{cartridge_type:string;color_variation:string;available_bottles:number;low_stock_threshold_bottles:number;cost_per_bottle:number})=>request('/api/v1/admin/printing/supplies/ink',{method:'POST',body:JSON.stringify(data)}),
  printReport:()=>download('/api/v1/admin/printing/report.pdf','smartlib-printing-report.pdf','application/pdf','application/pdf'),
  supplyReport:()=>download('/api/v1/admin/printing/supplies/report.pdf','smartlib-print-supplies-report.pdf','application/pdf','application/pdf'),
  financeReport:(filters:FinanceFilters)=>download(`/api/v1/admin/printing/finance/report.pdf?${filterParams(filters)}`,`smartlib-print-finance-${filters.period}-${filters.date}.pdf`,'application/pdf','application/pdf'),
  revenueReport:(filters:FinanceFilters)=>download(`/api/v1/admin/printing/reports/revenue.pdf?${filterParams(filters)}`,`smartlib-print-revenue-${filters.period}-${filters.date}.pdf`,'application/pdf','application/pdf'),
  stockExpenseReport:(filters:FinanceFilters)=>download(`/api/v1/admin/printing/reports/stock-expenses.pdf?${filterParams(filters)}`,`smartlib-stock-expenses-${filters.period}-${filters.date}.pdf`,'application/pdf','application/pdf'),
}
