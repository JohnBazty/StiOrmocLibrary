import type {PoolConnection,RowDataPacket} from '../../config/db.js'
import {HttpError} from '../../core/http-error.ts'
import type {StockItem} from './stocktake-report.ts'
const union=`SELECT 'book' AS kind,pc.physical_copy_id AS id,pc.barcode,pc.accession_number AS accession,t.title,pc.shelf_location AS shelf,pc.shelf_column AS col,pc.shelf_row AS shelfrow,pc.condition_status AS condition,pc.availability_status AS availability,CASE WHEN t.lifecycle_status<>'Active' THEN t.lifecycle_status ELSE pc.lifecycle_status END AS lifecycle,pc.row_version AS version,t.category_id,cat.category_name AS category,
 CASE WHEN EXISTS(SELECT 1 FROM borrow_transactions bt WHERE (bt.physical_copy_id=pc.physical_copy_id OR bt.material_id=pc.material_id) AND bt.transaction_status IN ('Borrowed','Overdue') AND bt.returned_at IS NULL) THEN 'borrowed' WHEN EXISTS(SELECT 1 FROM in_library_uses iu WHERE iu.physical_copy_id=pc.physical_copy_id AND iu.ended_at IS NULL) THEN 'in_library' WHEN pc.availability_status='Borrowed' THEN 'borrowed_status_needs_verification' ELSE 'none' END AS loan,
 CASE WHEN EXISTS(SELECT 1 FROM reservations r WHERE r.assigned_physical_copy_id=pc.physical_copy_id AND r.reservation_status IN ('pending','approved','ready_for_pickup')) THEN 'reserved' ELSE 'none' END AS reservation
 FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id LEFT JOIN categories cat ON cat.category_id=t.category_id
 UNION ALL SELECT 'research',ri.research_inventory_id,ri.barcode,ri.accession_number,ri.title,ri.shelf_location,ri.shelf_column,ri.shelf_row,ri.condition_state,ri.availability_status,CASE WHEN COALESCE(t.lifecycle_status,'Active')<>'Active' THEN t.lifecycle_status ELSE ri.lifecycle_status END,ri.row_version,t.category_id,cat.category_name,
 CASE WHEN EXISTS(SELECT 1 FROM in_library_uses iu WHERE iu.research_inventory_id=ri.research_inventory_id AND iu.ended_at IS NULL) THEN 'in_library' WHEN LOWER(ri.availability_status) IN ('borrowed','in_use','in use') THEN 'in_use_status_needs_verification' ELSE 'none' END,'none'
 FROM research_inventory ri LEFT JOIN titles t ON t.title_id=ri.title_id LEFT JOIN categories cat ON cat.category_id=t.category_id`
export type ItemFilter={assetKind?:string;location?:string;active?:boolean;code?:string;codeType?:'barcode'|'accession';keys?:Array<{kind:string;id:number}>}
export async function stocktakeItems(q:Pick<PoolConnection,'execute'>,filter:ItemFilter){
 const where:string[]=[],args:unknown[]=[]
 if(filter.assetKind&&filter.assetKind!=='both'){where.push('kind=?');args.push(filter.assetKind)}
 if(filter.location){where.push('shelf=?');args.push(filter.location)}
 if(filter.active)where.push("lifecycle='Active'")
 if(filter.code){where.push(`${filter.codeType==='accession'?'accession':'barcode'}=?`);args.push(filter.code)}
 if(filter.keys){where.push("((kind='book' AND id=ANY(?::bigint[])) OR (kind='research' AND id=ANY(?::bigint[])))");args.push(filter.keys.filter(k=>k.kind==='book').map(k=>k.id),filter.keys.filter(k=>k.kind==='research').map(k=>k.id))}
 const [rows]=await q.execute<RowDataPacket[]>(`SELECT * FROM (${union}) items ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY kind,id LIMIT 10001`,args)
 if(rows.length>10000)throw new HttpError(422,'STOCKTAKE_SCOPE_TOO_LARGE','This count has more than 10,000 items. Choose a smaller location scope.')
 return rows.map(r=>({kind:r.kind,id:Number(r.id),barcode:String(r.barcode??''),accession:String(r.accession??''),title:String(r.title),shelf:String(r.shelf??''),column:Number(r.col??1),row:Number(r.shelfrow??1),condition:String(r.condition),availability:String(r.availability),lifecycle:String(r.lifecycle),version:Number(r.version),loan:String(r.loan),reservation:String(r.reservation),categoryId:r.category_id==null?null:Number(r.category_id),category:r.category??null})) as StockItem[]
}
