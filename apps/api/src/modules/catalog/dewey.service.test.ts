import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { createDeweyService } from './dewey.service.ts'

async function fixture() {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE users(user_id BIGINT PRIMARY KEY,account_status TEXT);
    CREATE TABLE accounts(account_id BIGINT PRIMARY KEY,user_id BIGINT,role TEXT,account_status TEXT); INSERT INTO accounts VALUES(1,NULL,'Librarian','Active');
    CREATE TABLE titles(title_id BIGINT PRIMARY KEY,title TEXT,isbn TEXT,record_type TEXT,lifecycle_status TEXT);
    INSERT INTO titles VALUES(1,'Test book','9780132350884','Book','Active');
    CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,title_id BIGINT REFERENCES titles(title_id), accession_number TEXT,lifecycle_status TEXT);
    INSERT INTO physical_copies VALUES(1,1,'TEST-ACC-1','Active'),(2,1,'TEST-ACC-2','Active');`)
  await pg.exec(readFileSync(new URL('../../../../../database/supabase/069_automatic_dewey.sql', import.meta.url),'utf8'))
  const execute = async (sql: string, values: unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), values)
    return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql) ? [{ insertId: Number(Object.values(result.rows[0] ?? {})[0] ?? 0), affectedRows: result.affectedRows, rows: result.rows }, result] : [result.rows, result]
  }
  const database = { execute, getConnection: async () => ({ execute, beginTransaction:()=>pg.exec('BEGIN'),commit:()=>pg.exec('COMMIT'),rollback:()=>pg.exec('ROLLBACK'),release(){} }) } as unknown as Pool
  const lookup = { lookup: async () => ({ isbn: '9780132350884', status: 'matched' as const, candidates: [{code:'005.100',source:'open_library' as const,sourceUrl:'https://openlibrary.org/isbn/9780132350884'}] }) }
  return { pg, service: createDeweyService(database, lookup) }
}
const selection = { code:'005.100', source:'open_library', reviewed:true }
test('reviewed bulk assignment reuses classification and audits every copy; stale writes roll back', async () => {
  const {pg,service} = await fixture()
  try {
    await service.assign({ isbn:'9780132350884', selection, copies:[{id:1,version:0},{id:2,version:0}] },1)
    assert.equal((await pg.query('SELECT * FROM dewey_classifications')).rows.length,1)
    assert.equal((await pg.query('SELECT * FROM dewey_assignment_events')).rows.length,2)
    await assert.rejects(service.assign({ isbn:'9780132350884', selection:{...selection,code:'100',source:'manual'}, copies:[{id:1,version:1},{id:2,version:0}] },1),{code:'DEWEY_COPY_CHANGED'})
    assert.deepEqual((await pg.query('SELECT dewey_version FROM physical_copies ORDER BY physical_copy_id')).rows,[{dewey_version:1},{dewey_version:1}])
    assert.equal((await pg.query('SELECT * FROM dewey_assignment_events')).rows.length,2)
  } finally { await pg.close() }
})
test('review and provider provenance are enforced; copy ISBN must match the looked-up edition', async () => {
  const {pg,service} = await fixture()
  try {
    await assert.rejects(service.prepare({code:'005.100'},'9780132350884'),{code:'DEWEY_REVIEW_REQUIRED'})
    await assert.rejects(service.prepare({...selection,code:'100'},'9780132350884'),{code:'DEWEY_SELECTION_CHANGED'})
    await pg.exec("UPDATE titles SET isbn='9780062638502'")
    await assert.rejects(service.assign({isbn:'9780132350884',selection,copies:[{id:1,version:0}]},1),{code:'DEWEY_ISBN_CHANGED'})
    assert.equal((await pg.query('SELECT * FROM dewey_assignment_events')).rows.length,0)
  } finally { await pg.close() }
})
test('archived entries stay linked and readable but cannot be assigned or automatically revived', async () => {
  const {pg,service} = await fixture()
  try {
    await service.assign({isbn:'9780132350884',selection,copies:[{id:1,version:0}]},1)
    const [entry] = await service.classifications('')
    await service.saveClassification(entry.id,{description:'Programming',status:'Archived',version:entry.version},1)
    await assert.rejects(service.assign({isbn:'9780132350884',selection,copies:[{id:2,version:0}]},1),{code:'DEWEY_ARCHIVED'})
    assert.equal((await service.copies({status:'assigned'})).items[0].code,'005.100')
    await assert.rejects(service.saveClassification(entry.id,{description:'Other',status:'Active',version:entry.version},1),{code:'DEWEY_ENTRY_CHANGED'})
  } finally { await pg.close() }
})
test('a revoked Librarian cannot assign or maintain classifications',async()=>{
  const {pg,service}=await fixture()
  try{
    await pg.exec("UPDATE accounts SET role='Staff'")
    await assert.rejects(service.assign({isbn:'9780132350884',selection,copies:[{id:1,version:0}]},1),{status:403})
    await assert.rejects(service.saveClassification(null,{code:'100',description:'',status:'Active'},1),{status:403})
    assert.equal((await pg.query('SELECT * FROM dewey_assignment_events')).rows.length,0)
  }finally{await pg.close()}
})
