import {getCsrfToken} from '../auth/auth-storage'
export type OwnershipState={canTransfer:boolean;version:number;pending:{id:string;email:string;expiresAt:string;mailStatus:'Pending'|'Sent'|'Failed'|'Skipped'}|null}
export type RecipientReview={email:string;version:number;targetVersion:number|null;targetRole:string|null;name:string|null;createsAccount:boolean}
export type OwnershipGrant={id:string;token:string}
export type SetupReview={email:string;name:string|null;requiresName:boolean;previousRole:string|null}
export class OwnershipError extends Error{constructor(message:string,public status:number,public code?:string){super(message)}}
async function request<T>(path:string,body?:unknown,publicSetup=false,signal?:AbortSignal):Promise<T>{
 const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:publicSetup?'omit':'include',signal,
  headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(!publicSetup?{'X-CSRF-Token':getCsrfToken()??''}:{})},body:body===undefined?undefined:JSON.stringify(body)})
 const result=await response.json().catch(()=>null)
 if(!response.ok||!result?.success)throw new OwnershipError(result?.message??'Ownership settings are temporarily unavailable. Please try again.',response.status,result?.code)
 return result.data as T
}
const privateBase='/api/v1/admin/users/ownership',publicBase='/api/v1/auth/ownership-setup'
const credentials=(grant:OwnershipGrant)=>({invitation_id:grant.id,setup_token:grant.token})
export const ownershipApi={
 state:(signal?:AbortSignal)=>request<OwnershipState>(privateBase,undefined,false,signal),
 preview:(email:string)=>request<RecipientReview>(privateBase+'/preview',{email}),
 invite:(review:RecipientReview,password:string)=>request<{version:number;message:string}>(privateBase+'/invite',{email:review.email,version:review.version,targetVersion:review.targetVersion,targetRole:review.targetRole,current_password:password}),
 cancel:(version:number)=>request<{message:string}>(privateBase+'/cancel',{version}),
 setupPreview:(grant:OwnershipGrant,signal?:AbortSignal)=>request<SetupReview>(publicBase+'/preview',credentials(grant),true,signal),
 complete:(grant:OwnershipGrant,password:string,confirmation:string,name?:string)=>request<{message:string}>(publicBase+'/complete',{...credentials(grant),password,confirm_password:confirmation,...(name!==undefined?{full_name:name}:{})},true),
}
