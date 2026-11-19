import {enhancedRequest} from './enhanced-catalog-api'
export type ImportAutomationRun={id:string;batchId:number;kind:'correction'|'cover';status:'running'|'paused'|'completed'|'cancelled';processed:number;total:number;counters:{checked:number;changed:number;unresolved:number;conflicts:number};error:string|null;version:number;createdAt:string;updatedAt:string}
export type CorrectionGroup={sheet:string;total:number;missingCategory:number;missingShelf:number}
export type CorrectionPlan={sheet:string;categoryId:number|null;location:string|null}
export type ImportCoverProposal={rowId:number;status:'matched'|'not_found'|'needs_review'|'removed';path:string|null;isbn:string|null;evidence:{mode?:string;title?:string;author?:string};accepted:boolean;version:number;current:boolean;imported:boolean;canApply?:boolean;applied?:boolean;title:string}
export type AutomationPreview={coverTotal?:number;latestCover?:ImportAutomationRun|null;batchId:number;total:number;imported:number;revision:string;groups:CorrectionGroup[];invalidIsbns:number;invalidYears:number;latest:ImportAutomationRun|null}
const base='/api/v1/admin/maintenance'
const send=<T>(path:string,body:unknown,method='POST')=>enhancedRequest<T>(base+path,{method,body:JSON.stringify(body)})
export const importAutomationApi={
 preview:(batch:number)=>enhancedRequest<AutomationPreview>(`${base}/imports/${batch}/automation`),
 start:(batch:number,body:{kind?:'correction'|'cover';retry?:boolean;requestKey:string;revision:string;plans:CorrectionPlan[];clearInvalidOptional:boolean})=>send<ImportAutomationRun>(`/imports/${batch}/automation`,body),
 covers:(batch:number)=>enhancedRequest<{rows:ImportCoverProposal[];total:number}>(`${base}/imports/${batch}/covers`),
 acceptCovers:(batch:number,rows:Array<{rowId:number;version:number}>)=>send<{accepted:number}>(`/imports/${batch}/covers/accept`,{confirmed:true,rows}),
 removeCover:(row:ImportCoverProposal)=>send(`/import-covers/${row.rowId}/remove`,{version:row.version}),
 status:(id:string)=>enhancedRequest<ImportAutomationRun>(`${base}/import-automation/${id}`),
 step:(id:string)=>send<ImportAutomationRun>(`/import-automation/${id}/step`,{}),
 state:(run:ImportAutomationRun,status:'running'|'paused'|'cancelled')=>send<ImportAutomationRun>(`/import-automation/${run.id}/state`,{version:run.version,status},'PATCH'),
}
