// One reviewed additive migration, in the repository-owned public schema only.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import pg from 'pg'
import {env} from '../src/config/env.js'
const name='058_push_and_document_retention.sql',previous='057_urgent_cases.sql'
const source=readFileSync(new URL(`../../../database/supabase/${name}`,import.meta.url),'utf8')
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const tables=['users','accounts','borrow_transactions','fines','fine_infractions','fine_payment_receipts','fine_payment_allocations','print_requests','print_cash_payments','print_payment_receipts','customer_invoices','announcements','notifications']
const client=new pg.Client({connectionString:env.db.connectionString,options:'-c timezone=Asia/Manila'})
await client.connect()
try{
 await client.query('BEGIN');await client.query('SET LOCAL search_path TO public');await client.query("SELECT pg_advisory_xact_lock(hashtext('sti_phase5_058'))")
 const baseline=await client.query('SELECT checksum FROM public.schema_migrations WHERE migration_name=$1',[previous])
 assert.equal(baseline.rows[0]?.checksum,hash(readFileSync(new URL(`../../../database/supabase/${previous}`,import.meta.url),'utf8')),'Live 057 checksum must match reviewed production source')
 const applied=await client.query('SELECT checksum FROM public.schema_migrations WHERE migration_name=$1',[name])
 if(applied.rows[0])assert.equal(applied.rows[0].checksum,hash(source))
 else if(process.argv.includes('--apply')){
  await client.query(`LOCK TABLE ${tables.map(t=>`public.${t}`).join(',')} IN SHARE MODE`)
  const fingerprints=()=>Promise.all(tables.map(async t=>(await client.query(`SELECT COUNT(*)::text AS count,md5(COALESCE(string_agg(md5((to_jsonb(t)-'document_retention_hold'-'documents_expired_at')::text),'' ORDER BY md5((to_jsonb(t)-'document_retention_hold'-'documents_expired_at')::text)),'')) AS digest FROM public.${t} t`)).rows[0]))
  const before=await fingerprints();await client.query(source);assert.deepEqual(await fingerprints(),before,'Original rows and field values must remain unchanged')
  await client.query('INSERT INTO public.schema_migrations(migration_name,checksum) VALUES($1,$2)',[name,hash(source)])
  for(const table of ['web_push_devices','web_push_deliveries','print_document_manifest','print_retention_events']){
   assert.equal((await client.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true)
   for(const role of ['anon','authenticated'])assert.equal((await client.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,`public.${table}`,'SELECT,INSERT,UPDATE,DELETE'])).rows[0].allowed,false)
  }
  console.log(`Migration 058 applied; ${tables.length} existing-table fingerprints unchanged. Private tables deny browser-role access. Next unused: 059.`)
 }
 else console.log('Production 057 baseline verified. Migration 058 is ready; no changes applied.')
 const due=await client.query("SELECT COUNT(*)::int AS count FROM public.print_requests WHERE job_status='Completed' AND completed_at<=NOW()-INTERVAL '10 days'")
 console.log('Completed jobs reaching the ten-day retention boundary:',due.rows[0].count)
 await client.query('COMMIT')
}catch(e){await client.query('ROLLBACK');throw e}finally{await client.end()}
