import {createHash} from 'node:crypto'
import {db,type Pool,type PoolConnection,type RowDataPacket,type ResultSetHeader} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import {stocktakeItems} from './stocktake-items.ts'
import {buildStocktakeReport,type StockItem,type CountExpected,type CountScan,type StocktakeReport} from './stocktake-report.ts'
import type {InventoryRequestActor} from './inventory-actor.ts'

const fail=(message:string)=>new HttpError(422,'STOCKTAKE_INVALID',message)
function text(value:unknown,label:string,max:number,optional=false){if(typeof value!=='string'||(!optional&&!value.trim())||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))throw fail(`Enter ${label}, up to ${max} characters.`);return value.trim()}
export function stocktakeId(value:unknown){const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw fail('Choose a saved stocktake.');return id}
export const reportToken=(report:StocktakeReport)=>createHash('sha256').update(JSON.stringify({summary:report.summary,rows:report.rows,findings:report.findings})).digest('hex')
type Session=RowDataPacket&{stocktake_session_id:number;status:string;scope_snapshot:string}
async function session(q:PoolConnection,id:number,lock=false){const [rows]=await q.execute<Session[]>(`SELECT * FROM stocktake_sessions WHERE stocktake_session_id=?${lock?' FOR UPDATE':''}`,[id]);if(!rows[0])throw new HttpError(404,'STOCKTAKE_NOT_FOUND','This stocktake was not found.');return rows[0]}
function active(s:Session){if(s.status!=='in_progress')throw new HttpError(409,'STOCKTAKE_FINISHED','This count is finished. Open a new count to scan more items.')}
function snapshot(s:Session){try{return JSON.parse(s.scope_snapshot)}catch{throw new HttpError(409,'STOCKTAKE_SNAPSHOT_INVALID','This saved count needs support before it can be opened.')}}
async function report(q:PoolConnection,s:Session):Promise<StocktakeReport>{
 const stored=snapshot(s);if(stored.finalReport)return stored.finalReport
 const [expected]=await q.execute<RowDataPacket[]>('SELECT * FROM stocktake_expected_items WHERE stocktake_session_id=? ORDER BY stocktake_expected_item_id',[s.stocktake_session_id])
 const items:CountExpected[]=expected.map(e=>({id:Number(e.stocktake_expected_item_id),item:{kind:e.asset_kind,id:Number(e.source_item_id),barcode:e.barcode,accession:e.accession_number,title:e.title,shelf:e.home_shelf_label,column:e.home_shelf_column,row:e.home_shelf_row,condition:e.condition_snapshot,availability:e.availability_snapshot,lifecycle:e.lifecycle_snapshot,version:e.row_version_snapshot,loan:e.loan_state_snapshot,reservation:e.reservation_state_snapshot,categoryId:e.category_id,category:e.category_name}}))
 const [scans]=await q.execute<RowDataPacket[]>('SELECT * FROM stocktake_scans WHERE stocktake_session_id=? ORDER BY stocktake_scan_id',[s.stocktake_session_id])
 const mapped:CountScan[]=scans.map(scan=>{let saved;try{saved=JSON.parse(scan.lookup_snapshot)}catch{saved={}};return {id:Number(scan.stocktake_scan_id),code:scan.entered_barcode,codeType:saved.codeType??'barcode',kind:scan.resolved_asset_kind,itemId:scan.resolved_source_item_id==null?null:Number(scan.resolved_source_item_id),shelf:scan.observed_shelf_label,item:saved.item??null,condition:saved.condition??null}})
 const live=await stocktakeItems(q,{keys:items.map(e=>e.item)})
 return buildStocktakeReport(items,mapped,live)
}
export function createStocktakeService(database:Pool=db){
 async function transaction<T>(work:(q:PoolConnection)=>Promise<T>){const q=await database.getConnection();try{await q.beginTransaction();await q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const result=await work(q);await q.commit();return result}catch(error){await q.rollback();if((error as {code?:string}).code==='40001')throw new HttpError(409,'STOCKTAKE_CHANGED','Another update completed. Refresh the count and try again.');throw error}finally{q.release()}}
 const detail=async(q:PoolConnection,s:Session)=>{const r=await report(q,s);return {session:s,report:r,reviewToken:reportToken(r),reviewNote:snapshot(s).reviewNote??null,legacy:snapshot(s).format!=='stocktake-v1'&&!snapshot(s).finalReport}}
 return {
  async list(){const [rows]=await database.execute<RowDataPacket[]>('SELECT stocktake_session_id AS id,session_name AS name,asset_kind AS kind,scope_label AS location,status,started_at AS started FROM stocktake_sessions ORDER BY stocktake_session_id DESC LIMIT 100');return rows},
  async locations(){const items=await stocktakeItems(database,{active:true});return [...new Set(items.map(i=>i.shelf).filter(Boolean))].sort()},
  async get(id:number){return transaction(async q=>detail(q,await session(q,id)))},
  async start(body:Record<string,unknown>,actor:InventoryRequestActor){
   const name=text(body.name,'a count name',200),location=text(body.location??'','a location',100,true),kind=body.kind
   if(!['book','research','both'].includes(String(kind)))throw fail('Choose Books, Research or both.')
   return transaction(async q=>{
    const items=await stocktakeItems(q,{assetKind:String(kind),location,active:true});if(!items.length)throw fail('No active physical items match this scope. Choose another location or collection.')
    const [insert]=await q.execute<ResultSetHeader>(`INSERT INTO stocktake_sessions(session_name,scope_kind,scope_label,asset_kind,scope_snapshot,started_by_user_id,started_by_label) VALUES (?,'collection',?,?,?,?,?)`,[name,location||'All locations',kind,JSON.stringify({format:'stocktake-v1',location,kind}),actor.userId,actor.label]);const id=insert.insertId
    await q.execute(`INSERT INTO stocktake_expected_items(stocktake_session_id,asset_kind,source_item_id,barcode,accession_number,title,category_id,category_name,home_shelf_label,home_shelf_column,home_shelf_row,condition_snapshot,availability_snapshot,lifecycle_snapshot,row_version_snapshot,loan_state_snapshot,reservation_state_snapshot)
      SELECT ?,x.kind,x.id,x.barcode,x.accession,x.title,x."categoryId",x.category,x.shelf,x."column",x.row,x.condition,x.availability,x.lifecycle,x.version,x.loan,x.reservation FROM jsonb_to_recordset(?::jsonb) AS x(kind text,id bigint,barcode text,accession text,title text,"categoryId" bigint,category text,shelf text,"column" smallint,row smallint,condition text,availability text,lifecycle text,version integer,loan text,reservation text)`,[id,JSON.stringify(items)])
    return detail(q,await session(q,id))
   })
  },
  async scan(id:number,body:Record<string,unknown>,actor:InventoryRequestActor){
   const code=text(body.code,'a barcode or accession',100),shelf=text(body.location,'the location being checked',100),requestKey=text(body.requestKey,'a scan reference',100),codeType=body.codeType==='accession'?'accession':'barcode'
   if(!['good','fair','for_repair','damaged'].includes(String(body.condition)))throw fail('Choose the physical condition of this item.');const condition=String(body.condition)
   return transaction(async q=>{const s=await session(q,id,true);active(s)
    const [prior]=await q.execute<RowDataPacket[]>('SELECT entered_barcode,observed_shelf_label,lookup_snapshot FROM stocktake_scans WHERE stocktake_session_id=? AND request_key=?',[id,requestKey])
    if(prior.length){const saved=JSON.parse(prior[0].lookup_snapshot);if(prior[0].entered_barcode!==code||prior[0].observed_shelf_label!==shelf||saved.codeType!==codeType||saved.condition!==condition)throw fail('This scan reference belongs to another scan. Refresh and try again.');return detail(q,s)}
    const matches=await stocktakeItems(q,{code,codeType});if(matches.length>1)throw fail('This code matches more than one item. Check its unique accession label.')
    const item=matches[0]??null
    await q.execute(`INSERT INTO stocktake_scans(stocktake_session_id,request_key,entered_barcode,resolved_asset_kind,resolved_source_item_id,observed_shelf_label,scan_source,lookup_snapshot,scanned_by_user_id,scanned_by_label) VALUES (?,?,?,?,?,?,'scanner',?,?,?)`,[id,requestKey,code,item?.kind??null,item?.id??null,shelf,JSON.stringify({codeType,item,condition}),actor.userId,actor.label])
    return detail(q,s)
   })
  },
  async finish(id:number,body:Record<string,unknown>,actor:InventoryRequestActor){return transaction(async q=>{
   const s=await session(q,id,true);if(s.status==='reviewed'&&snapshot(s).finalReport)return detail(q,s);active(s)
   const r=await report(q,s);if(body.reviewToken!==reportToken(r))throw new HttpError(409,'STOCKTAKE_REVIEW_CHANGED','The count changed. Refresh and review the latest results before finishing.')
   const note=text(body.note,'a review note',500);if(body.reviewed!==true)throw fail('Review the results before finishing.')
   for(const f of r.findings){await q.execute(`INSERT INTO stocktake_discrepancies(stocktake_session_id,finding_key,finding_code,stocktake_expected_item_id,stocktake_scan_id,evidence_snapshot) VALUES (?,?,?,?,?,?) ON CONFLICT(stocktake_session_id,finding_key) DO UPDATE SET evidence_snapshot=EXCLUDED.evidence_snapshot`,[id,f.key,f.code,f.expectedId,f.scanId,JSON.stringify(f)])}
   await q.execute(`UPDATE stocktake_sessions SET status='reviewed',closed_at=NOW(),closed_by_user_id=?,closed_by_label=?,reviewed_at=NOW(),reviewed_by_user_id=?,reviewed_by_label=?,scope_snapshot=?,row_version=row_version+1,updated_at=NOW() WHERE stocktake_session_id=?`,[actor.userId,actor.label,actor.userId,actor.label,JSON.stringify({...snapshot(s),finalReport:r,reviewNote:note}),id])
   return detail(q,await session(q,id))
  })},
  async cancel(id:number,body:Record<string,unknown>,actor:InventoryRequestActor){const reason=text(body.reason,'a cancellation reason',500);return transaction(async q=>{const s=await session(q,id,true);if(s.status==='cancelled')return detail(q,s);active(s);const r=await report(q,s);await q.execute(`UPDATE stocktake_sessions SET status='cancelled',cancelled_at=NOW(),cancelled_by_user_id=?,cancelled_by_label=?,cancel_reason=?,scope_snapshot=?,row_version=row_version+1,updated_at=NOW() WHERE stocktake_session_id=?`,[actor.userId,actor.label,reason,JSON.stringify({...snapshot(s),finalReport:r}),id]);return detail(q,await session(q,id))})},
 }
}
