import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import type { Pool } from '../../config/db.js'
import { db } from '../../config/db.js'
import { createBulkBookService } from './bulk-book.service.ts'
import { reviewImport } from './catalog-enhancements.service.ts'

afterEach(()=>mock.restoreAll())
const isbn='9780132350884'
const selection={code:'005.100',source:'manual',reviewed:true}
test('new-book creation saves reviewed Dewey and audit in the copy transaction',async()=>{
  const calls:Array<{sql:string;args:unknown[]}>=[]
  let committed=false
  const connection={
    beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{},release(){},
    async execute(sql:string,args:unknown[]=[]){
      assert.equal(committed,false);calls.push({sql,args})
      if(sql.includes('FROM accounts'))return [[{role:'Librarian',account_status:'Active'}]]
      if(sql.includes('FROM categories c'))return [[{category_id:1,shelf_location:'Shelf A',shelf_column:1,shelf_row:1}]]
      if(sql.includes('FROM catalog_locations'))return [[{location_id:1,name:'Shelf A',column_count:3,row_count:5,default_capacity:20}]]
      if(sql.includes('FROM catalog_location_capacities'))return [[]]
      if(sql.includes(') AS used'))return [[{used:0}]]
      if(sql.includes('FROM titles t'))return [[{title_id:44,title:'Test',author_name:'Author',category_id:1}]]
      if(sql.includes('SELECT last_value'))return [[{last_value:0}]]
      if(sql.startsWith('SELECT title_id FROM titles'))return [[{title_id:44}]]
      if(sql.includes('SELECT pc.physical_copy_id'))return [[{physical_copy_id:201,accession_number:'TEST-ACC-1',dewey_version:0,dewey_classification_id:null,isbn,code:null}]]
      if(sql.includes('SELECT classification_id'))return [[{classification_id:9,lifecycle_status:'Active'}]]
      if(sql.includes('INSERT INTO materials'))return [{insertId:101}]
      if(sql.includes('INSERT INTO physical_copies'))return [{insertId:201}]
      return [{affectedRows:1,insertId:9}]
    },
  }
  const pool={getConnection:async()=>connection} as unknown as Pool
  const renderer=async()=>({trackingJson:'{}',qrCodeData:'qr',barcodeImageData:'bar'})
  await createBulkBookService(pool,()=>new Date('2026-11-19'),renderer).addBulk({title:'Test',author:'Author',isbn,category_id:1,shelf_location:'Shelf A',number_of_copies:1,dewey:selection},1)
  assert.ok(committed)
  assert.deepEqual(calls.find(call=>call.sql.startsWith('UPDATE physical_copies SET dewey'))?.args,[9,201])
  assert.deepEqual(calls.find(call=>call.sql.includes('INSERT INTO dewey_assignment_events'))?.args,[201,'TEST-ACC-1',null,'005.100','manual',null,1])
})
test('unreviewed new-book suggestions fail before obtaining a database connection',async()=>{
  const pool={getConnection:async()=>{throw new Error('Must not start writing')}} as unknown as Pool
  await assert.rejects(createBulkBookService(pool).addBulk({title:'Test',author:'Author',isbn,category_id:1,shelf_location:'Shelf A',number_of_copies:1,dewey:{...selection,reviewed:false}},1),{code:'DEWEY_REVIEW_REQUIRED'})
})
test('import review stores only server-validated Dewey provenance and rejects an unchecked suggestion',async()=>{
  let stored:Record<string,unknown>|undefined
  const connection={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
    async execute(sql:string,args:unknown[]=[]){
      if(sql.includes('pg_advisory_xact_lock'))return [[]]
      if(sql.includes('FROM accounts'))return [[{role:'Librarian',account_status:'Active'}]]
      if(sql.includes('SELECT * FROM catalog_import_rows'))return [[{status:'Review',row_version:1,data_json:{}}]]
      if(sql.includes('FROM categories'))return [[{category_id:1}]]
      if(sql.includes('FROM catalog_locations'))return [[{location_id:1}]]
      if(sql.includes('FROM titles t'))return [[]]
      if(sql.startsWith('UPDATE catalog_import_rows')){stored=JSON.parse(String(args[0]));return [{affectedRows:1}]}
      throw new Error('Unexpected import query')
    },
  }
  mock.method(db,'getConnection',async()=>connection as never)
  const data={title:'Test',author:'Author',isbn,copies:'1',categoryId:1,location:'Shelf A',dewey:selection,reviewedDewey:{code:'999',source:'open_library',sourceUrl:'https://untrusted.invalid'}}
  await reviewImport(1,{version:1,decision:'new',data},1)
  assert.deepEqual(stored?.reviewedDewey,{code:'005.100',source:'manual',sourceUrl:null,isbn})
  stored=undefined
  await assert.rejects(reviewImport(1,{version:1,decision:'new',data:{...data,dewey:{...selection,reviewed:false}}},1),{code:'DEWEY_REVIEW_REQUIRED'})
  assert.equal(stored,undefined)
})
