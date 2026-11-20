import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {toPgPlaceholders} from '../../config/sql.js'
import type {Pool} from '../../config/db.js'
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test'
const {createStocktakeService}=await import('./stocktake.service.ts')
const {HttpError}=await import('../../core/http-error.ts')
type Applier=(item:{kind:string;id:number;barcode:string},target:'for_repair'|'damaged',actor:{userId:number|null;label:string})=>Promise<void>

async function fixture(){
 const pg=new PGlite()
 await pg.exec(`CREATE TABLE users(user_id bigint primary key);
 CREATE TABLE categories(category_id bigint primary key,category_name text);
 CREATE TABLE titles(title_id bigint primary key,title text,category_id bigint,lifecycle_status text);
 CREATE TABLE physical_copies(physical_copy_id bigint primary key,title_id bigint,material_id bigint,barcode text,accession_number text,shelf_location text,shelf_column smallint,shelf_row smallint,condition_status text,availability_status text,lifecycle_status text,row_version integer);
 CREATE TABLE research_inventory(research_inventory_id bigint primary key,title_id bigint,title text,barcode text,accession_number text,shelf_location text,shelf_column smallint,shelf_row smallint,condition_state text,availability_status text,lifecycle_status text,row_version integer);
 CREATE TABLE borrow_transactions(physical_copy_id bigint,material_id bigint,transaction_status text,returned_at timestamp,lost_confirmed_at timestamp);
 CREATE TABLE in_library_uses(physical_copy_id bigint,research_inventory_id bigint,ended_at timestamp);
 CREATE TABLE reservations(assigned_physical_copy_id bigint,reservation_status text);
 INSERT INTO titles VALUES(1,'Synthetic book',null,'Active');
 INSERT INTO physical_copies VALUES(1,1,1,'000123','A1','Shelf A',1,1,'Good','Available','Active',1),(2,1,2,'000124','A2','Shelf A',1,1,'Good','Borrowed','Active',1);
 INSERT INTO research_inventory VALUES(1,null,'Synthetic research','000125','R1','Shelf B',1,1,'damaged','available','Active',1);
 INSERT INTO borrow_transactions VALUES(2,2,'Borrowed',null,null);`)
 await pg.exec(await readFile(new URL('../../../../../database/supabase/018_stocktake_sessions.sql',import.meta.url),'utf8'))
 const execute=async(sql:string,values:readonly unknown[]=[])=>{const write=/^\s*(INSERT|UPDATE|DELETE)/i.test(sql);const query=/^\s*INSERT/i.test(sql)&&!/RETURNING/i.test(sql)?sql+' RETURNING *':sql;const result=await pg.query(toPgPlaceholders(query),[...values]);return [write?{insertId:Number(Object.values(result.rows[0]??{})[0]??0),affectedRows:result.affectedRows,rows:result.rows}:result.rows,result]}
 const q={execute,query:execute,beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){},ping:async()=>{}}
 const pool={execute,query:execute,getConnection:async()=>q,end:()=>pg.close(),driver:'postgres'} as unknown as Pool
 let apply:Applier|undefined
  const service=createStocktakeService(pool,{applyCondition:async(item,target,who)=>{if(!apply)throw new Error('unexpected condition update');await apply(item,target,who)}})
  return {pg,service,setApply:(fn:Applier)=>{apply=fn}}
}
const actor={userId:null,label:'Synthetic librarian'}
test('real SQL: mixed count, leading zeros, idempotent retry, duplicates, return, review freeze and cancellation',async()=>{
 const {pg,service}=await fixture()
 try{
 const first=await service.start({name:'Synthetic count',kind:'both',location:''},actor),id=first.session.stocktake_session_id
 assert.equal(first.report.summary.expected,3);assert.equal(first.report.summary.onLoan,1)
 const body={condition:'good',code:'000123',location:'Shelf B',requestKey:'scan-one'}
 const scan=await service.scan(id,body,actor);assert.equal(scan.report.summary.found,1)
 assert.equal((await service.scan(id,body,actor)).report.summary.duplicates,0)
 assert.equal((await service.scan(id,{...body,requestKey:'scan-two'},actor)).report.summary.duplicates,1)
 await assert.rejects(service.scan(id,{...body,code:'other'},actor),/belongs to another/)
 await service.scan(id,{condition:'damaged',code:'unknown',location:'Shelf A',requestKey:'scan-three'},actor)
 await pg.exec("UPDATE borrow_transactions SET transaction_status='Returned',returned_at=NOW(); UPDATE physical_copies SET availability_status='Available',row_version=2 WHERE physical_copy_id=2")
 const current=await service.get(id);assert.equal(current.report.summary.onLoan,0);assert.equal(current.report.summary.changed,1)
 await assert.rejects(service.finish(id,{reviewToken:first.reviewToken,reviewed:true,note:'Reviewed'},actor),/count changed/)
 const finished=await service.finish(id,{reviewToken:current.reviewToken,reviewed:true,note:'Synthetic follow-up'},actor)
 await pg.exec("UPDATE physical_copies SET shelf_location='Moved',lifecycle_status='Archived',row_version=3")
 assert.deepEqual((await service.get(id)).report,finished.report)
 assert.deepEqual((await service.finish(id,{},actor)).report,finished.report)
 await assert.rejects(service.scan(id,{...body,requestKey:'after'},actor),/finished/)
 const second=await service.start({name:'Cancel count',kind:'research',location:''},actor)
 await service.cancel(second.session.stocktake_session_id,{reason:'Synthetic cancellation'},actor)
 await assert.rejects(service.scan(second.session.stocktake_session_id,body,actor),/finished/)
 const state=await pg.query<{condition_status:string}>('SELECT condition_status FROM physical_copies');assert(state.rows.every(r=>r.condition_status==='Good'))
 }finally{await pg.close()}
})

test('camera flow: lookup identifies the copy, repairable/damaged scans update inventory once, other scans only observe',async()=>{
  const {pg,service,setApply}=await fixture()
  try{
  const calls:Array<{kind:string;barcode:string;target:string}>=[]
  let failWith:Error|null=null
  setApply(async(item,target)=>{calls.push({kind:item.kind,barcode:item.barcode,target});if(failWith)throw failWith
   if(item.kind==='book')await pg.query('UPDATE physical_copies SET condition_status=$1,row_version=row_version+1 WHERE physical_copy_id=$2',[target==='for_repair'?'For Repair':'Damaged',item.id])
   else await pg.query('UPDATE research_inventory SET condition_state=$1,row_version=row_version+1 WHERE research_inventory_id=$2',[target,item.id])})
  const id=(await service.start({name:'Camera count',kind:'both',location:''},actor)).session.stocktake_session_id
  const found=await service.lookup(id,{code:'000123',codeType:'barcode'})
  assert.equal(found.found,true);if(found.found){assert.equal(found.item.title,'Synthetic book');assert.equal(found.inScope,true);assert.equal(found.alreadyCounted,false)}
  assert.deepEqual(await service.lookup(id,{code:'999999',codeType:'barcode'}),{found:false,code:'999999'})
  await assert.rejects(service.lookup(id,{code:'',codeType:'barcode'}),/Enter a barcode/)
  const good=await service.scan(id,{condition:'good',code:'000123',location:'Shelf A',requestKey:'cam-good'},actor)
  assert.equal(good.scanResult.inventory.status,'none');assert.equal(calls.length,0)
  const repair=await service.scan(id,{condition:'for_repair',code:'000123',location:'Shelf A',requestKey:'cam-repair'},actor)
  assert.equal(repair.scanResult.inventory.status,'applied');assert.equal(repair.scanResult.inventory.to,'For Repair');assert.equal(calls.length,1)
  assert.equal(repair.report.summary.changed,0,'the count must not flag its own condition change')
  const counted=await service.lookup(id,{code:'000123',codeType:'barcode'});assert.equal(counted.found&&counted.alreadyCounted,true)
  const replay=await service.scan(id,{condition:'for_repair',code:'000123',location:'Shelf A',requestKey:'cam-repair'},actor)
  assert.equal(replay.scanResult.inventory.status,'applied');assert.equal(calls.length,1,'a retried scan must not update inventory again')
  assert.equal((await service.scan(id,{condition:'for_repair',code:'000123',location:'Shelf A',requestKey:'cam-repair-2'},actor)).scanResult.inventory.status,'unchanged');assert.equal(calls.length,1)
  assert.equal((await service.scan(id,{condition:'damaged',code:'000125',location:'Shelf B',requestKey:'cam-damaged'},actor)).scanResult.inventory.status,'unchanged')
  await pg.exec("UPDATE physical_copies SET condition_status='Lost' WHERE physical_copy_id=2")
  assert.equal((await service.scan(id,{condition:'damaged',code:'000124',location:'Shelf A',requestKey:'cam-lost'},actor)).scanResult.inventory.status,'skipped')
  await pg.exec("UPDATE physical_copies SET condition_status='Good',lifecycle_status='Archived' WHERE physical_copy_id=2")
  assert.equal((await service.scan(id,{condition:'damaged',code:'000124',location:'Shelf A',requestKey:'cam-archived'},actor)).scanResult.inventory.status,'skipped')
  await pg.exec("UPDATE physical_copies SET lifecycle_status='Active' WHERE physical_copy_id=2");failWith=new HttpError(422,'LOAN','This item is on loan.')
  const failed=await service.scan(id,{condition:'damaged',code:'000124',location:'Shelf A',requestKey:'cam-failed'},actor)
  assert.equal(failed.scanResult.inventory.status,'failed');assert.match(failed.scanResult.inventory.message??'',/on loan/)
  failWith=new Error('database down')
  await assert.rejects(service.scan(id,{condition:'damaged',code:'000124',location:'Shelf A',requestKey:'cam-failed-hard'},actor),/database down/)
  }finally{await pg.close()}
})
test('scope: shelf names match regardless of case or spaces, and a copy shelved after the count started is counted in scope',async()=>{
 const {pg,service}=await fixture()
 try{
 const first=await service.start({name:'Shelf A count',kind:'book',location:'shelf a'},actor),id=first.session.stocktake_session_id
 assert.equal(first.report.summary.expected,2)
 await pg.exec(`INSERT INTO physical_copies VALUES(3,1,3,'000126','A3','SHELF A ',1,1,'Good','Available','Active',1)`)
 const lookup=await service.lookup(id,{code:'000126'})
 assert.equal(lookup.found&&lookup.inScope,true)
 const scanned=await service.scan(id,{condition:'good',code:'000126',location:'Shelf A',requestKey:'late-copy'},actor)
 assert.equal(scanned.report.summary.expected,3)
 assert.equal(scanned.report.summary.unexpected,0)
 assert.equal(scanned.report.summary.found,1)
 const other=await service.lookup(id,{code:'000125'})
 assert.equal(other.found&&other.inScope,false)
 }finally{await pg.close()}
})
