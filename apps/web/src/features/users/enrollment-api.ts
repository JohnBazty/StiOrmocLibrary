import { getAccessToken } from '../auth/auth-storage'

export type Semester = {
  semester_id:number; academic_year:string; term_name:string; end_date:string
  manual_end_at:string; scheduled_end_at:string; started_at:string|null; ended_at:string|null
  end_kind:'Manual'|'Scheduled'|null; status:'Draft'|'Active'|'Ended'; can_end:boolean
  has_complete:boolean; active_accounts:number
  latest_roster:{file_name:string;student_count:number;source_date:string;complete:boolean}|null
}
export type RosterRow = {school_id:string; student_name:string; program:string|null; year_level:string|null; closed_status:string|null; deactivated_at_end:boolean; account_id:number|null; email_mismatch:boolean}
export type RowIssue = {sheet:string;row:number;errors:string[]}
export class EnrollmentError extends Error {
  constructor(message:string,public issues:RowIssue[] = []){super(message)}
}

async function request<T>(path:string, body?:unknown, signal?:AbortSignal) {
  const token=getAccessToken(),headers=new Headers({Accept:'application/json'})
  if(token)headers.set('Authorization',`Bearer ${token}`)
  if(body!==undefined&&!(body instanceof FormData))headers.set('Content-Type','application/json')
  const response=await fetch('/api/v1/admin/enrollment'+path,{
    headers,signal,method:body===undefined?'GET':'POST',
    body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),
  })
  const payload=await response.json().catch(()=>null)
  if(!response.ok||!payload?.success)throw new EnrollmentError(payload?.message??'Student enrollment could not be loaded.',payload?.details?.rows??[])
  return payload.data as T
}
export const enrollmentApi={
  overview:(signal?:AbortSignal)=>request<Semester[]>('',undefined,signal),
  save:(body:unknown)=>request<{semesterId:number}>('/semesters',body),
  start:(id:number)=>request(`/semesters/${id}/start`,{}),
  end:(id:number)=>request(`/semesters/${id}/end`,{}),
  upload:(id:number,body:FormData)=>request<{alreadyUploaded:boolean;students:number;missingEmail:number}>(`/semesters/${id}/roster`,body),
  roster:(id:number,page:number,q:string,signal?:AbortSignal)=>request<{rows:RosterRow[];more:boolean;archived:boolean}>(`/semesters/${id}/roster?${new URLSearchParams({page:String(page),q})}`,undefined,signal),
}
