import assert from 'node:assert/strict'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import { db,dbDriver } from '../src/config/db.js'
const mode=process.argv[2]
if(dbDriver!=='postgres'||!['before','after'].includes(mode))throw Error('Use before or after against the configured Postgres database.')
const migration='030_october17_maintenance.sql',folder='output/oct17-remaining'
const tables=['accounts','users','titles','physical_copies','borrow_transactions','reservations','print_requests','print_cash_payments','ink_repository','bond_paper_stocks','ink_stock_movements','paper_stock_movements']
const additions=['historical_print_entries','print_supply_details','maintained_item_categories','maintained_stock_items','maintained_stock_movements','library_maintenance_commands','library_maintenance_events']
const checksum=createHash('sha256').update(await readFile(new URL(`../../../database/supabase/${migration}`,import.meta.url))).digest('hex')
const q=await db.getConnection()
try{
 await q.beginTransaction();await q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');await q.execute('SET LOCAL search_path TO public')
 const fingerprints:Record<string,unknown>={}
 for(const table of tables){const [r]=await q.execute<RowDataPacket[]>(`SELECT count(*)::text count,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public.${table} t`);fingerprints[table]=r[0]}
 const [applied]=await q.execute<RowDataPacket[]>('SELECT checksum FROM public.schema_migrations WHERE migration_name=?',[migration])
 if(mode==='before'){
  assert.equal(applied.length,0,'Migration must not already be applied.')
  for(const name of additions){const [rows]=await q.execute<RowDataPacket[]>('SELECT to_regclass(?) name',[`public.${name}`]);assert.equal(rows[0].name,null,'Unexpected existing table; review before applying.')}
  await mkdir(folder,{recursive:true});await writeFile(`${folder}/hosted-before.json`,JSON.stringify({migration,checksum,createdAt:new Date().toISOString(),fingerprints},null,2))
 }else{
  const before=JSON.parse(await readFile(`${folder}/hosted-before.json`,'utf8'))
  assert.equal(before.checksum,checksum);assert.equal(applied[0]?.checksum,checksum);assert.deepEqual(fingerprints,before.fingerprints,'Existing public records changed; inspect before continuing.')
  for(const name of additions){const [rows]=await q.execute<RowDataPacket[]>(`SELECT count(*)::int count FROM public.${name}`);assert.equal(rows[0].count,0,'New tables should have no seeded school data.');const [guard]=await q.execute<RowDataPacket[]>('SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(?)',[`public.${name}`]);assert.equal(guard[0].relrowsecurity,true);const [grant]=await q.execute<RowDataPacket[]>('SELECT has_table_privilege(?,?,?) anon_read,has_table_privilege(?,?,?) browser_write',['anon',`public.${name}`,'SELECT','authenticated',`public.${name}`,'INSERT']);assert.equal(grant[0].anon_read,false);assert.equal(grant[0].browser_write,false)}
  await writeFile(`${folder}/hosted-after.json`,JSON.stringify({migration,checksum,verifiedAt:new Date().toISOString(),existingRecordsUnchanged:true,newTablesEmpty:true,rlsAndGrantsPassed:true,fingerprints},null,2))
 }
 await q.commit();console.log(`PASS: ${mode} migration record fingerprints and guards. No row contents were exported.`)
}catch(e){await q.rollback();throw e}finally{q.release();await db.end()}
