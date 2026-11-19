import test from 'node:test'
import assert from 'node:assert/strict'
import {borrowerReturnList,returnListPage} from './borrower-return-list.ts'
test('return list scopes by resolved borrower, preserves same-title copy choices and paginates',async()=>{
 let values:unknown[]=[],query=''
 const q={execute:async(sql:string,args:unknown[])=>{query=sql;values=args;return [Array.from({length:51},(_,i)=>({id:i+1,title:'Same title',barcode:'COPY-'+i,status:i===0?'Overdue':'Borrowed'}))]}}
 const result=await borrowerReturnList(q as never,42,2)
 assert.deepEqual(values,[42,50]);assert.equal(result.rows.length,50);assert.equal(result.more,true)
 assert.notEqual(result.rows[0].barcode,result.rows[1].barcode)
 assert.match(query,/bt.user_id=\?/);assert.match(query,/returned_at IS NULL/);assert.match(query,/'Borrowed','Overdue'/)
 for(const value of [0,-1,1.5,'wrong',Infinity])assert.throws(()=>returnListPage(value))
})
test('real Postgres list excludes other users, pending/returned/lost loans while retaining overdue copy choices',async()=>{
 const {PGlite}=await import('@electric-sql/pglite')
 const {toPgPlaceholders}=await import('../../config/sql.js')
 const pg=new PGlite()
 try{
  await pg.exec(`CREATE TABLE titles(title_id int,title text,cover_image_path text);
   CREATE TABLE materials(material_id int,title text,barcode text);
   CREATE TABLE physical_copies(physical_copy_id int,title_id int,barcode text);
   CREATE TABLE borrow_transactions(transaction_id int,user_id int,physical_copy_id int,material_id int,transaction_status text,borrowed_at timestamp,due_at timestamp,returned_at timestamp);
   INSERT INTO titles VALUES(1,'Same book',NULL);INSERT INTO physical_copies VALUES(1,1,'COPY-A'),(2,1,'COPY-B');
   INSERT INTO borrow_transactions VALUES(1,42,1,NULL,'Borrowed',NOW(),NOW(),NULL),(2,42,2,NULL,'Overdue',NOW(),NOW(),NULL),(3,99,1,NULL,'Borrowed',NOW(),NOW(),NULL),(4,42,1,NULL,'Returned',NOW(),NOW(),NOW()),(5,42,1,NULL,'Lost',NOW(),NOW(),NULL),(6,42,1,NULL,'Pending',NOW(),NOW(),NULL);`)
  const q={execute:async(sql:string,v:unknown[])=>[(await pg.query(toPgPlaceholders(sql),v)).rows]}
  const result=await borrowerReturnList(q as never,42)
  assert.deepEqual(result.rows.map(r=>r.id),[1,2]);assert.deepEqual(result.rows.map(r=>r.barcode),['COPY-A','COPY-B'])
  assert.equal(result.more,false)
 }finally{await pg.close()}
})
