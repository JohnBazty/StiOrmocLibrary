import { getAccessToken } from '../auth/auth-storage'
export type DeskMode='TakeHome'|'InLibrary'|'Return'
export type DeskBorrower={user:{userId:number;name:string;schoolId:string;role:string;program:string|null;photoUrl:string|null};blockers:string[];eligible:boolean;enrollment:string;activeLoans:number;limit:number|null;hasAttendance:boolean}
export type DeskCopy={copy:{id:number;title:string;barcode:string;condition:string};eligible:boolean;blockers:string[]}
export type ReturnPreview={kind:'TakeHome'|'InLibrary';id:number;title:string;barcode:string;condition:string;borrower:{name:string;schoolId:string};dueAt:string;status:string}
export type InLibraryUse={use_id:number;status:string;started_at:string;hand_back_by:string;ended_at:string|null;condition_out:string;condition_in:string|null;title:string;barcode:string;full_name?:string;school_id?:string}
async function request<T>(path:string,body?:unknown){const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${getAccessToken()}`,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(data?.message??'The circulation desk is unavailable.');return data.data as T}
const base='/api/v1/admin/circulation-desk'
export const deskCirculationApi={
 borrower:(payload:string,mode:DeskMode)=>request<DeskBorrower>(`${base}/borrower`,{payload,mode}),
 preview:(payload:string,barcode:string,mode:DeskMode)=>request<DeskCopy>(`${base}/preview`,{payload,barcode,mode}),
 checkout:(payload:string,barcode:string,mode:DeskMode,requestId:string)=>request<{mode:string;dueAt?:string;handBackBy?:string;title?:string;copy?:{title:string}}>(`${base}/checkout`,{payload,barcode,mode,requestId}),
 returnPreview:(barcode:string)=>request<ReturnPreview>(`${base}/return-preview`,{barcode}),
 returnCopy:(preview:ReturnPreview,requestId:string,condition:string,assessmentNote:string)=>request<{title:string;assessmentNeeded:boolean}>(`${base}/return`,{barcode:preview.barcode,kind:preview.kind,expectedId:preview.id,requestId,condition:condition||null,assessmentNote}),
 uses:()=>request<InLibraryUse[]>(`${base}/in-library`),
 mine:()=>request<InLibraryUse[]>('/api/v1/borrowing/in-library'),
}
