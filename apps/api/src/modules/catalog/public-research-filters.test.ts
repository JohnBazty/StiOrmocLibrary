import assert from 'node:assert/strict'
import test from 'node:test'
import { publicWhere } from './catalog-enhancements.service.ts'

test('public research filters combine bound values with existing visibility and book filters',()=>{
  const where=publicWhere({kind:'Research/Thesis',department:'Information Technology',publicationYear:'2026',author:"O'Brien",adviser:'Example',categoryId:'3'})
  assert.match(where.sql,/t.lifecycle_status='Active'/)
  assert.match(where.sql,/viewing_status<>'Archived'/)
  assert.match(where.sql,/t\.category_id=\?/)
  assert.match(where.sql,/department_or_program ILIKE \?/)
  assert.match(where.sql,/adviser_name ILIKE \?/)
  assert.match(where.sql,/t\.publication_year=\?/)
  for(const value of ['%Information Technology%',2026,"%O'Brien%",'%Example%'])assert.ok(where.values.includes(value))
  assert.ok(!where.sql.includes("O'Brien"))
})
test('public research filters reject malformed or future publication years',()=>{
  for(const publicationYear of ['2026 OR 1=1','999','9999'])assert.throws(()=>publicWhere({publicationYear}))
})
