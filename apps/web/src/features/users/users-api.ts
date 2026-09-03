import { getAccessToken } from '../auth/auth-storage'
export type ActiveUser={id:number;school_id:string;role:string;full_name:string;email:string;program:string;year_or_unit:string;clearance_status:string}
export type UserSummary={active_accounts:number;student_accounts:number;faculty_accounts:number;staff_accounts:number}
export type UserFilters={q:string;role:string;program:string;clearance:string;page:number;limit:number}
export type Pagination={page:number;limit:number;total:number;total_pages:number}
function headers(){const h=new Headers({Accept:'application/json'}),token=getAccessToken();if(token)h.set('Authorization',`Bearer ${token}`);return h}
async function request<T>(url:string){const r=await fetch(url,{credentials:'include',headers:headers()}),p=await r.json() as {data?:T;message?:string;meta?:{pagination?:Pagination}};if(!r.ok)throw new Error(p.message??'Unable to load active users.');return{data:p.data as T,meta:p.meta}}
export const usersApi={summary:async()=>(await request<UserSummary>('/api/v1/admin/users/summary')).data,programs:async()=>(await request<string[]>('/api/v1/admin/users/programs')).data,active:async(f:UserFilters)=>{const q=new URLSearchParams({page:String(f.page),limit:String(f.limit)});if(f.q)q.set('q',f.q);if(f.role)q.set('role',f.role);if(f.program)q.set('program',f.program);if(f.clearance)q.set('clearance',f.clearance);const r=await request<ActiveUser[]>(`/api/v1/admin/users/active?${q}`);return{rows:r.data,pagination:r.meta?.pagination??{page:1,limit:f.limit,total:0,total_pages:0}}}}
