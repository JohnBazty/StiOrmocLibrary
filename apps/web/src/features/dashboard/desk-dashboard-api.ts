import { getCsrfToken } from '../auth/auth-storage'
export type DeskTask = {id:number;kind:'Loan'|'Hold';borrower:string;schoolId:string;role:string;department:string;program:string;level:string;title:string;barcode:string;date:string;status:string;lostReported:boolean;reminderStatus:string|null}
export type DeskTaskFilters = {tab:'overdue'|'holds'|'due';department:string;program:string;level:string;q:string;page:number}
export type DeskOverview = {generatedAt:string;days:number;counts:{dueToday:number;overdue:number;holds:number;repair:number};topBooks:Array<{id:number;title:string;kind:string;count:number}>;groups:Array<{label:string;count:number}>;programs:Array<{department:string;program:string}>;academicBasis:string}
export type DeskTasks = {items:DeskTask[];total:number;page:number;limit:number;generatedAt:string}
export type DeskSearch = {people:Array<{name:string;schoolId:string;role:string;program:string}>;books:Array<{id:number;title:string;isbn:string|null;kind:string}>}
export type ReminderPreview = {items:DeskTask[];limit:number;channel:string;deduplication:string}
const base='/api/v1/admin/dashboard/desk'
const parameters=(value:object)=>new URLSearchParams(Object.entries(value).filter(([,v])=>v!==''&&v!==undefined).map(([k,v])=>[k,String(v)])).toString()
async function request<T>(path:string,signal?:AbortSignal,body?:unknown){
 const response=await fetch(base+path,{signal,credentials:'include',method:body===undefined?'GET':'POST',headers:{Accept:'application/json','X-CSRF-Token':getCsrfToken()??'',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const result=await response.json().catch(()=>null)
 if(!response.ok||!result?.success)throw new Error(result?.message??'The dashboard request could not be completed.')
 return result.data as T
}
export const deskDashboardApi={
 overview:(days:number,signal?:AbortSignal)=>request<DeskOverview>('?days='+days,signal),
 tasks:(filters:DeskTaskFilters,signal?:AbortSignal)=>request<DeskTasks>('/tasks?'+parameters(filters),signal),
 search:(q:string,signal?:AbortSignal)=>request<DeskSearch>('/search?'+parameters({q}),signal),
 reminders:(filters:DeskTaskFilters,id?:number,signal?:AbortSignal)=>request<ReminderPreview>('/reminders/preview?'+parameters({...filters,id}),signal),
 queue:(ids:number[])=>request<{queued:number;skipped:number;channel:string}>('/reminders',undefined,{ids}),
 async export(filters:DeskTaskFilters){const response=await fetch(base+'/export.csv?'+parameters(filters),{credentials:'include',headers:{'X-CSRF-Token':getCsrfToken()??''}});if(!response.ok)throw new Error('The filtered list could not be exported.');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='library-'+filters.tab+'.csv';a.click();URL.revokeObjectURL(url)},
}
