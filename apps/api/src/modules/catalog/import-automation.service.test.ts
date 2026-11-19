import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {toPgPlaceholders} from '../../config/sql.js'
import {createImportAutomationService} from './import-automation.service.ts'
import type {ImportCoverDependencies} from './import-cover.service.ts'
import {acceptedImportCover} from './import-cover.service.ts'
import type {Lookups} from './import-lookup-fill.ts'
const fakeIsbn=(index:number)=>{const base='978'+String(index).padStart(9,'0');return base+String((10-[...base].reduce((n,d,i)=>n+Number(d)*(i%2===0?1:3),0)%10)%10)}
const draft={title:'Clean Code',author:'Robert C. Martin',isbn:'0132350882',edition:'',publisher:'',publicationYear:'',copyrightYear:'',pages:'',copies:'1',missingCopies:'',accessions:'000001',barcodes:'000002',callNumber:'',categoryId:null,location:'',programId:null,generateAccessions:false}
async function fixture(records:Array<{status?:string;sheet?:string;data?:Record<string,unknown>}>,lookups?:Lookups,covers?:ImportCoverDependencies){
 const pg=new PGlite();await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE users(user_id BIGINT PRIMARY KEY,account_status TEXT);CREATE TABLE accounts(account_id BIGINT PRIMARY KEY,user_id BIGINT,role TEXT,account_status TEXT);INSERT INTO users VALUES(1,'Active'),(2,'Active');INSERT INTO accounts VALUES(1,1,'Librarian','Active'),(2,2,'Student','Active');CREATE TABLE categories(category_id BIGINT PRIMARY KEY,category_name TEXT);INSERT INTO categories VALUES(1,'Reviewed category'),(2,'Existing category');CREATE TABLE catalog_locations(name TEXT PRIMARY KEY,lifecycle_status TEXT);INSERT INTO catalog_locations VALUES('Shelf A','Active'),('Old shelf','Archived');CREATE TABLE titles(title_id BIGINT PRIMARY KEY,title TEXT,isbn TEXT,record_type TEXT,lifecycle_status TEXT DEFAULT 'Active',cover_image_path TEXT,row_version INTEGER DEFAULT 1,publisher TEXT,publication_year INTEGER,updated_at TIMESTAMPTZ);CREATE TABLE authors(author_id BIGSERIAL PRIMARY KEY,title_id BIGINT,author_name TEXT);CREATE TABLE catalog_title_details(title_id BIGINT PRIMARY KEY,edition TEXT);CREATE TABLE catalog_import_batches(batch_id BIGINT PRIMARY KEY);INSERT INTO catalog_import_batches VALUES(1);CREATE TABLE catalog_import_rows(import_row_id BIGSERIAL PRIMARY KEY,batch_id BIGINT NOT NULL,sheet_name TEXT,row_version INTEGER DEFAULT 1,status TEXT DEFAULT 'Review',data_json JSONB,source_json JSONB,result_json JSONB,error_text TEXT,updated_at TIMESTAMPTZ);`)
 await pg.exec(await readFile(new URL('../../../../../database/supabase/064_catalog_import_automation.sql',import.meta.url),'utf8'));await pg.exec(await readFile(new URL('../../../../../database/supabase/065_catalog_import_covers.sql',import.meta.url),'utf8'))
 const values=records.map((r,i)=>({id:i+1,status:r.status??'Review',sheet:r.sheet??'Books',data:{...draft,...r.data}}))
 await pg.query(`INSERT INTO catalog_import_rows(import_row_id,batch_id,sheet_name,status,data_json,source_json) SELECT (v->>'id')::bigint,1,v->>'sheet',v->>'status',v->'data',v->'data' FROM jsonb_array_elements($1::jsonb) v`,[JSON.stringify(values)])
 const statements:string[]=[]
 const q={execute:async(sql:string,args:unknown[]=[])=>{statements.push(sql);const result=await pg.query(toPgPlaceholders(sql),args);return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)?[{affectedRows:result.affectedRows??0,rows:result.rows},result]:[result.rows,result]},beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){}}
 const service=createImportAutomationService({getConnection:async()=>q} as never,lookups,Date.now,covers)
 const body=async()=>{const p=await service.preview(1,1);return {requestKey:randomUUID(),revision:p.revision,plans:p.groups.map(g=>({sheet:g.sheet,categoryId:1,location:'Shelf A'})),clearInvalidOptional:true}}
 return {pg,service,body,statements}
}
test('one run corrects all 1,645 pending rows, preserves two imported rows/source/identifiers and resumes through bounded steps',async()=>{
 const f=await fixture([{status:'Imported',data:{title:'Completed one',isbn:fakeIsbn(9000),categoryId:2,location:'Keep shelf'}},{status:'Imported',data:{title:'Completed two',isbn:fakeIsbn(9001),categoryId:2,location:'Keep shelf'}},...Array.from({length:1645},(_,i)=>({sheet:['CHED HRM','CHED TM','GE BOOKS','IT BOOKS','SHS BOOKS'][i%5],data:{title:`Synthetic book ${i}`,isbn:i<223?String(i+10000):i===223?'0132350882':fakeIsbn(i),publicationYear:i<97?'Not verified':i===97?'128':'',accessions:String(i).padStart(7,'0')}}))])
 try{
  const before=(await f.pg.query<{import_row_id:number;status:string;data_json:typeof draft;source_json:unknown}>('SELECT import_row_id,status,data_json,source_json FROM catalog_import_rows ORDER BY import_row_id')).rows
  const p=await f.service.preview(1,1);assert.equal(p.total,1645);assert.equal(p.imported,2);assert.equal(p.invalidIsbns,223);assert.equal(p.invalidYears,98)
  const body=await f.body();let run=await f.service.start(1,1,body);assert.equal((await f.service.start(1,1,body)).id,run.id)
  let calls=0;while(run.status==='running'){const previous=run.processed;run=await f.service.step(1,run.id);assert.ok(run.processed-previous<=100);calls++}
  assert.equal(calls,17);assert.equal(run.status,'completed');assert.equal(run.processed,1645);assert.deepEqual(run.counters,{checked:1645,changed:1645,unresolved:0,conflicts:0})
  const after=(await f.pg.query<{import_row_id:number;status:string;data_json:typeof draft;source_json:unknown}>('SELECT import_row_id,status,data_json,source_json FROM catalog_import_rows ORDER BY import_row_id')).rows
  assert.deepEqual(after.slice(0,2),before.slice(0,2));for(let i=2;i<after.length;i++){assert.equal(after[i].status,'Review');assert.equal(after[i].data_json.categoryId,1);assert.equal(after[i].data_json.location,'Shelf A');assert.equal(after[i].data_json.publisher,'');assert.equal(after[i].data_json.publicationYear,'');assert.equal(after[i].data_json.isbn,i<225?'':before[i].data_json.isbn);assert.deepEqual(after[i].source_json,before[i].source_json);assert.equal(after[i].data_json.accessions,String(i-2).padStart(7,'0'))}
  assert.deepEqual((await f.service.step(1,run.id)).counters,run.counters)
  assert.ok(f.statements.filter(s=>/^\s*(INSERT|UPDATE|DELETE)/i.test(s)).every(s=>/catalog_import_(rows|automation_runs)/.test(s)))
 }finally{await f.pg.close()}
})
test('review requires current versions and active references, enforces permissions and protects concurrent edits/imports',async()=>{
 const f=await fixture([{}]);try{
  await assert.rejects(f.service.preview(2,1),{status:403});const stale=await f.body();await f.pg.exec("UPDATE catalog_import_rows SET row_version=2");await assert.rejects(f.service.start(1,1,stale),{status:409})
  const body=await f.body();await assert.rejects(f.service.start(1,1,{...body,plans:[{sheet:'Books',categoryId:1,location:'Old shelf'}]}),{status:409})
  const run=await f.service.start(1,1,body);await assert.rejects(f.service.start(1,1,{...body,requestKey:randomUUID()}),{status:409})
  await f.pg.exec("UPDATE catalog_import_rows SET status='Imported',data_json=data_json||'{\"title\":\"User confirmed copy\"}',row_version=row_version+1")
  const result=await f.service.step(1,run.id);assert.equal(result.counters.conflicts,1);assert.equal(result.counters.changed,0);assert.equal((await f.pg.query<{data_json:{title:string}}>('SELECT data_json FROM catalog_import_rows')).rows[0].data_json.title,'User confirmed copy')
 }finally{await f.pg.close()}
})
test('provider outage pauses without guessing, resumes the same row, and preserves required-field provenance',async()=>{
 let down=true;const f=await fixture([{data:{author:''}}],{lookup:async()=>{if(down)throw Error('provider down');return {...draft,publisher:'Provider optional',publicationYear:2008,author:'Robert C. Martin',source:'google_books'}},searchTitles:async()=>{throw Error('not used')}})
 try{
  let run=await f.service.start(1,1,await f.body());run=await f.service.step(1,run.id);assert.equal(run.status,'paused');assert.equal(run.processed,0)
  assert.equal((await f.pg.query<{data_json:typeof draft}>('SELECT data_json FROM catalog_import_rows')).rows[0].data_json.categoryId,null)
  down=false;run=await f.service.changeState(1,run.id,{status:'running',version:run.version});run=await f.service.step(1,run.id);assert.equal(run.status,'completed');assert.equal(run.counters.unresolved,1)
  const data=(await f.pg.query<{data_json:Record<string,unknown>}>('SELECT data_json FROM catalog_import_rows')).rows[0].data_json;assert.equal(data.publisher,'');assert.equal(data.publicationYear,'');assert.ok(data.lookupFilled);assert.equal(data.author,'Robert C. Martin')
 }finally{await f.pg.close()}
})
test('reviewed reference retirement pauses safely; cancelled runs permit a new plan and browser roles cannot read the queue',async()=>{
 const f=await fixture([{}]);try{
  let run=await f.service.start(1,1,await f.body());await f.pg.exec("UPDATE catalog_locations SET lifecycle_status='Archived' WHERE name='Shelf A'");run=await f.service.step(1,run.id);assert.equal(run.status,'paused');assert.equal(run.processed,0)
  await assert.rejects(f.service.changeState(1,run.id,{status:'cancelled',version:run.version-1}),{status:409});run=await f.service.changeState(1,run.id,{status:'cancelled',version:run.version});assert.equal(run.status,'cancelled')
  await f.pg.exec("UPDATE catalog_locations SET lifecycle_status='Active' WHERE name='Shelf A'");const next=await f.service.start(1,1,await f.body());assert.notEqual(next.id,run.id)
  const security=await f.pg.query<{private:boolean}>("SELECT relrowsecurity AND NOT has_table_privilege('anon',oid,'SELECT') AND NOT has_table_privilege('authenticated',oid,'UPDATE') AS private FROM pg_class WHERE oid='catalog_import_automation_runs'::regclass");assert.equal(security.rows[0].private,true)
 }finally{await f.pg.close()}
})

test('whole-list cover run preserves drafts, skips imported rows, accepts only current proposals and final import reads accepted covers',async()=>{
 let fetched=0,stored=0;const f=await fixture([{status:'Imported'},{data:{title:'First',isbn:'0132350882'}},{status:'Ready',data:{title:'Second',isbn:fakeIsbn(2)}},{data:{title:'No image',isbn:fakeIsbn(3)}}],undefined,{cover:async()=>{fetched++;if(fetched===3)throw new (await import('../../core/http-error.ts')).HttpError(404,'COVER_NOT_FOUND','none');return {bytes:Buffer.from([255,216,255]),contentType:'image/jpeg'}},searchTitles:async()=>({source:null,localMatches:[],candidates:[]}),store:async()=>`https://example.test/cover-${++stored}.jpg`,remove:async()=>{}})
 try{
  const before=(await f.pg.query<{data_json:Record<string,unknown>}>('SELECT data_json FROM catalog_import_rows ORDER BY import_row_id')).rows
  const p=await f.service.preview(1,1);let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[]})
  while(run.status==='running')run=await f.service.step(1,run.id)
  assert.equal(run.total,3);assert.equal(fetched,3);assert.equal(run.counters.changed,2);assert.equal(run.counters.unresolved,1)
  assert.deepEqual((await f.pg.query('SELECT data_json FROM catalog_import_rows ORDER BY import_row_id')).rows,before)
  const q={execute:async(sql:string,args:unknown[])=>[(await f.pg.query(toPgPlaceholders(sql),args)).rows]} as never
  assert.equal(await acceptedImportCover(q,2,before[1].data_json as Record<string,unknown>),null)
  assert.deepEqual(await f.service.acceptCovers(1,1,{confirmed:true,rows:(await f.service.coverResults(1,1)).rows.filter(c=>c.status==='matched').map(c=>({rowId:c.rowId,version:c.version}))}),{accepted:2})
  assert.equal(await acceptedImportCover(q,2,before[1].data_json as Record<string,unknown>),'https://example.test/cover-1.jpg')
  assert.equal(await acceptedImportCover(q,2,{...before[1].data_json as object,title:'Changed title'}),null)
  const results=await f.service.coverResults(1,1);const cover=results.rows.find(r=>r.rowId===2)!;await f.service.removeCover(1,2,{version:cover.version});assert.equal(await acceptedImportCover(q,2,before[1].data_json as Record<string,unknown>),null)
  assert.deepEqual(await f.service.step(1,run.id),run)
 }finally{await f.pg.close()}
})
test('missing ISBN cover matches require unique exact title/author facts and never fill optional ISBN',async()=>{
 const candidate={title:'Clean Code',author:'Robert C. Martin',isbn:'0132350882',publisher:null,publicationYear:null,inCatalog:false,subjects:[]}
 const f=await fixture([{data:{isbn:''}},{data:{isbn:'',edition:'Second edition'}}],undefined,{cover:async()=>({bytes:Buffer.from([255,216,255]),contentType:'image/jpeg'}),searchTitles:async()=>({source:'google_books',localMatches:[],candidates:[candidate]}),store:async()=>'https://example.test/cover.jpg',remove:async()=>{}})
 try{
  const p=await f.service.preview(1,1);let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[]});while(run.status==='running')run=await f.service.step(1,run.id)
  const results=await f.service.coverResults(1,1);assert.equal(results.rows[0].status,'matched');assert.equal(results.rows[1].status,'needs_review')
  for(const r of (await f.pg.query<{data_json:{isbn:string}}>('SELECT data_json FROM catalog_import_rows')).rows)assert.equal(r.data_json.isbn,'')
 }finally{await f.pg.close()}
})

test('all 1,645 cover entries are visited automatically in bounded steps, with durable retry and no imported-row writes',async()=>{
 let count=0;const f=await fixture([{status:'Imported'},{status:'Imported'},...Array.from({length:1645},()=>({}))],undefined,{cover:async()=>{count++;return {bytes:Buffer.from([255,216,255]),contentType:'image/jpeg'}},searchTitles:async()=>({source:null,localMatches:[],candidates:[]}),store:async()=>`https://example.test/cover-${count}.jpg`,remove:async()=>{}})
 try{
  const p=await f.service.preview(1,1);let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[],retry:true});let steps=0
  while(run.status==='running'){const before=run.processed;run=await f.service.step(1,run.id);assert.ok(run.processed-before<=2);steps++}
  assert.equal(steps,823);assert.equal(count,1645);assert.equal(run.processed,1645);assert.equal(run.counters.changed,1645)
  const results=await f.service.coverResults(1,1);assert.equal(results.rows.length,1645);assert.ok(results.rows.every(r=>r.rowId>2&&r.status==='matched'&&!r.accepted))
  assert.deepEqual(await f.service.step(1,run.id),run);assert.equal(count,1645)
 }finally{await f.pg.close()}
})


test('a book with no ISBN and a recorded edition needs review without an online search',async()=>{
 let searched=0;const f=await fixture([{data:{isbn:'',edition:'1st edition'}}],undefined,{cover:async()=>{throw Error('must not fetch')},searchTitles:async()=>{searched++;throw new (await import('../../core/http-error.ts')).HttpError(503,'TITLE_LOOKUP_UNAVAILABLE','unavailable')},store:async()=>{throw Error('must not store')},remove:async()=>{}})
 try{const p=await f.service.preview(1,1);let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[]});run=await f.service.step(1,run.id);assert.equal(run.status,'completed');assert.equal(run.processed,1);assert.equal(searched,0);assert.equal((await f.service.coverResults(1,1)).rows[0].status,'needs_review')}finally{await f.pg.close()}
})
test('temporary title-search failure marks that book for retry while later ISBN books continue',async()=>{
 const f=await fixture([{data:{isbn:'',edition:''}},{data:{isbn:'0132350882'}}],undefined,{cover:async()=>({bytes:Buffer.from([255,216,255]),contentType:'image/jpeg'}),searchTitles:async()=>{throw new (await import('../../core/http-error.ts')).HttpError(503,'TITLE_LOOKUP_UNAVAILABLE','unavailable')},store:async()=>'https://example.test/cover.jpg',remove:async()=>{}})
 try{const p=await f.service.preview(1,1);let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[]});run=await f.service.step(1,run.id);assert.equal(run.status,'completed');assert.equal(run.processed,2);assert.equal(run.counters.changed,1);const results=await f.service.coverResults(1,1);assert.equal(results.rows[0].status,'needs_review');assert.equal(results.rows[0].evidence.reason,'title_lookup_unavailable');assert.equal(results.rows[1].status,'matched')}finally{await f.pg.close()}
})


test('default cover title search reuses the held transaction connection instead of opening another',async(t)=>{
 const {db}=await import('../../config/db.js')
 const {proposeImportCover}=await import('./import-cover.service.ts')
 let queries=0
 t.mock.method(db,'execute',async()=>{throw Error('unexpected second database connection')})
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({docs:[],items:[]}),{status:200,headers:{'content-type':'application/json'}}))
 const q={execute:async(sql:string)=>{queries++;if(sql.startsWith('INSERT'))return [{affectedRows:1}];return [[]]}}
 const result=await proposeImportCover(q as never,{import_row_id:1,data_json:{title:'Example book',author:'Example author',isbn:'',edition:''}},randomUUID(),1,[])
 assert.deepEqual(result,{changed:false,unresolved:true});assert.ok(queries>=3)
})


async function importFixtureBook(f:Awaited<ReturnType<typeof fixture>>,cover:string|null=null){
 await f.pg.query("INSERT INTO titles(title_id,title,isbn,record_type,cover_image_path) VALUES(10,'Clean Code','0132350882','Book',$1)",[cover])
 await f.pg.exec("INSERT INTO authors(title_id,author_name) VALUES(10,'Robert C. Martin');UPDATE catalog_import_rows SET status='Imported',result_json='{\"titleId\":10,\"copyIds\":[101]}',row_version=row_version+1 WHERE import_row_id=1")
}
const imageDependencies:ImportCoverDependencies={cover:async()=>({bytes:Buffer.from([255,216,255]),contentType:'image/jpeg'}),searchTitles:async()=>({source:null,localMatches:[],candidates:[]}),store:async()=>'https://example.test/later-cover.jpg',remove:async()=>{}}
test('a saved cover run continues after catalog import and applies a reviewed cover without changing copies or metadata',async()=>{
 const f=await fixture([{}],undefined,imageDependencies)
 try{
  const p=await f.service.preview(1,1);let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[]});await importFixtureBook(f)
  run=await f.service.step(1,run.id);assert.equal(run.status,'completed');assert.equal(run.counters.changed,1)
  const cover=(await f.service.coverResults(1,1)).rows[0];assert.equal(cover.imported,true);assert.equal(cover.current,true)
  assert.equal((await f.pg.query<{cover_image_path:string|null}>('SELECT cover_image_path FROM titles')).rows[0].cover_image_path,null)
  const before=(await f.pg.query('SELECT data_json,result_json,status,row_version FROM catalog_import_rows')).rows
  await f.service.acceptCovers(1,1,{confirmed:true,rows:[{rowId:cover.rowId,version:cover.version}]})
  assert.equal((await f.pg.query<{cover_image_path:string}>('SELECT cover_image_path FROM titles')).rows[0].cover_image_path,'https://example.test/later-cover.jpg')
  assert.deepEqual((await f.pg.query('SELECT data_json,result_json,status,row_version FROM catalog_import_rows')).rows,before)
  assert.equal((await f.service.preview(1,1)).coverTotal,0)
 }finally{await f.pg.close()}
})
test('completed uploads can start cover lookup later; catalog edits and manual covers invalidate stale acceptance',async()=>{
 const f=await fixture([{}],undefined,imageDependencies)
 try{
  await importFixtureBook(f);const p=await f.service.preview(1,1);assert.equal(p.total,0);assert.equal(p.coverTotal,1)
  let run=await f.service.start(1,1,{kind:'cover',requestKey:randomUUID(),revision:p.revision,plans:[]});run=await f.service.step(1,run.id);const cover=(await f.service.coverResults(1,1)).rows[0]
  await f.pg.exec("UPDATE titles SET title='Edited book'");await assert.rejects(f.service.acceptCovers(1,1,{confirmed:true,rows:[{rowId:1,version:cover.version}]}),{status:409})
  await f.pg.exec("UPDATE titles SET title='Clean Code',cover_image_path='manual.jpg'");await assert.rejects(f.service.acceptCovers(1,1,{confirmed:true,rows:[{rowId:1,version:cover.version}]}),{status:409});assert.equal((await f.service.preview(1,1)).coverTotal,0)
  await assert.rejects(f.service.acceptCovers(2,1,{confirmed:true,rows:[{rowId:1,version:cover.version}]}),{status:403})
 }finally{await f.pg.close()}
})
