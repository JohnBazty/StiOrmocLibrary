import { request } from './catalog-api'

export type DeweySelection = {code:string;source:'manual'|'open_library';reviewed:boolean}
export type DeweyResult = {isbn:string;status:'matched'|'multiple'|'not_found'|'unavailable';candidates:Array<{code:string;source:'open_library';sourceUrl:string}>}
export type AutomaticDeweyBook={id:number;title:string;isbn:string|null;copies:number}
export type AutomaticDeweyResult={title:string;titleId:number|null;outcome:string;assignedCopies:number;remainingForTitle?:boolean;nextToken:string|null}
export type DeweyEntry = {id:number;code:string;description:string|null;status:'Active'|'Archived';version:number}
export type DeweyCopy = {id:number;accession:string;title:string;isbn:string|null;version:number;code:string|null;description:string|null}
const base='/api/v1/admin/dewey'
export const deweyApi={
  automaticBooks:(params:URLSearchParams)=>request<{items:AutomaticDeweyBook[];total:number;libraryTotal:number;page:number}>(`${base}/automatic/books?${params}`),
  automaticStart:(selection:{all:true}|{titleIds:number[]})=>request<{token:string;books:number;copies:number}>(`${base}/automatic/start`,{method:'POST',body:JSON.stringify(selection)}),
  automaticStep:(token:string)=>request<AutomaticDeweyResult>(`${base}/automatic/step`,{method:'POST',body:JSON.stringify({token})}),
  lookup:async(isbn:string,signal?:AbortSignal)=>request<DeweyResult>(`${base}/lookup/${encodeURIComponent(isbn)}`,{signal}),
  classifications:(q='')=>request<DeweyEntry[]>(`${base}/classifications?${new URLSearchParams({q})}`),
  saveClassification:(entry:Partial<DeweyEntry>)=>request(`${base}/classifications${entry.id?`/${entry.id}`:''}`,{method:entry.id?'PATCH':'POST',body:JSON.stringify(entry)}),
  copies:(params:URLSearchParams)=>request<{items:DeweyCopy[];total:number;page:number}>(`${base}/copies?${params}`),
  assign:(isbn:string|null,selection:DeweySelection,copies:Array<{id:number;version:number}>)=>request(`${base}/assign`,{method:'POST',body:JSON.stringify({isbn,selection,copies})}),
}
