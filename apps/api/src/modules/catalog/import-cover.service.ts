import {createHash} from 'node:crypto'
import type {PoolConnection,RowDataPacket} from '../../config/db.js'
import {createIsbnLookupService,isbnLookupService} from './isbn-lookup.service.ts'
import {IsbnLookupRepository} from './isbn-lookup.repository.ts'
import {storeCoverImage,removeStoredCover} from './cover-image.storage.ts'
import {normalizeIsbn,isValidIsbn} from './catalog.validation.ts'
import {key} from './holdings-parser.ts'
import {HttpError} from '../../core/http-error.ts'
export const importCoverKey=(data:Record<string,unknown>)=>createHash('sha256').update(JSON.stringify(['isbn','title','author','edition','publisher','publicationYear'].map(field=>String(data[field]??'').trim()))).digest('hex')
export type ImportCoverDependencies={cover:typeof isbnLookupService.cover;searchTitles:typeof isbnLookupService.searchTitles;store:typeof storeCoverImage;remove:typeof removeStoredCover}
export const importCoverDependencies:ImportCoverDependencies={cover:isbnLookupService.cover,searchTitles:isbnLookupService.searchTitles,store:storeCoverImage,remove:removeStoredCover}
export async function proposeImportCover(q:Pick<PoolConnection,'execute'>,row:RowDataPacket,runId:string,actor:number,rollback:Array<()=>Promise<unknown>>,deps:ImportCoverDependencies=importCoverDependencies,retry=false){
 const data=row.data_json as Record<string,unknown>,sourceKey=importCoverKey(data)
 const [old]=await q.execute<RowDataPacket[]>('SELECT * FROM catalog_import_covers WHERE import_row_id=? FOR UPDATE',[row.import_row_id])
 if(old[0]?.source_key===sourceKey&&(!retry||['matched','removed'].includes(old[0].status)))return {changed:false,unresolved:old[0].status!=='matched'}
 let isbn=normalizeIsbn(data.isbn),status='matched',path:string|null=null,evidence:Record<string,unknown>={mode:'Exact ISBN'},match:Record<string,unknown>|null=null
 if(!isValidIsbn(isbn)){
  if(!String(data.title??'').trim()||!String(data.author??'').trim()||String(data.edition??'').trim())status='needs_review'
  else{
   let found:Awaited<ReturnType<ImportCoverDependencies['searchTitles']>>|null=null
   // The server may have only one pooled connection; reuse this transaction for local lookup.
   const searchTitles=deps===importCoverDependencies?createIsbnLookupService({repository:new IsbnLookupRepository(q)}).searchTitles:deps.searchTitles
   try{found=await searchTitles({title:data.title,author:data.author})}
   catch(error){
    if(!(error instanceof HttpError)||error.code!=='TITLE_LOOKUP_UNAVAILABLE')throw error
    evidence={mode:'Title search needs retry',reason:'title_lookup_unavailable'}
   }
   const matches=(found?.candidates??[]).filter(c=>key(c.title)===key(data.title)&&key(c.author)===key(data.author)&&c.isbn&&isValidIsbn(c.isbn)&&(!data.publicationYear||Number(data.publicationYear)===c.publicationYear)&&(!data.publisher||key(data.publisher)===key(c.publisher)))
   const unique=new Map(matches.map(c=>[normalizeIsbn(c.isbn),c]))
   // An unrecorded edition cannot be silently chosen from title search.
   if(unique.size!==1)status='needs_review'
   else{match=[...unique.values()][0];isbn=normalizeIsbn(match.isbn);evidence={mode:'Unique exact title and author match',provider:found?.source,candidate:match}}
  }
 }
 if(status==='matched'){
  try{const image=await deps.cover(isbn);path=await deps.store(`data:${image.contentType};base64,${image.bytes.toString('base64')}`);if(!path)throw new Error('Cover storage failed');rollback.push(()=>deps.remove(path))}
  catch(e){if(e instanceof HttpError&&e.status===404)status='not_found';else throw e}
 }
 await q.execute(`INSERT INTO catalog_import_covers(import_row_id,run_id,source_key,status,cover_path,matched_isbn,evidence_json,updated_by_account_id) VALUES (?,?,?,?,?,?,?::jsonb,?) ON CONFLICT(import_row_id) DO UPDATE SET run_id=EXCLUDED.run_id,source_key=EXCLUDED.source_key,status=EXCLUDED.status,cover_path=EXCLUDED.cover_path,matched_isbn=EXCLUDED.matched_isbn,evidence_json=EXCLUDED.evidence_json,accepted_at=NULL,accepted_by_account_id=NULL,row_version=catalog_import_covers.row_version+1,updated_by_account_id=EXCLUDED.updated_by_account_id,updated_at=NOW()`,[row.import_row_id,runId,sourceKey,status,path,status==='matched'?isbn:null,JSON.stringify({...evidence,title:data.title,author:data.author}),actor])
 return {changed:status==='matched',unresolved:status!=='matched'}
}
export async function acceptedImportCover(q:Pick<PoolConnection,'execute'>,rowId:number,data:Record<string,unknown>){const [rows]=await q.execute<RowDataPacket[]>("SELECT cover_path FROM catalog_import_covers WHERE import_row_id=? AND source_key=? AND status='matched' AND accepted_at IS NOT NULL FOR SHARE",[rowId,importCoverKey(data)]);return rows[0]?.cover_path??null}
