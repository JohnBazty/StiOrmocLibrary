import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { createAutomaticDewey } from './dewey-auto-assign.service.ts'
import { LOCAL_DDC_VERSION } from './ddc-subject-rules.ts'
import { createHmac } from 'node:crypto'

async function fixture() {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE users(user_id bigint PRIMARY KEY,account_status text);
    CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint,role text,account_status text);
    INSERT INTO accounts VALUES(1,NULL,'Librarian','Active');
    CREATE TABLE titles(title_id bigint PRIMARY KEY,title text,isbn text,record_type text,lifecycle_status text);
    INSERT INTO titles VALUES(1,'First','9780132350884','Book','Active'),(2,'Second',NULL,'Book','Active'),(3,'Third','9780132350884','Book','Active');
    CREATE TABLE physical_copies(physical_copy_id bigint PRIMARY KEY,title_id bigint,accession_number text,lifecycle_status text);
    INSERT INTO physical_copies VALUES(1,1,'TEST-1','Active'),(2,1,'TEST-2','Active'),(3,2,'TEST-3','Active'),(4,3,'TEST-4','Active');`)
  await pg.exec(readFileSync(new URL('../../../../../database/supabase/069_automatic_dewey.sql',import.meta.url),'utf8'))
  const execute = async (statement:string,values:unknown[]=[]) => {
    const result = await pg.query<Record<string,unknown>>(toPgPlaceholders(statement),values)
    return /^\s*(INSERT|UPDATE|DELETE)/i.test(statement) ? [{affectedRows:result.affectedRows,insertId:Number(Object.values(result.rows[0]??{})[0]??0)}] : [result.rows]
  }
  const database = {execute,getConnection:async()=>({execute,beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){}})} as unknown as Pool
  let calls=0
  const lookup={lookup:async(isbn:unknown)=>{calls++;return {isbn:String(isbn),status:'matched' as const,candidates:[{code:'005.100',source:'open_library' as const,sourceUrl:'https://openlibrary.org/isbn/'+isbn}]}}}
  return {pg,lookup,calls:()=>calls,database,service:createAutomaticDewey(database,lookup,'test-secret')}
}

test('automatic selection saves one exact match without claiming review; replay never overwrites',async()=>{
  const {pg,service}=await fixture()
  try {
    const scope=await service.start({titleIds:[1]},1)
    const result=await service.step(scope.token,1)
    assert.equal(result.assignedCopies,2)
    assert.equal(result.outcome,'assigned')
    assert.equal(result.nextToken,null)
    assert.equal((await service.step(scope.token,1)).assignedCopies,0)
    assert.equal((await pg.query<Record<string,unknown>>('SELECT * FROM dewey_assignment_events')).rows.length,2)
    assert.equal((await pg.query<Record<string,unknown>>('SELECT source FROM dewey_assignment_events LIMIT 1')).rows[0].source,'open_library')
    assert.equal((await pg.query<Record<string,unknown>>('SELECT dewey_classification_id FROM physical_copies WHERE physical_copy_id=4')).rows[0].dewey_classification_id,null)
  } finally {await pg.close()}
})

test('all-books scope spans titles, skips missing ISBN and excludes later copies',async()=>{
  const {pg,service}=await fixture()
  try {
    const scope=await service.start({all:true},1)
    assert.equal(scope.books,3);assert.equal(scope.copies,4)
    await pg.exec("INSERT INTO physical_copies(physical_copy_id,title_id,accession_number,lifecycle_status) VALUES(5,1,'TEST-5','Active')")
    let token:string|null=scope.token
    const outcomes:string[]=[]
    while(token){const result=await service.step(token,1);outcomes.push(result.outcome);token=result.nextToken}
    assert.deepEqual(outcomes,['assigned','missing_isbn','assigned'])
    assert.equal((await pg.query<Record<string,unknown>>('SELECT dewey_classification_id FROM physical_copies WHERE physical_copy_id=5')).rows[0].dewey_classification_id,null)
  } finally {await pg.close()}
})

test('tampered scope, another actor, and revoked permission cannot save',async()=>{
  const {pg,service}=await fixture()
  try {
    const scope=await service.start({all:true},1)
    await assert.rejects(service.step(scope.token+'x',1),{status:409})
    await assert.rejects(service.step(scope.token.split('.')[0]+'.'+'é'.repeat(43),1),{status:409})
    await assert.rejects(service.step(scope.token,2),{status:409})
    await pg.exec("UPDATE accounts SET role='Staff'")
    await assert.rejects(service.step(scope.token,1),{status:403})
    assert.equal((await pg.query<Record<string,unknown>>('SELECT * FROM dewey_assignment_events')).rows.length,0)
  } finally {await pg.close()}
})

test('multiple suggestions and provider failure remain unassigned',async()=>{
  const {pg,lookup,service}=await fixture()
  try {
    const scope=await service.start({titleIds:[1]},1)
    lookup.lookup=async()=>({isbn:'9780132350884',status:'multiple' as never,candidates:[{code:'100',source:'open_library',sourceUrl:'https://openlibrary.org/isbn/9780132350884'},{code:'200',source:'open_library',sourceUrl:'https://openlibrary.org/isbn/9780132350884'}]})
    assert.equal((await service.step(scope.token,1)).outcome,'multiple')
    lookup.lookup=async()=>({isbn:'9780132350884',status:'unavailable' as never,candidates:[]})
    assert.equal((await service.step(scope.token,1)).outcome,'unavailable')
    assert.equal((await pg.query<Record<string,unknown>>('SELECT * FROM dewey_assignment_events')).rows.length,0)
  } finally {await pg.close()}
})

test('large titles use bounded saves and continue the same title without duplicating assignments',async()=>{
 const {pg,service}=await fixture()
 try{
  await pg.exec("INSERT INTO physical_copies(physical_copy_id,title_id,accession_number,lifecycle_status) SELECT id,1,'TEST-'||id,'Active' FROM generate_series(10,65) id")
  const scope=await service.start({titleIds:[1]},1)
  const first=await service.step(scope.token,1)
  assert.equal(first.assignedCopies,50)
  assert.equal(first.remainingForTitle,true)
  assert.ok(first.nextToken)
  const second=await service.step(first.nextToken,1)
  assert.equal(second.assignedCopies,8)
  assert.equal(second.nextToken,null)
  assert.equal((await pg.query('SELECT * FROM dewey_assignment_events')).rows.length,58)
 }finally{await pg.close()}
})

test('a librarian edit made during lookup is preserved and an ISBN change is rejected',async()=>{
 const {pg,lookup,service}=await fixture()
 try{
  const scope=await service.start({titleIds:[1]},1)
  const original=lookup.lookup
  lookup.lookup=async(isbn)=>{
   await pg.exec("INSERT INTO dewey_classifications(classification_id,code) VALUES(9,'100'); UPDATE physical_copies SET dewey_classification_id=9,dewey_version=1 WHERE physical_copy_id=1")
   return original(isbn)
  }
  assert.equal((await service.step(scope.token,1)).assignedCopies,1)
  assert.equal((await pg.query<Record<string,unknown>>('SELECT dewey_classification_id FROM physical_copies WHERE physical_copy_id=1')).rows[0].dewey_classification_id,9)
  const later=await service.start({titleIds:[3]},1)
  lookup.lookup=async(isbn)=>{await pg.exec("UPDATE titles SET isbn='9780062638504' WHERE title_id=3");return original(isbn)}
  assert.equal((await service.step(later.token,1)).outcome,'changed')
 }finally{await pg.close()}
})

test('missing-book search reports whole-library totals and validates selection and page inputs',async()=>{
 const {pg,service}=await fixture()
 try{
  const books=await service.books({q:'First',page:1})
  assert.equal(books.total,1)
  assert.equal(books.libraryTotal,3)
  assert.equal(books.items[0].copies,2)
  await assert.rejects(service.books({page:1.5}),{status:422})
  await assert.rejects(service.start({titleIds:[]},1),{status:422})
  await assert.rejects(service.start({all:true,titleIds:[1]},1),{status:422})
  await assert.rejects(service.start({titleIds:[999]},1),{status:422})
 }finally{await pg.close()}
})

test('local automatic DDC saves Tagalog titles without ISBN and audits the rule revision',async()=>{
 const {pg,database}=await fixture()
 try{
  await pg.exec("ALTER TABLE titles ADD COLUMN call_number text,ADD COLUMN row_version int DEFAULT 1,ADD COLUMN updated_at timestamptz; CREATE TABLE authors(author_id bigint,title_id bigint,author_order int,author_name text); CREATE TABLE catalog_title_details(title_id bigint,synopsis text); UPDATE titles SET title='Panimula sa Pisika',isbn=NULL WHERE title_id=1")
  await pg.exec(readFileSync(new URL('../../../../../database/supabase/073_local_ddc_cutters.sql',import.meta.url),'utf8'))
  const local=createAutomaticDewey(database,undefined,'local-test')
  const scope=await local.start({titleIds:[1]},1)
  assert.equal((await local.step(scope.token,1)).assignedCopies,2)
  assert.equal((await pg.query<Record<string,unknown>>('SELECT source,source_url FROM dewey_assignment_events LIMIT 1')).rows[0].source,'local_rule')
  const [{code}]= (await pg.query<{code:string}>('SELECT code FROM dewey_classifications')).rows
  assert.equal(code,'530')
 }finally{await pg.close()}
})

test('local all-books run assigns sections, keeps prior decimals, and leaves vague books for review', async () => {
  const { pg, database } = await fixture()
  try {
    await pg.exec(`ALTER TABLE titles ADD COLUMN call_number text, ADD COLUMN row_version int DEFAULT 1, ADD COLUMN updated_at timestamptz;
      CREATE TABLE authors(author_id bigint,title_id bigint,author_order int,author_name text);
      CREATE TABLE catalog_title_details(title_id bigint,synopsis text);
      UPDATE titles SET isbn=NULL, title=CASE title_id WHEN 1 THEN 'Panimula sa Algebra' WHEN 2 THEN 'Mga Batayan ng Aritmetika' ELSE 'Bagong book' END;
      INSERT INTO dewey_classifications(classification_id,code) VALUES(90,'005.100');
      UPDATE physical_copies SET dewey_classification_id=90 WHERE physical_copy_id=1;`)
    await pg.exec(readFileSync(new URL('../../../../../database/supabase/073_local_ddc_cutters.sql',import.meta.url),'utf8'))
    const local = createAutomaticDewey(database, undefined, 'local-test')
    const scope = await local.start({ all: true }, 1)
    let token: string | null = scope.token
    const outcomes: string[] = []
    while (token) {
      const result = await local.step(token, 1)
      outcomes.push(result.outcome)
      token = result.nextToken
    }
    assert.deepEqual(outcomes, ['assigned', 'assigned', 'needs_review'])
    const assigned = await pg.query<{code:string|null}>(`SELECT d.code FROM physical_copies pc LEFT JOIN dewey_classifications d ON d.classification_id=pc.dewey_classification_id ORDER BY pc.physical_copy_id`)
    assert.deepEqual(assigned.rows.map(row => row.code), ['005.100', '512', '513', null])
    const events = await pg.query<{source:string;source_url:string}>('SELECT source,source_url FROM dewey_assignment_events ORDER BY physical_copy_id')
    assert.equal(events.rows.length, 2)
    assert.deepEqual(events.rows.map(row => row.source_url), ['512', '513'].map(code => 'local-rule:' + LOCAL_DDC_VERSION + ':' + code))
    assert.ok(events.rows.every(row => row.source === 'local_rule'))
    assert.equal((await local.step(scope.token, 1)).assignedCopies, 0)
    assert.equal((await pg.query('SELECT * FROM dewey_assignment_events')).rows.length, 2)
  } finally { await pg.close() }
})

test('local runs from a previous rule revision cannot continue after reference changes', async () => {
  const payload = Buffer.from(JSON.stringify({actor:1,expires:Date.now()+60000,maxCopy:10,after:0,titleIds:null,ruleVersion:'local-subjects-2026-11-19-v1'})).toString('base64url')
  const signature = createHmac('sha256','local-test').update('dewey-auto:'+payload).digest('base64url')
  const database = { execute:async()=>{throw new Error('Expired rule scopes must not query catalog data')} } as unknown as Pool
  const local = createAutomaticDewey(database,undefined,'local-test')
  await assert.rejects(local.step(payload+'.'+signature,1),{code:'DEWEY_SCOPE_EXPIRED'})
})
