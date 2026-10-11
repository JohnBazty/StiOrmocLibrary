import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { db, dbDriver } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { clean, holdingsFields, holdingsIdentity, identityList, key, mappedRows, positiveId, readHoldings, validateHoldingsData, type HoldingsData, type SheetMapping } from './holdings-parser.ts'
import { insertAuthors, insertLegacyBookMaterial, insertPhysicalCopy, insertTitle } from './catalog.repository.ts'
import { reserveBarcodeSequence } from './bulk-book.repository.ts'
import { renderBookLabel } from './book-label.renderer.ts'

const fail=(message:string,status=422)=>new HttpError(status,'CATALOG_REVIEW_REQUIRED',message)
const id=(value:unknown)=>{const n=positiveId(value);if(!n)throw fail('Choose a valid record.');return n}
const pg=()=>{if(dbDriver!=='postgres')throw fail('Catalog enhancements require the configured Supabase database.',503)}
type Query=Pick<PoolConnection,'execute'>
async function rows(q:Query,sql:string,values:any[]=[]){const [data]=await q.execute<RowDataPacket[]>(sql,values);return data}
async function transaction<T>(actor:number,fn:(c:PoolConnection)=>Promise<T>){pg();const c=await db.getConnection();try{await c.beginTransaction();await requireLibraryActor(c,actor,'library.manage');const result=await fn(c);await c.commit();return result}catch(e){await c.rollback();throw e}finally{c.release()}}
const foundation={locations:{table:'catalog_locations',id:'location_id'},programs:{table:'catalog_programs',id:'program_id'},courses:{table:'catalog_courses',id:'course_id'},types:{table:'catalog_resource_types',id:'type_id'}} as const
type FoundationKind=keyof typeof foundation
function foundationKind(value:string):FoundationKind{if(!Object.hasOwn(foundation,value))throw fail('Choose locations, programs, courses or types.');return value as FoundationKind}
export async function catalogOptions(publicOnly=false){
 pg();const result:Record<string,unknown>={}
 for(const [kind,spec] of Object.entries(foundation))result[kind]=await rows(db,`SELECT ${spec.id} AS id,name,lifecycle_status AS status,row_version AS version${kind==='programs'||kind==='courses'?',code':''}${kind==='courses'?',program_id AS "programId"':''}${kind==='types'?',record_kind AS "recordKind"':''}${kind==='locations'?',COALESCE((SELECT column_count FROM floor_plan_shelves s WHERE s.label=name),1) AS "columnCount",COALESCE((SELECT row_count FROM floor_plan_shelves s WHERE s.label=name),1) AS "rowCount"':''} FROM ${spec.table} ${publicOnly?"WHERE lifecycle_status='Active'":''} ORDER BY name`)
 result.categories=await rows(db,'SELECT category_id AS id,category_name AS name FROM categories ORDER BY category_name')
 return result
}
export async function saveFoundation(kindValue:string,recordId:unknown,body:Record<string,unknown>,actor:number){
 const kind=foundationKind(kindValue),spec=foundation[kind],record=recordId?id(recordId):null
 const name=clean(body.name),code=clean(body.code).toUpperCase(),status=body.status==='Archived'?'Archived':'Active'
 if(!name||name.length>(kind==='programs'||kind==='courses'?150:100))throw fail('Enter a name within the allowed length.')
 if((kind==='programs'||kind==='courses')&&(!code||code.length>40))throw fail('Enter a code up to 40 characters.')
 const program=kind==='courses'?id(body.programId):null,recordKind=kind==='types'?body.recordKind:null
 if(kind==='types'&&!['Book','Research/Thesis'].includes(String(recordKind)))throw fail('Choose Book or Research / Thesis.')
 await transaction(actor,async c=>{
  await c.execute('SELECT pg_advisory_xact_lock(734032)')
  const old=record?(await rows(c,`SELECT * FROM ${spec.table} WHERE ${spec.id}=? FOR UPDATE`,[record]))[0]:null
  if(record&&(!old||Number(old.row_version)!==Number(body.version)))throw fail('This entry changed. Refresh and try again.',409)
  if(program&&!(await rows(c,"SELECT program_id FROM catalog_programs WHERE program_id=? AND lifecycle_status='Active'",[program])).length)throw fail('Choose an active program.')
  if(old&&kind==='locations'&&old.name!==name&&(await rows(c,'SELECT 1 FROM physical_copies WHERE shelf_location=? UNION SELECT 1 FROM research_inventory WHERE shelf_location=? UNION SELECT 1 FROM categories WHERE shelf_location=? LIMIT 1',[old.name,old.name,old.name])).length)throw fail('This location is used by existing holdings. Create a new location and relocate copies before renaming it.')
  if(old&&kind==='types'&&old.record_kind!==recordKind&&(await rows(c,'SELECT 1 FROM catalog_title_details WHERE type_id=? LIMIT 1',[record])).length)throw fail('The type is in use. Its book/research classification cannot change.')
  if((await rows(c,`SELECT 1 FROM ${spec.table} WHERE LOWER(name)=LOWER(?) AND ${spec.id}<>?${kind==='courses'?' AND program_id=?':''} LIMIT 1`,kind==='courses'?[name,record??0,program]:[name,record??0])).length)throw fail('An entry with this name already exists.')
  const columns=['name','lifecycle_status'],values:any[]=[name,status]
  if(kind==='programs'||kind==='courses'){columns.push('code');values.push(code)}
  if(kind==='courses'){columns.push('program_id');values.push(program)}
  if(kind==='types'){columns.push('record_kind');values.push(recordKind)}
  if(record)await c.execute(`UPDATE ${spec.table} SET ${columns.map(col=>`${col}=?`).join(',')},row_version=row_version+1,updated_at=NOW() WHERE ${spec.id}=?`,[...values,record])
  else await c.execute(`INSERT INTO ${spec.table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,values)
 })
 return catalogOptions()
}
const publicSelect=`SELECT t.title_id AS id,t.title,t.record_type AS kind,t.cover_image_path AS "coverImagePath",t.isbn,t.publisher,t.publication_year AS "publicationYear",t.call_number AS "callNumber",c.category_name AS category,
 COALESCE((SELECT string_agg(a.author_name,', ' ORDER BY a.author_order) FROM authors a WHERE a.title_id=t.title_id),'') AS author,
 d.copyright_year AS "copyrightYear",d.edition,d.page_count AS pages,d.synopsis,d.glossary_text AS glossary,d.row_version AS version,d.type_id AS "typeId",rt.name AS "resourceType",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.program_id,'name',p.name,'code',p.code)) FROM catalog_title_programs tp JOIN catalog_programs p ON p.program_id=tp.program_id WHERE tp.title_id=t.title_id),'[]') AS programs,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.course_id,'name',s.name,'programId',s.program_id,'code',s.code)) FROM catalog_title_courses tc JOIN catalog_courses s ON s.course_id=tc.course_id WHERE tc.title_id=t.title_id),'[]') AS courses,
 (SELECT COUNT(*) FROM physical_copies pc WHERE pc.title_id=t.title_id AND pc.lifecycle_status='Active') AS "copyCount",
 (SELECT COUNT(*) FROM physical_copies pc JOIN materials m ON m.material_id=pc.material_id WHERE pc.title_id=t.title_id AND pc.lifecycle_status='Active' AND pc.availability_status='Available' AND m.availability_status='Available' AND pc.condition_status NOT IN ('Lost','Damaged','For Repair')) AS available,
 COALESCE((SELECT abstract_text FROM research_records rr WHERE rr.title_id=t.title_id AND rr.viewing_status<>'Archived' LIMIT 1),'') AS abstract
 FROM titles t LEFT JOIN categories c ON c.category_id=t.category_id LEFT JOIN catalog_title_details d ON d.title_id=t.title_id LEFT JOIN catalog_resource_types rt ON rt.type_id=d.type_id`
function publicWhere(query:Record<string,unknown>){
 const clauses=["t.lifecycle_status='Active'","(t.record_type='Book' OR EXISTS(SELECT 1 FROM research_records rr WHERE rr.title_id=t.title_id AND rr.viewing_status<>'Archived'))"],values:any[]=[]
 const q=clean(query.q).slice(0,120);if(q){clauses.push('(t.title ILIKE ? OR t.isbn ILIKE ? OR EXISTS(SELECT 1 FROM authors a WHERE a.title_id=t.title_id AND a.author_name ILIKE ?))');values.push(`%${q}%`,`%${q}%`,`%${q}%`)}
 if(['Book','Research/Thesis'].includes(String(query.kind))){clauses.push('t.record_type=?');values.push(query.kind)}
 if(positiveId(query.categoryId)){clauses.push('t.category_id=?');values.push(positiveId(query.categoryId))}
 for(const [param,table,col] of [['programId','catalog_title_programs','program_id'],['courseId','catalog_title_courses','course_id'],['typeId','catalog_title_details','type_id']])if(positiveId(query[param])){clauses.push(`EXISTS(SELECT 1 FROM ${table} f WHERE f.title_id=t.title_id AND f.${col}=?)`);values.push(positiveId(query[param]))}
 return {sql:clauses.join(' AND '),values}
}
export async function publicCatalog(query:Record<string,unknown>){pg();const where=publicWhere(query),page=Math.max(1,Math.min(10000,positiveId(query.page)??1)),limit=24
 const [items,count]=await Promise.all([rows(db,`${publicSelect} WHERE ${where.sql} ORDER BY t.title,t.title_id LIMIT ${limit} OFFSET ${(page-1)*limit}`,where.values),rows(db,`SELECT COUNT(*) AS total FROM titles t WHERE ${where.sql}`,where.values)])
 return {items,pagination:{page,limit,total:Number(count[0].total)}}
}
export async function publicDetail(value:unknown){pg();const titleId=id(value),where=publicWhere({}),book=(await rows(db,`${publicSelect} WHERE ${where.sql} AND t.title_id=?`,[titleId]))[0];if(!book)throw fail('This catalog entry is unavailable.',404)
 const copies=book.kind==='Book'?await rows(db,`SELECT physical_copy_id AS id,accession_number AS accession,barcode,shelf_location AS shelf,condition_status AS condition,availability_status AS availability FROM physical_copies WHERE title_id=? AND lifecycle_status='Active' ORDER BY physical_copy_id`,[titleId]):await rows(db,`SELECT research_inventory_id AS id,accession_number AS accession,barcode,shelf_location AS shelf,condition_state AS condition,availability_status AS availability FROM research_inventory WHERE title_id=? AND lifecycle_status='Active' ORDER BY research_inventory_id`,[titleId])
 const files=await rows(db,"SELECT file_id AS id,original_name AS name,byte_size AS size,created_at AS uploaded FROM catalog_digital_files WHERE title_id=? AND lifecycle_status='Active' ORDER BY file_id",[titleId])
 return {...book,version:Number(book.version??0),copies,files}
}
function ids(value:unknown){if(!Array.isArray(value)||value.length>50)throw fail('Select at most 50 program or course links.');return [...new Set(value.map(id))]}
export async function saveDetails(value:unknown,body:Record<string,unknown>,actor:number){
 const titleId=id(value),copyright=body.copyrightYear===''||body.copyrightYear==null?null:Number(body.copyrightYear),pages=body.pages===''||body.pages==null?null:Number(body.pages),edition=clean(body.edition),synopsis=String(body.synopsis??'').trim(),glossary=String(body.glossary??'').trim(),typeId=body.typeId?id(body.typeId):null,programs=ids(body.programIds??[]),courses=ids(body.courseIds??[])
 if(copyright!==null&&(!Number.isInteger(copyright)||copyright<1000||copyright>new Date().getFullYear()))throw fail('Enter a valid copyright year or leave it blank.')
 if(pages!==null&&(!Number.isSafeInteger(pages)||pages<1||pages>1000000))throw fail('Enter a positive page count or leave it blank.')
 if(edition.length>100||synopsis.length>50000||glossary.length>50000)throw fail('Edition or descriptive text is too long.')
 await transaction(actor,async c=>{
  const title=(await rows(c,"SELECT record_type FROM titles WHERE title_id=? AND lifecycle_status='Active' FOR UPDATE",[titleId]))[0];if(!title)throw fail('Choose an active title.')
  const old=(await rows(c,'SELECT row_version FROM catalog_title_details WHERE title_id=? FOR UPDATE',[titleId]))[0]
  if(Number(body.version)!==Number(old?.row_version??0))throw fail('The details changed. Reload before saving.',409)
  if(typeId&&!(await rows(c,"SELECT 1 FROM catalog_resource_types WHERE type_id=? AND lifecycle_status='Active' AND record_kind=?",[typeId,title.record_type])).length)throw fail('Choose an active resource type matching this title.')
  for(const program of programs)if(!(await rows(c,"SELECT 1 FROM catalog_programs WHERE program_id=? AND lifecycle_status='Active'",[program])).length)throw fail('Choose active programs.')
  for(const course of courses){const row=(await rows(c,"SELECT program_id FROM catalog_courses WHERE course_id=? AND lifecycle_status='Active'",[course]))[0];if(!row||!programs.includes(Number(row.program_id)))throw fail('Each course must belong to a selected program.')}
  await c.execute(`INSERT INTO catalog_title_details(title_id,copyright_year,edition,page_count,synopsis,glossary_text,type_id,updated_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(title_id) DO UPDATE SET copyright_year=EXCLUDED.copyright_year,edition=EXCLUDED.edition,page_count=EXCLUDED.page_count,synopsis=EXCLUDED.synopsis,glossary_text=EXCLUDED.glossary_text,type_id=EXCLUDED.type_id,updated_by=EXCLUDED.updated_by,row_version=catalog_title_details.row_version+1,updated_at=NOW()`,[titleId,copyright,edition||null,pages,synopsis,glossary,typeId,actor])
  await c.execute('DELETE FROM catalog_title_courses WHERE title_id=?',[titleId]);await c.execute('DELETE FROM catalog_title_programs WHERE title_id=?',[titleId])
  for(const program of programs)await c.execute('INSERT INTO catalog_title_programs(title_id,program_id) VALUES (?,?)',[titleId,program])
  for(const course of courses)await c.execute('INSERT INTO catalog_title_courses(title_id,course_id) VALUES (?,?)',[titleId,course])
 });return publicDetail(titleId)
}
const bucket='catalog-digital-files'
const storage=()=>{if(!env.supabase.url||!env.supabase.secretKey)throw fail('Digital file storage is unavailable.',503);return createClient(env.supabase.url,env.supabase.secretKey,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(bucket)}
export async function uploadDigital(value:unknown,file:Express.Multer.File|undefined,body:Record<string,unknown>,actor:number){
 const titleId=id(value),note=clean(body.permissionNote)
 if(body.permissionConfirmed!=='true'||!note||note.length>1000)throw fail('Confirm permission for public distribution and record its basis.')
 if(!file||file.buffer.length<5||file.buffer.length>4194304||file.buffer.subarray(0,5).toString()!=='%PDF-'||!/\.pdf$/i.test(file.originalname))throw fail('Choose a PDF up to 4 MB.')
 const path=`${titleId}/${randomUUID()}.pdf`,store=storage();let uploaded=false
 try{await transaction(actor,async c=>{
  if(!(await rows(c,"SELECT title_id FROM titles WHERE title_id=? AND lifecycle_status='Active' FOR UPDATE",[titleId])).length)throw fail('Choose an active title.')
  const upload=await store.upload(path,file.buffer,{contentType:'application/pdf',upsert:false});if(upload.error)throw fail('The file could not be uploaded. Try again.',503)
  uploaded=true
  await c.execute('INSERT INTO catalog_digital_files(title_id,storage_path,original_name,byte_size,permission_note,uploaded_by) VALUES (?,?,?,?,?,?)',[titleId,path,file.originalname.slice(0,255),file.buffer.length,note,actor])
 })}catch(e){if(uploaded)await store.remove([path]);throw e}return publicDetail(titleId)
}
export async function archiveDigital(value:unknown,actor:number){await transaction(actor,async c=>{await c.execute("UPDATE catalog_digital_files SET lifecycle_status='Archived' WHERE file_id=?",[id(value)])});return {archived:true}}
export async function digitalDownload(value:unknown){pg();const file=(await rows(db,"SELECT f.storage_path,f.original_name FROM catalog_digital_files f JOIN titles t ON t.title_id=f.title_id WHERE f.file_id=? AND f.lifecycle_status='Active' AND t.lifecycle_status='Active' AND LENGTH(TRIM(f.permission_note))>0",[id(value)]))[0];if(!file)throw fail('This digital file is unavailable.',404)
 const result=await storage().download(file.storage_path);if(result.error||!result.data)throw fail('The digital file could not be downloaded.',503)
 return {bytes:Buffer.from(await result.data.arrayBuffer()),name:String(file.original_name)}
}
export async function inspectHoldings(file:Express.Multer.File|undefined){if(!file)throw fail('Choose a holdings file.');const sheets=await readHoldings(file);return sheets.map(s=>({name:s.name,rowCount:s.rows.length,headers:s.headers,mapping:s.mapping,preview:s.rows.slice(0,12)}))}
export async function stageHoldings(file:Express.Multer.File|undefined,mappings:SheetMapping[],actor:number){
 if(!file)throw fail('Choose a holdings file.');if(!Array.isArray(mappings)||!mappings.length||mappings.length>12)throw fail('Confirm the sheet mappings.')
 const sheets=await readHoldings(file),{items,ignored}=mappedRows(sheets,mappings)
 const fingerprint=createHash('sha256').update(file.buffer).update(JSON.stringify(mappings.map(m=>({...m,columns:Object.fromEntries(holdingsFields.map(f=>[f,m.columns[f]??null]))})).sort((a,b)=>a.sheet.localeCompare(b.sheet)))).digest('hex')
 const batchId=await transaction(actor,async c=>{
  const [insert]=await c.execute<ResultSetHeader>('INSERT INTO catalog_import_batches(fingerprint,filename,mapping_json,created_by) VALUES (?,?,?::jsonb,?) ON CONFLICT(fingerprint) DO NOTHING',[fingerprint,file.originalname.slice(0,255),JSON.stringify(mappings),actor])
  const batch=(await rows(c,'SELECT batch_id FROM catalog_import_batches WHERE fingerprint=? FOR UPDATE',[fingerprint]))[0]
  if(insert.affectedRows)await c.execute(`INSERT INTO catalog_import_rows(batch_id,sheet_name,source_row,source_json,data_json) SELECT ?,entry->>'sheet',(entry->>'sourceRow')::integer,entry->'source',entry->'data' FROM jsonb_array_elements(?::jsonb) entry`,[batch.batch_id,JSON.stringify(items)])
  return Number(batch.batch_id)
 });return {batchId,ignored,reused:!(await rows(db,"SELECT 1 FROM catalog_import_rows WHERE batch_id=? AND status<>'Review' LIMIT 1",[batchId])).length?false:true}
}
export async function importBatches(){pg();return rows(db,`SELECT b.batch_id AS id,b.filename,b.created_at AS created,COUNT(r.import_row_id)::int AS total,COUNT(*) FILTER(WHERE r.status='Imported')::int AS imported,COUNT(*) FILTER(WHERE r.status='Skipped')::int AS skipped,COUNT(*) FILTER(WHERE r.status='Ready')::int AS ready FROM catalog_import_batches b LEFT JOIN catalog_import_rows r ON r.batch_id=b.batch_id GROUP BY b.batch_id ORDER BY b.batch_id DESC LIMIT 50`)}
async function matchTitles(q:Query,data:HoldingsData){return rows(q,`SELECT t.title_id AS id,t.title,t.isbn,t.lifecycle_status AS status,COALESCE((SELECT string_agg(author_name,', ' ORDER BY author_order) FROM authors WHERE title_id=t.title_id),'') AS author FROM titles t WHERE t.record_type='Book' AND ((?<>'' AND t.isbn=?) OR LOWER(TRIM(t.title))=LOWER(TRIM(?))) ORDER BY t.title_id LIMIT 20`,[data.isbn,data.isbn,data.title])}
export async function importBatch(value:unknown){pg();const batchId=id(value),batch=(await rows(db,'SELECT batch_id AS id,filename,mapping_json AS mapping FROM catalog_import_batches WHERE batch_id=?',[batchId]))[0];if(!batch)throw fail('Import batch not found.',404)
 const entries=await rows(db,'SELECT import_row_id AS id,sheet_name AS sheet,source_row AS "sourceRow",source_json AS source,data_json AS data,status,decision,target_title_id AS "targetTitleId",reuse_row_id AS "reuseRowId",row_version AS version,result_json AS result,error_text AS error FROM catalog_import_rows WHERE batch_id=? ORDER BY import_row_id',[batchId])
 const groups=new Map<string,number[]>();for(const row of entries){const identity=holdingsIdentity(row.data);groups.set(identity,[...(groups.get(identity)??[]),Number(row.id)])}
 // Match titles once per identity, rather than once per repeated workbook row.
 const existing=await rows(db,`SELECT t.title_id AS id,t.title,t.isbn,t.lifecycle_status AS status,COALESCE((SELECT string_agg(author_name,', ' ORDER BY author_order) FROM authors WHERE title_id=t.title_id),'') AS author FROM titles t WHERE t.record_type='Book'`)
 const matches=new Map<string,RowDataPacket[]>();for(const row of entries){const identity=holdingsIdentity(row.data);if(!matches.has(identity))matches.set(identity,existing.filter(t=>(row.data.isbn&&t.isbn===row.data.isbn)||key(t.title)===key(row.data.title)).slice(0,20));row.matches=matches.get(identity);row.overlaps=groups.get(identity)?.filter(n=>n!==Number(row.id));row.errors=validateHoldingsData(row.data,!['link','reuse','skip'].includes(row.decision))}
 return {...batch,rows:entries}
}
function normalizedData(body:Record<string,unknown>):HoldingsData{return {...Object.fromEntries(holdingsFields.map(f=>[f,f==='accessions'||f==='barcodes'?String(body[f]??'').trim():clean(body[f])])),categoryId:positiveId(body.categoryId),location:clean(body.location),programId:positiveId(body.programId),generateAccessions:body.generateAccessions===true} as HoldingsData}
async function validateImportReferences(c:Query,data:HoldingsData,needsCopies:boolean){
 if(data.programId&&!(await rows(c,"SELECT 1 FROM catalog_programs WHERE program_id=? AND lifecycle_status='Active'",[data.programId])).length)throw fail('Choose an active program.')
 if(needsCopies){if(!(await rows(c,'SELECT 1 FROM categories WHERE category_id=?',[data.categoryId])).length)throw fail('Choose an existing category.');if(!(await rows(c,"SELECT 1 FROM catalog_locations WHERE name=? AND lifecycle_status='Active'",[data.location])).length)throw fail('Choose an active managed shelf location.')}
}
export async function reviewImport(value:unknown,body:Record<string,unknown>,actor:number){
 const rowId=id(value),decision=String(body.decision),data=normalizedData(body.data as Record<string,unknown>??{}),needsCopies=['new','add'].includes(decision)
 if(!['new','add','link','reuse','skip'].includes(decision))throw fail('Choose how to handle this row.')
 if(decision!=='skip'){const errors=validateHoldingsData(data,needsCopies);if(errors.length)throw fail(errors.join(' '))}
 await transaction(actor,async c=>{
  const row=(await rows(c,'SELECT * FROM catalog_import_rows WHERE import_row_id=? FOR UPDATE',[rowId]))[0];if(!row||row.status==='Imported')throw fail('An imported row cannot be changed.',409)
  if(Number(row.row_version)!==Number(body.version))throw fail('This row changed. Reload before reviewing.',409)
  if(decision!=='skip')await validateImportReferences(c,data,needsCopies)
  let target:number|null=null,reuse:number|null=null
  if(decision==='link'||decision==='add'){target=id(body.targetTitleId);if(!(await rows(c,"SELECT 1 FROM titles WHERE title_id=? AND record_type='Book' AND lifecycle_status='Active'",[target])).length)throw fail('Choose an active existing book.')}
  if(decision==='new'&&(await matchTitles(c,data)).length)throw fail('A matching title already exists. Review it and choose add copies or reuse existing holdings.')
  if(decision==='reuse'){reuse=id(body.reuseRowId);if(reuse>=rowId||!(await rows(c,"SELECT 1 FROM catalog_import_rows WHERE import_row_id=? AND batch_id=? AND decision IN ('new','add','link','reuse') AND status IN ('Ready','Imported')",[reuse,row.batch_id])).length)throw fail('Choose an earlier reviewed row in this batch.')}
  await c.execute("UPDATE catalog_import_rows SET data_json=?::jsonb,decision=?,target_title_id=?,reuse_row_id=?,status=?,reviewed_by=?,reviewed_at=NOW(),row_version=row_version+1,error_text=NULL,updated_at=NOW() WHERE import_row_id=?",[JSON.stringify(data),decision,target,reuse,decision==='skip'?'Skipped':'Ready',actor,rowId])
 });return {reviewed:true}
}
export async function commitImport(value:unknown,actor:number){
 const batchId=id(value),selected=await rows(db,"SELECT import_row_id FROM catalog_import_rows WHERE batch_id=? AND status='Ready' ORDER BY import_row_id LIMIT 10",[batchId]);const errors:Array<{rowId:number;message:string}>=[];let imported=0
 for(const entry of selected){const rowId=Number(entry.import_row_id)
  try{const saved=await transaction(actor,async c=>{
   // Serializes commits for the same batch and retains a durable per-row result.
   await rows(c,'SELECT batch_id FROM catalog_import_batches WHERE batch_id=? FOR UPDATE',[batchId])
   const row=(await rows(c,'SELECT * FROM catalog_import_rows WHERE import_row_id=? AND batch_id=? FOR UPDATE',[rowId,batchId]))[0];if(!row||row.status!=='Ready')return false
   const data=row.data_json as HoldingsData,needsCopies=['new','add'].includes(row.decision),issues=validateHoldingsData(data,needsCopies);if(issues.length)throw fail(issues.join(' '));await validateImportReferences(c,data,needsCopies)
   // A global transaction lock closes concurrent duplicate-title races across imports.
   await c.execute("SELECT pg_advisory_xact_lock(734031)")
   let titleId=Number(row.target_title_id),copyIds:number[]=[]
   if(row.decision==='reuse'){const prior=(await rows(c,"SELECT result_json FROM catalog_import_rows WHERE import_row_id=? AND batch_id=? AND status='Imported'",[row.reuse_row_id,batchId]))[0];if(!prior)throw fail('The earlier holding has not been imported yet. Review it first.');titleId=Number(prior.result_json.titleId)}
   if(row.decision==='new'){
    if((await matchTitles(c,data)).length)throw fail('A matching title was added since review. Choose the existing holding before retrying.')
    titleId=Number(await insertTitle(c,{title:data.title,recordType:'Book',categoryId:data.categoryId,isbn:data.isbn||null,publisher:data.publisher||null,publicationYear:data.publicationYear?Number(data.publicationYear):null,callNumber:data.callNumber||null,searchText:[data.title,data.author,data.isbn].join(' ')}));await insertAuthors(c,titleId,[data.author])
    await c.execute('INSERT INTO catalog_title_details(title_id,copyright_year,edition,page_count,type_id,updated_by) VALUES (?,?,?,?,(SELECT type_id FROM catalog_resource_types WHERE name=?),?)',[titleId,data.copyrightYear?Number(data.copyrightYear):null,data.edition||null,data.pages?Number(data.pages):null,'Book',actor])
   }else if(!(await rows(c,"SELECT title_id FROM titles WHERE title_id=? AND record_type='Book' AND lifecycle_status='Active' FOR UPDATE",[titleId])).length)throw fail('The selected holding is no longer active.')
   if(needsCopies){
    const count=Number(data.copies),missing=Number(data.missingCopies||0),year=new Date().getFullYear(),start=await reserveBarcodeSequence(c,year,count),accessions=data.generateAccessions?[]:identityList(data.accessions),barcodes=identityList(data.barcodes)
    // Existing-title additions use canonical title metadata for the legacy circulation bridge.
    const canonical=(await rows(c,'SELECT t.title,t.isbn,t.category_id,t.publication_year,COALESCE((SELECT string_agg(author_name,\', \') FROM authors WHERE title_id=t.title_id),?) AS author FROM titles t WHERE title_id=?',[data.author,titleId]))[0]
    for(let index=0;index<count;index++){
     const serial=String(start+index).padStart(6,'0'),barcode=barcodes[index]??`STIORMOC${year}${serial}`,accession=accessions[index]??`STI-ACC-${year}-${serial}`
     if((await rows(c,'SELECT 1 FROM physical_copies WHERE barcode=? OR accession_number=? UNION SELECT 1 FROM research_inventory WHERE barcode=? OR accession_number=? UNION SELECT 1 FROM materials WHERE barcode=? LIMIT 1',[barcode,accession,barcode,accession,barcode])).length)throw fail('An accession or barcode already exists. Correct the row before retrying.')
     const copy={barcode,accessionNumber:accession,shelfLocation:data.location,conditionStatus:index<missing?'Lost':'Good',legacyMaterialId:null as number|null}
     copy.legacyMaterialId=Number(await insertLegacyBookMaterial(c,{title:canonical.title,authors:[canonical.author],isbn:canonical.isbn,categoryId:canonical.category_id,publicationYear:canonical.publication_year,publisher:null,callNumber:null,copy}))
     const copyId=Number(await insertPhysicalCopy(c,titleId,copy)),label=await renderBookLabel({title_id:titleId,barcode,accession_number:accession});await c.execute('UPDATE physical_copies SET qr_code_data=?,availability_status=? WHERE physical_copy_id=?',[label.qrCodeData,index<missing?'Unavailable':'Available',copyId]);copyIds.push(copyId)
    }
   }
   if(data.programId)await c.execute('INSERT INTO catalog_title_programs(title_id,program_id) VALUES (?,?) ON CONFLICT DO NOTHING',[titleId,data.programId])
   await c.execute("UPDATE catalog_import_rows SET status='Imported',result_json=?::jsonb,row_version=row_version+1,error_text=NULL,updated_at=NOW() WHERE import_row_id=?",[JSON.stringify({titleId,copyIds}),rowId]);return true
  });if(saved)imported++}catch(e){const message=e instanceof HttpError?e.message:'The row could not be imported. Review its identifiers and try again.';errors.push({rowId,message});await db.execute("UPDATE catalog_import_rows SET error_text=? WHERE import_row_id=? AND status='Ready'",[message,rowId])}
 }
 const remaining=await rows(db,"SELECT COUNT(*) AS total FROM catalog_import_rows WHERE batch_id=? AND status='Ready'",[batchId]);return {imported,remaining:Number(remaining[0].total),errors}
}
