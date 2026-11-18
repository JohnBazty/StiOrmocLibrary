import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile,mkdir,writeFile } from 'node:fs/promises'
import type { Pool,PoolConnection,RowDataPacket } from 'mysql2/promise'
import { db } from '../src/config/db.js'
import { createPgPool } from '../src/config/pg-pool.js'
import { env } from '../src/config/env.js'
import { createMaintenanceStore } from '../src/modules/inventory/maintenance-store.ts'
import { createHistoricalPrintingService } from '../src/modules/printing/historical-print.service.ts'
import { createStockItemsService } from '../src/modules/inventory/stock-items.service.ts'
import { createSupplyDetailsService } from '../src/modules/printing/supply-details.service.ts'
import { extendedPrintingReports } from '../src/modules/printing/printing-extended-reports.ts'
import { parseFinanceFilters } from '../src/modules/printing/printing.validation.ts'
import { parseReportFilters,createLiveReportsService,exportLiveReport } from '../src/modules/reports/live-reports.service.ts'

// Every mutation is confined to a uniquely named disposable schema. The schema
// never includes public in its search path; fixture IDs refer only to fake people.
// Cleanup checks the exact generated schema name before removing this run's data.
const schema=`qa_oct17_${randomUUID().replaceAll('-','')}`
assert.match(schema,/^qa_oct17_[a-f0-9]{32}$/)
if(env.db.driver!=='postgres')throw Error('Requires configured Postgres.')
const isolated=createPgPool(env.db.connectionString,5)
const migration=await readFile(new URL('../../../database/supabase/030_october17_maintenance.sql',import.meta.url),'utf8')
async function getConnection(){
 const q=await isolated.getConnection();let active=false
 async function begin(){await q.beginTransaction();active=true;await q.execute(`SET LOCAL search_path TO ${schema},pg_catalog`)}
 return {...q,beginTransaction:begin,
  execute:async(sql:string,values:unknown[]=[])=>{if(active)return q.execute(sql,values);await begin();try{const result=await q.execute(sql,values);await q.commit();return result}catch(e){await q.rollback();throw e}finally{active=false}},
  commit:async()=>{await q.commit();active=false},rollback:async()=>{await q.rollback();active=false}}
}
const pool={getConnection,execute:async(sql:string,values:unknown[]=[])=>{const q=await getConnection();try{return await q.execute(sql,values)}finally{q.release()}}} as unknown as Pool
const baseline=await db.getConnection()
const tables=['accounts','users','titles','physical_copies','borrow_transactions','print_requests','ink_repository','bond_paper_stocks','ink_stock_movements','paper_stock_movements']
async function fingerprints(){const result:Record<string,unknown>={};for(const table of tables){const [r]=await baseline.execute<RowDataPacket[]>(`SELECT COUNT(*)::text count,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${table} t`);result[table]=r[0]}return result}
const before=await fingerprints()
try{
 await isolated.execute(`CREATE SCHEMA ${schema}`)
 const q=await getConnection()
 try{
 await q.execute(`CREATE TABLE users(user_id integer PRIMARY KEY,full_name text,school_id text,user_role text,account_status text);
 CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id integer REFERENCES users(user_id),role text,account_status text);
 CREATE TABLE academic_terms(academic_term_id bigint,academic_year text,term_name text,starts_on date,ends_on date);
 CREATE TABLE print_requests(request_id integer PRIMARY KEY,user_id integer,file_name text,page_count integer,number_of_copies integer,total_sheets integer,print_type text,paper_size text,calculated_cost numeric,payment_status text,job_status text,created_at timestamp);
 CREATE TABLE print_cash_payments(print_cash_payment_id bigint PRIMARY KEY,request_id integer,amount_paid numeric,received_at timestamp,received_by_user_id integer);
 CREATE TABLE ink_repository(ink_id integer PRIMARY KEY,cartridge_type text,color_variation text,available_bottles integer,low_stock_threshold_bottles integer);
 CREATE TABLE bond_paper_stocks(paper_stock_id integer PRIMARY KEY,paper_size_dimension text,unopened_reams integer,low_stock_threshold_reams numeric);
 CREATE TABLE ink_stock_movements(ink_stock_movement_id bigint PRIMARY KEY,ink_id integer,movement_type text,quantity_bottles integer,unit_cost_per_bottle numeric,expense_amount numeric,balance_before numeric,balance_after numeric,created_at timestamp,recorded_by_user_id integer);
 CREATE TABLE paper_stock_movements(paper_stock_movement_id bigint PRIMARY KEY,paper_stock_id integer,movement_type text,quantity_reams numeric,unit_cost_per_ream numeric,expense_amount numeric,balance_before numeric,balance_after numeric,created_at timestamp,recorded_by_user_id integer);`)
 await q.execute(migration)
 await q.execute(`INSERT INTO users VALUES (1,'QA Librarian','QA-L','Librarian','Active'),(2,'QA Reader','0000123','Student','Active'),(3,'QA Staff','QA-S','Staff','Active');
 INSERT INTO accounts VALUES (1,1,'Librarian','Active'),(2,2,'Student','Active'),(3,3,'Staff','Active');
 INSERT INTO ink_repository VALUES (1,'QA model','Black',3,1); INSERT INTO bond_paper_stocks VALUES (1,'QA paper',5,2);
 INSERT INTO print_requests VALUES (1,2,'Original file',2,1,2,'Monochrome','A4',20,'Paid','Completed','2026-01-02 02:00');
 INSERT INTO print_cash_payments VALUES(1,1,20,'2026-01-03 10:00',1);`)
 }finally{q.release()}
 const store=createMaintenanceStore(pool,'postgres'),history=createHistoricalPrintingService(store),items=createStockItemsService(store),details=createSupplyDetailsService(store)
 const originalCounts=async()=>{const [r]=await pool.execute<RowDataPacket[]>(`SELECT (SELECT count(*) FROM print_requests) prints,(SELECT sum(available_bottles) FROM ink_repository) ink,(SELECT sum(unopened_reams) FROM bond_paper_stocks) paper,(SELECT count(*) FROM ink_stock_movements) ink_moves,(SELECT count(*) FROM paper_stock_movements) paper_moves`);return r[0]}
 const original=await originalCounts(),key=()=>randomUUID()
 const body={servedAt:'2026-01-20T09:00',customerName:'QA Reader',schoolId:'0000123',reference:'QA-PAST-1',description:'QA past-month handout',billed:50,pages:'',copies:'',paymentState:'Confirmed',amountPaid:40,receivedAt:'2026-02-02T10:00',paymentMethod:'Cash',paymentEvidence:'QA original ledger 1',commandKey:key()}
 await assert.rejects(history.save(2,body),{status:403});await assert.rejects(history.list(3,{}),{status:403})
 const [saved,retry]=await Promise.all([history.save(1,body),history.save(1,body)]);assert.equal(saved.entry_id,retry.entry_id)
 await assert.rejects(history.save(1,{...body,billed:60}),{code:'SUBMISSION_CHANGED'})
 await assert.rejects(history.save(1,{...body,commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 await assert.rejects(history.save(1,{...body,description:'Separate job',commandKey:key()}),{code:'HISTORY_POSSIBLE_DUPLICATE'})
 const preview=await history.preview(1,{...body,description:'Separate job'});assert.equal(preview.possibleDuplicates.length,1)
 const linkedPreview=await history.preview(1,{...body,customerName:'Mistyped name',description:'Separate linked job'})
 assert.equal(linkedPreview.input.customerName,'QA Reader','Review must show the saved account identity, not silently replace it afterward.')
 await assert.rejects(history.save(1,{...body,customerName:'Mistyped name',commandKey:key(),duplicateAcknowledged:true}),{code:'MAINTENANCE_INVALID'})
 for(let n=0;n<11;n++)await history.save(1,{...body,description:`Distinct unpaid historical job ${n}`,reference:`QA-OLDER-${n}`,paymentState:'Unpaid',commandKey:key(),duplicateAcknowledged:true})
 await assert.rejects(history.save(1,{...body,commandKey:key(),duplicateAcknowledged:true}),{code:'MAINTENANCE_INVALID'},'Exact duplicate protection must not stop at the 10 warning records.')
 await assert.rejects(history.save(1,{...body,customerName:'QA Reader',description:'Original file',servedAt:'2026-01-02T10:00',billed:20,amountPaid:20,commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 await assert.rejects(history.save(1,{...body,receivedAt:'',commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 const unknown=await history.save(1,{...body,customerName:'QA Unknown',schoolId:'',reference:'QA-NO-PAY',description:'QA incomplete payment',paymentState:'Unverified',receivedAt:'',commandKey:key()})
 assert.equal(unknown.user_id,null)
 const jan=parseFinanceFilters({period:'monthly',month:'2026-01'}),feb=parseFinanceFilters({period:'monthly',month:'2026-02'}),reports=extendedPrintingReports(pool)
 assert.equal((await reports.revenueSummary(jan)).total_revenue,20);assert.equal((await reports.revenueSummary(feb)).total_revenue,40)
 const live=createLiveReportsService(pool,'postgres'),january=await live.read(1,parseReportFilters({kind:'printing',period:'custom',from:'2026-01-01',to:'2026-01-31',q:'QA past-month'}))
 assert.equal(january.total,1);assert.equal(january.rows[0].source,'Historical entry');assert.equal(january.rows[0].page_count,null)
 const corrected=await history.save(1,{...body,description:'QA corrected handout',version:saved.version,reason:'QA transcription correction',duplicateAcknowledged:true,commandKey:key()},saved.entry_id)
 assert.equal(corrected.version,2);assert.equal((await history.history(1,saved.entry_id)).length,2)
 await assert.rejects(history.save(1,{...body,version:1,reason:'Stale correction',commandKey:key()},saved.entry_id),{code:'HISTORY_CHANGED'})
 await history.void(1,saved.entry_id,{version:2,reason:'QA void fixture',commandKey:key()});assert.equal((await reports.revenueSummary(feb)).total_revenue,0)
 assert.deepEqual(await originalCounts(),original)
 // A profile updates descriptive information and thresholds only.
 await details.save(1,'paper',1,{version:0,paperType:'Bond',sizeName:'QA A4',width:210,height:297,dimensionUnit:'mm',threshold:2,commandKey:key()})
 await details.save(1,'ink',1,{version:0,brand:'QA brand',typeModel:'QA ink',compatiblePrinter:'QA printer',threshold:1,commandKey:key()})
 await assert.rejects(async()=>details.save(1,'paper',1,{version:0,threshold:3,commandKey:key()}),{code:'SUPPLY_CHANGED'})
 await assert.rejects(async()=>details.save(1,'paper',1,{version:1,width:1,height:'',dimensionUnit:'mm',threshold:2,commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 assert.deepEqual(await originalCounts(),original)
 const category=(await items.category(1,'merchandise',{name:'QA school supplies',commandKey:key()})).categoryId!
 const printCategory=(await items.category(1,'printing',{name:'QA materials',commandKey:key()})).categoryId!
 await assert.rejects(items.save(1,'printing',{name:'Wrong category',categoryId:category,unit:'pieces',commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 const itemBody={name:'QA pen',categoryId:category,unit:'pieces',price:15,threshold:2,opening:3,commandKey:key()}
 const item=(await items.save(1,'merchandise',itemBody)).itemId!
 assert.equal((await items.save(1,'merchandise',itemBody)).itemId,item)
 const stockMove={action:'Restock',quantity:2,unitCost:5,version:1,reason:'QA restock',commandKey:key()}
 const [m1,m2]=await Promise.all([items.movement(1,'merchandise',item,stockMove),items.movement(1,'merchandise',item,stockMove)]);assert.equal(m1.movementId,m2.movementId);assert.equal(m1.balanceAfter,5)
 const competing=await Promise.allSettled([items.movement(1,'merchandise',item,{...stockMove,version:2,commandKey:key()}),items.movement(1,'merchandise',item,{...stockMove,version:2,commandKey:key()})]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1)
 let row=(await items.list(1,'merchandise')).items[0]
 await assert.rejects(items.movement(1,'printing',item,{...stockMove,version:row.version,commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 await assert.rejects(items.movement(1,'merchandise',item,{...stockMove,action:'Use',quantity:999,version:row.version,commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 await items.save(1,'merchandise',{name:row.name,categoryId:category,unit:row.unit,price:18,threshold:2,state:'Archived',version:row.version,commandKey:key()},item)
 row=(await items.list(1,'merchandise')).items[0];assert.equal(Number(row.balance),7)
 await assert.rejects(items.movement(1,'merchandise',item,{...stockMove,version:row.version,commandKey:key()}),{code:'MAINTENANCE_INVALID'})
 await items.save(1,'merchandise',{name:row.name,categoryId:category,unit:row.unit,price:18,threshold:2,state:'Active',version:row.version,commandKey:key()},item)
 const material=(await items.save(1,'printing',{name:'QA laminating film',categoryId:printCategory,unit:'metres',price:10,threshold:1,opening:0,commandKey:key()})).itemId!
 await items.movement(1,'printing',material,{action:'Restock',quantity:2.5,unitCost:12,version:1,reason:'QA actual cost',commandKey:key()})
 const expenses=await pool.execute<RowDataPacket[]>('SELECT * FROM october17_supply_expenses');assert.equal(expenses[0].length,1);assert.equal(Number(expenses[0][0].expense),30);assert.equal(expenses[0][0].unit,'metres')
 const itemHistory=await items.history(1,'merchandise',item);assert.equal(itemHistory.movements.length,3);assert.ok(itemHistory.events.length>=3)
 const [snap]=await pool.execute<RowDataPacket[]>('SELECT * FROM october17_supply_snapshot');assert.ok(snap.some(r=>r.specifications.includes('210.000')));assert.equal(snap.length,3)
 // Verify server-only grants and append-only database guards on real Postgres.
 const security=await getConnection()
 try{
  const [grants]=await security.execute<RowDataPacket[]>(`SELECT has_table_privilege('anon','${schema}.historical_print_entries','SELECT') anon_read,has_table_privilege('authenticated','${schema}.maintained_stock_items','INSERT') browser_write`);assert.equal(grants[0].anon_read,false);assert.equal(grants[0].browser_write,false)
  await assert.rejects(security.execute('DELETE FROM library_maintenance_events'),/append-only/)
  await assert.rejects(security.execute('UPDATE maintained_stock_movements SET quantity=0'),/append-only/)
  await assert.rejects(security.execute("INSERT INTO print_supply_details(paper_stock_id,width,height,dimension_unit,updated_by) VALUES (999,1,NULL,'mm',1)"))
 }finally{security.release()}
 await mkdir('output/oct17-remaining',{recursive:true})
 const sample=await live.read(1,parseReportFilters({kind:'supplies'}))
 const chunks:Buffer[]=[];for await(const chunk of exportLiveReport(sample,'pdf'))chunks.push(Buffer.from(chunk))
 await writeFile('output/oct17-remaining/supply-specifications.pdf',Buffer.concat(chunks))
 const result={status:'passed',schema,migration:'030_october17_maintenance.sql',checks:['historical service/payment dates','unverified revenue exclusion','idempotent retries','possible/exact duplicates','correction/void history','stock unchanged by history/details','stock concurrency and unit guards','archive/restore','cross-kind/role boundaries','real expense facts','RLS/revoked grants','append-only ledgers','filtered report integration'],finishedAt:new Date().toISOString()}
 assert.deepEqual(await fingerprints(),before)
 await writeFile('output/oct17-remaining/acceptance.json',JSON.stringify(result,null,2))
 console.log('PASS: isolated migration and remaining-phase acceptance; original public records unchanged.')
}finally{
 assert.match(schema,/^qa_oct17_[a-f0-9]{32}$/)
 await isolated.execute(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
 baseline.release();await isolated.end();await db.end()
}
