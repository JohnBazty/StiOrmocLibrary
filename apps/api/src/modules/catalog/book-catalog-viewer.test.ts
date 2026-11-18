import assert from 'node:assert/strict'
import test from 'node:test'
import { createBookCatalogService } from './book-catalog.service.ts'

test('viewer-only polling retains the current borrowing limit without fetching catalog metadata',async()=>{
  const sqls:string[]=[]
  const database={execute:async(sql:string)=>{
    sqls.push(sql)
    if(sql.includes('FROM borrowing_policy_versions'))return [[{borrowing_policy_version_id:1,effective_on:'2000-01-01',student_max_active_books:2,faculty_max_active_books:null}]]
    if(sql.includes('AS active_count'))return [[{active_count:1}]]
    return [[]]
  }}
  const result=await createBookCatalogService(database as never).list({viewer_only:'1'},{accountId:9,role:'Student'})
  assert.equal(result.viewer.activeBookCount,1)
  assert.equal(result.viewer.bookLimit,2)
  assert.deepEqual(result.items,[])
  assert.equal(sqls.some(sql=>/FROM titles|JOIN authors/.test(sql)),false)
})
