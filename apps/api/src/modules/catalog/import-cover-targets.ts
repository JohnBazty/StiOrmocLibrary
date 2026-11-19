import type {PoolConnection,RowDataPacket} from '../../config/db.js'
type Query=Pick<PoolConnection,'execute'>
export async function importCoverTargets(q:Query,batch:number,rowId?:number):Promise<RowDataPacket[]>{
 const [records]=await q.execute<RowDataPacket[]>(`SELECT r.*,t.title_id AS cover_title_id,t.title AS catalog_title,t.isbn AS catalog_isbn,t.publisher AS catalog_publisher,t.publication_year AS catalog_year,t.cover_image_path AS catalog_cover,t.lifecycle_status AS catalog_status,t.record_type AS catalog_kind,d.edition AS catalog_edition,(SELECT string_agg(a.author_name,'; ' ORDER BY a.author_id) FROM authors a WHERE a.title_id=t.title_id) AS catalog_author FROM catalog_import_rows r LEFT JOIN titles t ON r.status='Imported' AND t.title_id=(r.result_json->>'titleId')::bigint LEFT JOIN catalog_title_details d ON d.title_id=t.title_id WHERE r.batch_id=?${rowId?' AND r.import_row_id=?':''} ORDER BY r.import_row_id`,rowId?[batch,rowId]:[batch])
 return records.map(row=>{
  const imported=row.status==='Imported'
  const data=imported?{...row.data_json,title:row.catalog_title??'',author:row.catalog_author??'',isbn:row.catalog_isbn??'',publisher:row.catalog_publisher??'',publicationYear:row.catalog_year==null?'':String(row.catalog_year),edition:row.catalog_edition??''}:row.data_json
  const eligible=imported?Boolean(row.cover_title_id&&row.catalog_status==='Active'&&row.catalog_kind==='Book'&&!row.catalog_cover):['Review','Ready'].includes(row.status)
  return {...row,data_json:data,cover_eligible:eligible}
 })
}
export async function lockedImportCoverTarget(q:Query,row:RowDataPacket){
 if(row.status==='Imported'){
  const titleId=Number(row.result_json?.titleId)
  if(!Number.isSafeInteger(titleId)||titleId<1)return null
  await q.execute('SELECT title_id FROM titles WHERE title_id=? FOR UPDATE',[titleId])
 }
 return (await importCoverTargets(q,Number(row.batch_id),Number(row.import_row_id)))[0]??null
}
