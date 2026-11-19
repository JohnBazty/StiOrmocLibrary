import {importCoverTargets,lockedImportCoverTarget} from './import-cover-targets.ts'
import {proposeImportCover,importCoverKey,importCoverDependencies,type ImportCoverDependencies} from './import-cover.service.ts'
import {createHash,randomUUID} from 'node:crypto'
import {db,type Pool,type PoolConnection,type RowDataPacket} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import {requireLibraryActor} from '../../core/library-permissions.ts'
import {lookupBlanks,REQUIRED_IMPORT_LOOKUP_FIELDS,type Lookups} from './import-lookup-fill.ts'
import {isbnLookupService} from './isbn-lookup.service.ts'
import {correctImportDraft,type SheetCorrection} from './import-auto-correction.ts'
import {holdingsIdentity,key,validateHoldingsData,type HoldingsData} from './holdings-parser.ts'
import {isValidIsbn,normalizeIsbn} from './catalog.validation.ts'
const fail=(message:string,status=422)=>new HttpError(status,'IMPORT_AUTOMATION_REVIEW',message)
const number=(v:unknown)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw fail('Choose a valid saved book list.');return n}
const uuid=(v:unknown)=>{if(typeof v!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))throw fail('Choose a valid correction run.');return v}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const invalidYear=(v:unknown)=>Boolean(v)&&(!/^\d{4}$/.test(String(v))||Number(v)<1000||Number(v)>new Date().getFullYear())
async function rows(q:Pick<PoolConnection,'execute'>,sql:string,args:unknown[]=[]){const[r]=await q.execute<RowDataPacket[]>(sql,args);return r}
const revision=(entries:RowDataPacket[])=>hash(entries.map(r=>[Number(r.id),Number(r.version),r.status]))
function dto(r:RowDataPacket){return {id:r.run_id,batchId:Number(r.batch_id),kind:r.automation_kind,status:r.status,processed:Number(r.cursor_position),total:Number(r.total_rows),counters:r.counters_json,error:r.error_text,version:Number(r.row_version),createdAt:r.created_at,updatedAt:r.updated_at}}
export function createImportAutomationService(database:Pool=db,lookups:Lookups=isbnLookupService,clock=Date.now,covers:ImportCoverDependencies=importCoverDependencies){
 async function transaction<T>(actor:number,work:(q:PoolConnection,rollback:Array<()=>Promise<unknown>>)=>Promise<T>){const rollback:Array<()=>Promise<unknown>>=[];const q=await database.getConnection();try{await q.beginTransaction();await requireLibraryActor(q,actor,'library.manage');const result=await work(q,rollback);await requireLibraryActor(q,actor,'library.manage');await q.commit();return result}catch(e){await q.rollback();for(const clean of rollback)try{await clean()}catch{};if((e as {code?:string}).code&&['55P03','40P01'].includes(String((e as {code?:string}).code)))throw fail('This list is already processing. Refresh its progress before continuing.',409);throw e}finally{q.release()}}
 async function entries(q:PoolConnection,batch:number){return rows(q,`SELECT import_row_id AS id,sheet_name AS sheet,row_version AS version,status,data_json AS data,error_text AS error FROM catalog_import_rows WHERE batch_id=? ORDER BY import_row_id`,[batch])}
 async function references(q:PoolConnection){const categories=await rows(q,'SELECT category_id AS id,category_name AS name FROM categories ORDER BY category_id'),locations=await rows(q,"SELECT name FROM catalog_locations WHERE lifecycle_status='Active' ORDER BY name");return {categories,locations}}
 async function checkedPlans(q:PoolConnection,raw:unknown,source:RowDataPacket[]){
  if(!Array.isArray(raw)||raw.length>100)throw fail('Review the category and shelf choices for each spreadsheet section.')
  const refs=await references(q),plans:SheetCorrection[]=[],names=new Set<string>()
  for(const item of raw){if(!item||typeof item!=='object')throw fail('Review each spreadsheet section.');const v=item as Record<string,unknown>,sheet=String(v.sheet??'');if(names.has(sheet)||!source.some(r=>r.sheet===sheet))throw fail('Choose each spreadsheet section once.');names.add(sheet)
   const categoryId=v.categoryId==null||v.categoryId===''?null:number(v.categoryId),category=categoryId?refs.categories.find(c=>Number(c.id)===categoryId):null,location=v.location?String(v.location):null
   if(categoryId&&!category)throw fail('A chosen category is no longer available. Review the choices.',409)
   if(location&&!refs.locations.some(l=>l.name===location))throw fail('A chosen shelf is no longer active. Review the choices.',409)
   plans.push({sheet,categoryId,categoryName:category?.name??null,location})
  }
  for(const r of source){const plan=plans.find(p=>p.sheet===r.sheet);if(!plan)throw fail('Review every spreadsheet section.');if((!r.data.categoryId&&!plan?.categoryId)||(!String(r.data.location??'').trim()&&!plan?.location))throw fail(`Choose the missing category and shelf for ${String(r.sheet).slice(0,100)}.`)}
  return plans.sort((a,b)=>a.sheet.localeCompare(b.sheet))
 }
 return {
  preview:(actor:number,value:unknown)=>transaction(actor,async q=>{
   const batch=number(value);if(!(await rows(q,'SELECT batch_id FROM catalog_import_batches WHERE batch_id=?',[batch])).length)throw fail('Saved book list not found.',404)
   const all=await entries(q,batch),pending=all.filter(r=>r.status==='Review'),groups=new Map<string,{sheet:string;total:number;missingCategory:number;missingShelf:number}>()
   for(const r of pending){const group=groups.get(r.sheet)??{sheet:r.sheet,total:0,missingCategory:0,missingShelf:0};group.total++;if(!r.data.categoryId)group.missingCategory++;if(!String(r.data.location??'').trim())group.missingShelf++;groups.set(r.sheet,group)}
   const active=(await rows(q,"SELECT * FROM catalog_import_automation_runs WHERE batch_id=? AND automation_kind='correction' ORDER BY created_at DESC LIMIT 1",[batch]))[0]
   const coverRun=(await rows(q,"SELECT * FROM catalog_import_automation_runs WHERE batch_id=? AND automation_kind='cover' ORDER BY created_at DESC LIMIT 1",[batch]))[0]
   const coverTargets=await importCoverTargets(q,batch)
   return {coverTotal:coverTargets.filter(r=>r.cover_eligible).length,latestCover:coverRun?dto(coverRun):null,batchId:batch,total:pending.length,imported:all.filter(r=>r.status==='Imported').length,revision:revision(all),groups:[...groups.values()],invalidIsbns:pending.filter(r=>r.data.isbn&&!isValidIsbn(normalizeIsbn(r.data.isbn))).length,invalidYears:pending.filter(r=>invalidYear(r.data.publicationYear)||invalidYear(r.data.copyrightYear)).length,latest:active?dto(active):null}
  }),
  start:(actor:number,value:unknown,body:Record<string,unknown>)=>transaction(actor,async q=>{
   const kind=body.kind==='cover'?'cover':'correction',batch=number(value),requestKey=uuid(body.requestKey),planDigest=hash({batch,kind,retry:body.retry===true,revision:body.revision,plans:body.plans,clearInvalidOptional:body.clearInvalidOptional===true})
   await q.execute('SELECT batch_id FROM catalog_import_batches WHERE batch_id=? FOR UPDATE',[batch])
   const replay=(await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE request_key=?',[requestKey]))[0]
   if(replay){if(replay.plan_digest!==planDigest||Number(replay.started_by_account_id)!==actor)throw fail('This request belongs to another correction plan.',409);return dto(replay)}
   if((await rows(q,"SELECT run_id FROM catalog_import_automation_runs WHERE batch_id=? AND status IN ('running','paused')",[batch])).length)throw fail('Continue or cancel the existing correction run before starting another.',409)
   const all=await entries(q,batch);if(revision(all)!==body.revision)throw fail('The saved list changed. Refresh the correction review before starting.',409)
   const coverTargets=kind==='cover'?await importCoverTargets(q,batch):[]
   const pending=kind==='cover'?coverTargets.filter(r=>r.cover_eligible).map(r=>({id:r.import_row_id,version:r.row_version,data:r.data_json})):all.filter(r=>r.status==='Review');if(!pending.length||pending.length>5000)throw fail('Choose a saved list with 1 to 5,000 pending entries.')
   const plans=kind==='correction'?await checkedPlans(q,body.plans,pending):[],id=randomUUID()
   const identities=new Map<string,number>();for(const r of all){const identity=holdingsIdentity(r.data);identities.set(identity,(identities.get(identity)??0)+1)}
   const duplicateRows=pending.filter(r=>(identities.get(holdingsIdentity(r.data))??0)>1).map(r=>Number(r.id))
   await q.execute(`INSERT INTO catalog_import_automation_runs(run_id,batch_id,automation_kind,request_key,plan_digest,options_json,rows_json,total_rows,started_by_account_id,updated_by_account_id) VALUES (?,?,?,?,?,?::jsonb,?::jsonb,?,?,?)`,[id,batch,kind,requestKey,planDigest,JSON.stringify({retry:body.retry===true,plans,duplicateRows,clearInvalidOptional:body.clearInvalidOptional===true}),JSON.stringify(pending.map(r=>({id:Number(r.id),version:Number(r.version),...(kind==='cover'?{sourceKey:importCoverKey(r.data)}:{})}))),pending.length,actor,actor])
   return dto((await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE run_id=?',[id]))[0])
  }),
  coverResults:(actor:number,value:unknown)=>transaction(actor,async q=>{
   const batch=number(value),targets=await importCoverTargets(q,batch),byId=new Map(targets.map(r=>[Number(r.import_row_id),r])),proposals=await rows(q,`SELECT c.* FROM catalog_import_covers c JOIN catalog_import_rows r ON r.import_row_id=c.import_row_id WHERE r.batch_id=? ORDER BY c.import_row_id`,[batch])
   return {rows:proposals.map(c=>{const target=byId.get(Number(c.import_row_id)),imported=target?.status==='Imported',same=Boolean(target&&c.source_key===importCoverKey(target.data_json)),applied=Boolean(imported&&same&&target?.catalog_cover===c.cover_path&&c.status==='matched');return {rowId:Number(c.import_row_id),status:c.status,path:c.cover_path,isbn:c.matched_isbn,evidence:c.evidence_json,accepted:imported?applied:Boolean(c.accepted_at),version:Number(c.row_version),current:same&&Boolean(target?.cover_eligible||applied),imported,canApply:Boolean(target?.cover_eligible),applied,title:target?.data_json.title??''}}),total:targets.filter(r=>r.cover_eligible).length}
  }),
  acceptCovers:(actor:number,value:unknown,body:Record<string,unknown>)=>transaction(actor,async q=>{
   if(body.confirmed!==true)throw fail('Review the suggested covers before using them.')
   if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>5000)throw fail('Review the current cover proposals first.')
   const selected=new Map<number,number>();for(const entry of body.rows){if(!entry||typeof entry!=='object')throw fail('Review the current cover proposals.');const v=entry as Record<string,unknown>;selected.set(number(v.rowId),number(v.version))}
   const batch=number(value);await q.execute('SELECT batch_id FROM catalog_import_batches WHERE batch_id=? FOR UPDATE',[batch])
   const proposals=await rows(q,`SELECT c.*,r.batch_id,r.result_json,r.status AS import_status FROM catalog_import_rows r JOIN catalog_import_covers c ON c.import_row_id=r.import_row_id WHERE r.batch_id=? AND r.status IN ('Review','Ready','Imported') ORDER BY c.import_row_id FOR UPDATE OF r,c`,[batch])
   const choices:Array<{proposal:RowDataPacket;target:RowDataPacket}>=[]
   for(const [id,version] of selected){
    const c=proposals.find(r=>Number(r.import_row_id)===id)
    if(!c||Number(c.row_version)!==version||c.status!=='matched')throw fail('A cover or book changed. Refresh the previews before selecting them.',409)
    const target=await lockedImportCoverTarget(q,{...c,status:c.import_status})
    if(!target||!target.cover_eligible||c.source_key!==importCoverKey(target.data_json))throw fail('A cover or book changed. Refresh the previews before selecting them.',409)
    choices.push({proposal:c,target})
   }
   let accepted=0
   for(const {proposal:c,target} of choices){
    if(target.status==='Imported'){
     const [result]=await q.execute<import('../../config/db.js').ResultSetHeader>("UPDATE titles SET cover_image_path=?,row_version=row_version+1,updated_at=NOW() WHERE title_id=? AND (cover_image_path IS NULL OR cover_image_path='')",[c.cover_path,target.cover_title_id])
     if(!result.affectedRows)continue
    }else if(c.accepted_at)continue
    await q.execute('UPDATE catalog_import_covers SET accepted_at=NOW(),accepted_by_account_id=?,updated_by_account_id=?,row_version=row_version+1,updated_at=NOW() WHERE import_row_id=?',[actor,actor,c.import_row_id]);accepted++
   }
   return {accepted}
  }),
  removeCover:(actor:number,value:unknown,body:Record<string,unknown>)=>transaction(actor,async q=>{
   const rowId=number(value),record=(await rows(q,`SELECT c.*,r.batch_id,r.result_json,r.status AS import_status FROM catalog_import_rows r JOIN catalog_import_covers c ON c.import_row_id=r.import_row_id WHERE r.import_row_id=? FOR UPDATE OF r,c`,[rowId]))[0]
   if(!record||!['Review','Ready','Imported'].includes(record.import_status))throw fail('Choose an available cover suggestion.',409)
   if(record.import_status==='Imported'){const target=await lockedImportCoverTarget(q,{...record,status:record.import_status});if(!target?.cover_eligible)throw fail('This book already has a cover. Existing catalog covers are kept.',409)}
   if(record.status==='removed')return {removed:true}
   if(Number(body.version)!==Number(record.row_version))throw fail('The cover proposal changed. Refresh before removing it.',409)
   await q.execute("UPDATE catalog_import_covers SET status='removed',accepted_at=NULL,accepted_by_account_id=NULL,row_version=row_version+1,updated_by_account_id=?,updated_at=NOW() WHERE import_row_id=?",[actor,rowId]);return {removed:true}
  }),
  status:(actor:number,value:unknown)=>transaction(actor,async q=>{const r=(await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE run_id=?',[uuid(value)]))[0];if(!r)throw fail('Correction run not found.',404);return dto(r)}),
  changeState:(actor:number,value:unknown,body:Record<string,unknown>)=>transaction(actor,async q=>{
   const r=(await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE run_id=? FOR UPDATE NOWAIT',[uuid(value)]))[0];if(!r)throw fail('Correction run not found.',404)
   if(!['running','paused','cancelled'].includes(String(body.status)))throw fail('Choose Continue, Pause or Cancel.')
   if(['completed','cancelled'].includes(r.status))return dto(r)
   if(Number(body.version)!==Number(r.row_version))throw fail('Progress changed. Refresh before continuing.',409)
   await q.execute('UPDATE catalog_import_automation_runs SET status=?,error_text=NULL,row_version=row_version+1,updated_by_account_id=?,updated_at=NOW() WHERE run_id=?',[body.status,actor,r.run_id]);return dto((await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE run_id=?',[r.run_id]))[0])
  }),
  step:(actor:number,value:unknown)=>transaction(actor,async(q,rollback)=>{
   const run=(await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE run_id=? FOR UPDATE NOWAIT',[uuid(value)]))[0];if(!run)throw fail('Correction run not found.',404)
   if(run.status!=='running')return dto(run)
   const saved=run.rows_json as Array<{id:number;version:number;sourceKey?:string}>,options=run.options_json as {retry?:boolean;plans:SheetCorrection[];duplicateRows?:number[];clearInvalidOptional:boolean},stats={...run.counters_json}
   let cursor=Number(run.cursor_position),status='running',error:string|null=null;const started=clock(),refs=await references(q),existingTitles=await rows(q,"SELECT title,isbn FROM titles WHERE record_type='Book'")
   for(let n=0;cursor<saved.length&&n<(run.automation_kind==='cover'?2:100);n++){
    if(clock()-started>15_000)break
    const expected=saved[cursor],row=(await rows(q,'SELECT import_row_id,batch_id,result_json,sheet_name,row_version,status,data_json,error_text FROM catalog_import_rows WHERE import_row_id=? AND batch_id=? FOR UPDATE',[expected.id,run.batch_id]))[0]
    if(run.automation_kind==='cover'){
     const target=row&&['Review','Ready','Imported'].includes(row.status)?await lockedImportCoverTarget(q,row):null
     const sameSource=Boolean(target&&(!expected.sourceKey||expected.sourceKey===importCoverKey(target.data_json)))
     if(!target||!target.cover_eligible||!sameSource||(row.status!=='Imported'&&Number(row.row_version)!==expected.version)){stats.checked++;stats.conflicts++;if(!target||!sameSource)stats.unresolved++;cursor++;continue}
     try{const result=await proposeImportCover(q,target,String(run.run_id),actor,rollback,covers,options.retry);stats.checked++;if(result.changed)stats.changed++;if(result.unresolved)stats.unresolved++;cursor++;continue}
     catch{status='paused';error='Cover lookup or storage is unavailable. Earlier results are kept. Continue later.';break}
    }
    if(!row||row.status!=='Review'||Number(row.row_version)!==expected.version){stats.checked++;stats.conflicts++;stats.unresolved++;cursor++;continue}
    const plan=options.plans.find(p=>p.sheet===row.sheet_name)
    if(!plan||(plan.categoryId&&!refs.categories.some(c=>Number(c.id)===plan.categoryId))||(plan.location&&!refs.locations.some(l=>l.name===plan.location))){status='paused';error='A reviewed category or shelf changed. Cancel this run and review the choices again.';break}
    const result=correctImportDraft(row.data_json as HoldingsData,plan,options.clearInvalidOptional),data=result.data as HoldingsData&Record<string,unknown>
    if(!data.title.trim()||!data.author.trim()){
     try{const found=await lookupBlanks(data as unknown as Record<string,string>,lookups,REQUIRED_IMPORT_LOOKUP_FIELDS,true);Object.assign(data,found.additions);if(Object.keys(found.record).length){data.lookupFilled={...(data.lookupFilled as object??{}),...found.record};data.lookupTried=true;delete data.lookupCheckedAt;delete data.lookupCheckedBy}}
     catch{status='paused';error='Book lookup is unavailable. Completed corrections are kept. Continue later.';break}
    }
    const issues=validateHoldingsData(data,true)
    if(data.categoryId&&!refs.categories.some(c=>Number(c.id)===Number(data.categoryId)))issues.push('Choose an existing category.')
    if(data.location&&!refs.locations.some(l=>l.name===data.location))issues.push('Choose an active managed shelf location.')
    const changed=JSON.stringify(data)!==JSON.stringify(row.data_json),needsReview=issues.length>0||Boolean(data.lookupFilled&&!data.lookupCheckedAt)||Boolean(options.duplicateRows?.includes(expected.id))||existingTitles.some(t=>(data.isbn&&t.isbn===data.isbn)||key(t.title)===key(data.title))
    const nextError=issues.length?issues.join(' '):null
    if(changed||nextError!==row.error_text)await q.execute(`UPDATE catalog_import_rows SET data_json=?::jsonb,error_text=?,row_version=row_version+1,updated_at=NOW() WHERE import_row_id=? AND row_version=? AND status='Review'`,[JSON.stringify(data),nextError,expected.id,expected.version])
    stats.checked++;if(changed)stats.changed++;if(needsReview)stats.unresolved++;cursor++
   }
   if(cursor===saved.length)status='completed'
   await q.execute(`UPDATE catalog_import_automation_runs SET cursor_position=?,counters_json=?::jsonb,status=?,error_text=?,row_version=row_version+1,updated_by_account_id=?,updated_at=NOW(),completed_at=CASE WHEN ?='completed' THEN NOW() ELSE completed_at END WHERE run_id=?`,[cursor,JSON.stringify(stats),status,error,actor,status,run.run_id])
   return dto((await rows(q,'SELECT * FROM catalog_import_automation_runs WHERE run_id=?',[run.run_id]))[0])
  })
 }
}
export const importAutomationService=createImportAutomationService()
