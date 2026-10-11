import { getAccessToken } from '../auth/auth-storage'
export type Option={id:number;name:string;code?:string;programId?:number;recordKind?:string;status:string;version:number}
export type Options=Record<'locations'|'programs'|'courses'|'types'|'categories',Option[]>
export type CatalogRecord={id:number;title:string;kind:string;coverImagePath?:string|null;author:string;isbn:string|null;publicationYear:number|null;copyrightYear:number|null;publisher:string|null;category:string|null;edition:string|null;pages:number|null;synopsis:string;glossary:string;abstract:string;typeId:number|null;resourceType:string|null;version:number;available:number;copyCount:number;programs:Option[];courses:Option[];copies:Array<{id:number;accession:string;barcode:string;shelf:string;condition:string;availability:string}>;files:Array<{id:number;name:string;size:number}>}
export type Mapping={sheet:string;headerRow:number;columns:Record<string,number>;categoryId?:number;location?:string;programId?:number}
export type Sheet={name:string;rowCount:number;headers:string[];mapping:Mapping;preview:string[][]}
export type ImportData={title:string;author:string;isbn:string;edition:string;publisher:string;publicationYear:string;copyrightYear:string;pages:string;copies:string;missingCopies:string;accessions:string;barcodes:string;callNumber:string;categoryId:number|null;location:string;programId:number|null;generateAccessions:boolean}
export type ImportRow={id:number;sheet:string;sourceRow:number;source:string[];data:ImportData;status:string;decision:string|null;targetTitleId:number|null;reuseRowId:number|null;version:number;overlaps:number[];errors:string[];error:string|null;matches:Array<{id:number;title:string;author:string;isbn:string|null;status:string}>;result?:{titleId:number;copyIds:number[]}}
export type Batch={id:number;filename:string;rows:ImportRow[]}
const base='/api/v1/admin/maintenance'
export async function enhancedRequest<T>(url:string,options:RequestInit={}):Promise<T>{const headers=new Headers(options.headers),token=getAccessToken();if(token)headers.set('Authorization',`Bearer ${token}`);if(options.body&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');const response=await fetch(url,{...options,headers,credentials:'include'});let payload:{success?:boolean;message?:string;data?:T};try{payload=await response.json()}catch{throw new Error('The catalog service is unavailable. Try again.')}if(!response.ok||!payload.success)throw new Error(payload.message??'The catalog request failed.');return payload.data as T}
const send=<T>(path:string,body:unknown,method='POST')=>enhancedRequest<T>(base+path,{method,body:body instanceof FormData?body:JSON.stringify(body)})
const upload=(file:File,mapping?:Mapping[])=>{const form=new FormData();form.set('holdings',file);if(mapping)form.set('mapping',JSON.stringify(mapping));return form}
export const enhancedCatalog={
 options:(maintenance=false)=>enhancedRequest<Options>(maintenance?`${base}/options`:'/api/public/catalog/options'),
 search:(query:URLSearchParams)=>enhancedRequest<{items:CatalogRecord[];pagination:{page:number;limit:number;total:number}}>(`/api/public/catalog/titles?${query}`),
 detail:(id:number)=>enhancedRequest<CatalogRecord>(`/api/public/catalog/titles/${id}`),
 saveDetails:(id:number,body:unknown)=>send<CatalogRecord>(`/titles/${id}/details`,body,'PUT'),
 saveFoundation:(kind:string,id:number|null,body:unknown)=>send<Options>(`/foundation/${kind}${id?`/${id}`:''}`,body,id?'PATCH':'POST'),
 digital:(id:number,file:File,note:string)=>{const form=new FormData();form.set('digital',file);form.set('permissionConfirmed','true');form.set('permissionNote',note);return send<CatalogRecord>(`/titles/${id}/files`,form)},
 archiveDigital:(id:number)=>send(`/files/${id}/archive`,{}),
 inspect:(file:File)=>send<Sheet[]>('/imports/inspect',upload(file)),
 stage:(file:File,mapping:Mapping[])=>send<{batchId:number;ignored:number}>('/imports',upload(file,mapping)),
 batches:()=>enhancedRequest<Array<{id:number;filename:string;total:number;imported:number;skipped:number;ready:number}>>(`${base}/imports`),
 batch:(id:number)=>enhancedRequest<Batch>(`${base}/imports/${id}`),
 review:(row:ImportRow)=>send(`/imports/rows/${row.id}`,row,'PUT'),
 commit:(id:number)=>send<{imported:number;remaining:number;errors:Array<{rowId:number;message:string}>}>(`/imports/${id}/commit`,{}),
}
