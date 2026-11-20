import { getCsrfToken } from '../auth/auth-storage'

export type Semester = {
  semester_id:number; academic_year:string; term_name:string; end_date:string
  manual_end_at:string; scheduled_end_at:string; started_at:string|null; ended_at:string|null
  end_kind:'Manual'|'Scheduled'|null; status:'Draft'|'Active'|'Ended'; can_end:boolean
  has_complete:boolean; active_accounts:number
  latest_roster:{file_name:string;student_count:number;source_date:string;complete:boolean;source_kind?:string}|null
}
export type RosterRow = {school_id:string; student_name:string; program:string|null; year_level:string|null; closed_status:string|null; deactivated_at_end:boolean; account_id:number|null; email_mismatch:boolean}
export type RowIssue = {sheet:string;row:number;errors:string[]}
export type RosterPreview = {
  replacement?: {omittedStudentIds:string[];reviewToken:string}
  studentCount: number
  errorCount: number
  warningCount: number
  sheets: { name: string; headings: string[]; rows: { row: number; cells: string[]; status?: string; errors: string[]; warnings: string[] }[] }[]
}
export type LateReview = RosterPreview & {added:number;alreadyListed:number;missingEmail:number;reviewToken:string}
export type LateResult = {added:number;alreadyListed:number;missingEmail:number;missingEmailStudentIds:string[]}
export class EnrollmentError extends Error {
  constructor(message:string,public issues:RowIssue[] = []){super(message)}
}

async function request<T>(path:string, body?:unknown, signal?:AbortSignal, role:'Student'|'Faculty'='Student') {
  const token=getCsrfToken(),headers=new Headers({Accept:'application/json'})
  if(token)headers.set('X-CSRF-Token', token)
  if(body!==undefined&&!(body instanceof FormData))headers.set('Content-Type','application/json')
  const response=await fetch((role==='Faculty'?'/api/v1/admin/faculty-enrollment':'/api/v1/admin/enrollment')+path,{
    headers,signal,method:body===undefined?'GET':'POST',
    body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),
  })
  const payload=await response.json().catch(()=>null)
  if(!response.ok||!payload?.success)throw new EnrollmentError(payload?.message??'Student enrollment could not be loaded.',payload?.details?.rows??[])
  return payload.data as T
}
export function createEnrollmentApi(role:'Student'|'Faculty'='Student'){
const call=<T,>(path:string,body?:unknown,signal?:AbortSignal)=>request<T>(path,body,signal,role)
return {
  qrSemesters:(signal?:AbortSignal)=>call<Pick<Semester,'semester_id'|'academic_year'|'term_name'|'status'>[]>('/qr-semesters',undefined,signal),
  qrRoster:(id:number,page:number,q:string,signal?:AbortSignal,accountStatus='' )=>call<{rows:StudentQrCard[];more:boolean}>(`/semesters/${id}/qr-roster?${new URLSearchParams({page:String(page),q,account_status:accountStatus})}`,undefined,signal),
  overview:(signal?:AbortSignal)=>call<Semester[]>('',undefined,signal),
  save:(body:unknown)=>call<{semesterId:number}>('/semesters',body),
  start:(id:number)=>call(`/semesters/${id}/start`,{}),
  end:(id:number)=>call(`/semesters/${id}/end`,{}),
  preview:(id:number,file:File,signal:AbortSignal, options?:{sourceDate:string;scope:string})=>{
    const body = new FormData()
    body.set('roster', file)
    if(role==='Student'&&options){body.set('sourceDate',options.sourceDate);body.set('scope',options.scope)}
    return call<RosterPreview>(`/semesters/${id}/roster/preview`, body, signal)
  },
  lateReview:(id:number,body:unknown)=>call<LateReview>(`/semesters/${id}/late-enrollment/review`,body),
  lateSave:(id:number,body:unknown)=>call<LateResult>(`/semesters/${id}/late-enrollment`,body),
  upload:(id:number,body:FormData)=>call<{alreadyUploaded:boolean;students:number;missingEmail:number}>(`/semesters/${id}/roster`,body),
  roster:(id:number,page:number,q:string,signal?:AbortSignal)=>call<{rows:RosterRow[];more:boolean;archived:boolean}>(`/semesters/${id}/roster?${new URLSearchParams({page:String(page),q})}`,undefined,signal),
  sendActivationEmails:(id:number)=>call<{total:number;sent:number;failed:number;skippedNoEmail:number;failures:Array<{schoolId:string;reason:string}>}>(`/semesters/${id}/activation-emails`,{}),
}

}
export const enrollmentApi=createEnrollmentApi()
export const facultyEnrollmentApi=createEnrollmentApi('Faculty')

export type StudentQrCard = { school_id:string;student_name:string;program:string|null;year_level:string|null;qr_image:string|null;qr_status:string }
