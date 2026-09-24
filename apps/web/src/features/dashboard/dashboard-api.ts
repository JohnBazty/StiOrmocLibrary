import { getAccessToken } from '../auth/auth-storage'
import type { AdminDashboardData, UserDashboardData } from './types'

async function request<T>(url:string){
  const headers = new Headers({ Accept:'application/json' }); const token=getAccessToken(); if(token) headers.set('Authorization',`Bearer ${token}`)
  const response=await fetch(url,{headers,credentials:'include'}); const payload=await response.json().catch(()=>null) as {success?:boolean;data?:T;message?:string}|null
  if(!response.ok||!payload?.success) throw new Error(payload?.message??'The dashboard could not be loaded.')
  return payload.data as T
}

export const dashboardApi={
  admin:()=>request<AdminDashboardData>('/api/v1/admin/dashboard'),
  user:()=>request<UserDashboardData>('/api/v1/dashboard'),
  async downloadAdminSummary(){
    const headers=new Headers();const token=getAccessToken();if(token)headers.set('Authorization',`Bearer ${token}`)
    const response=await fetch('/api/v1/admin/dashboard/summary.pdf',{headers,credentials:'include'});if(!response.ok)throw new Error('The dashboard PDF could not be generated.')
    const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download='smartlib-dashboard-summary.pdf';link.click();URL.revokeObjectURL(url)
  },
}
