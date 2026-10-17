// Read-only API/report checks; authentication changes only disposable fixture versions.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { db } from '../src/config/db.js'
import { createJwtAuthService } from '../src/modules/auth/jwt-auth.service.ts'
import { PDFDocument } from 'pdf-lib'
const state=JSON.parse(await readFile(new URL('../../../output/phase3-browser-fixtures.json',import.meta.url),'utf8'))
assert.match(state.marker,/^P3B-[A-F0-9]{12}$/)
const base='http://localhost:4000',checks=[],findings=[]
const get=async(path,token)=>fetch(base+path,{headers:token?{Authorization:`Bearer ${token}`}:{}})
const pass=s=>{checks.push(s);console.log('PASS: '+s)}
try {
 const response=await get('/api/public/catalog/titles');assert.equal(response.status,200)
 const all=(await response.json()).data
 assert.ok(all.items.length>0)
 for(const entry of all.items){assert.ok(Number(entry.available)>=0&&Number(entry.available)<=Number(entry.copyCount));for(const forbidden of ['storage_path','permission_note','password_hash','account_id','qr_code_data'])assert.ok(!JSON.stringify(entry).includes(forbidden))}
 pass('Public list DTO, cover metadata and bounded available-copy counts')
 for(const [filter,value] of [['q','Harry'],['q','9780439064873'],['kind','Book'],['kind','Research/Thesis'],['categoryId',String((await(await get('/api/public/catalog/options')).json()).data.categories[0].id)]]) {
  const r=await get('/api/public/catalog/titles?'+new URLSearchParams({[filter]:value}));assert.equal(r.status,200);const data=(await r.json()).data
  if(filter==='q')assert.ok(data.items.every(b=>[b.title,b.author,b.isbn].some(s=>String(s).toLowerCase().includes(value.toLowerCase()))))
  if(filter==='kind')assert.ok(data.items.every(b=>b.kind===value))
 }
 pass('Public title/ISBN search, book/research and category filters')
 const noMatch=await(await get('/api/public/catalog/titles?q=P3_NONEXISTENT_946BEFC736')).json();assert.equal(noMatch.data.items.length,0)
 const invalid=await(await get('/api/public/catalog/titles?page=abc')).json();assert.equal(invalid.data.pagination.page,1)
 pass('Empty search and server normalization of invalid page')
 assert.equal((await get('/api/v1/admin/maintenance/options')).status,401)
 for(const fixture of state.fixtures){
  const login=await createJwtAuthService(db).login({portal:['Student','Faculty'].includes(fixture.role)?'user':'staff',school_id:fixture.schoolId,password:state.password})
  const token=login.token,allowed=fixture.role==='Librarian'
  assert.equal((await get('/api/v1/admin/maintenance/options',token)).status,allowed?200:403)
  assert.equal((await get('/api/v1/admin/maintenance/imports',token)).status,allowed?200:403)
  assert.equal((await get('/api/v1/admin/reports?kind=holdings',token)).status,allowed?200:403)
  for(const format of ['csv','pdf']) {
   const exportResponse=await get('/api/v1/admin/reports/export?kind=holdings&format='+format+'&q=Harry',token)
   assert.equal(exportResponse.status,allowed?200:403)
   if(allowed){
    const bytes=Buffer.from(await exportResponse.arrayBuffer());assert.ok(bytes.length>0)
    if(format==='pdf'){assert.ok((await PDFDocument.load(bytes)).getPageCount()>0);await writeFile(new URL('../../../output/phase3-qa-holdings.pdf',import.meta.url),bytes)}
    else {assert.match(bytes.toString(),/Harry/);await writeFile(new URL('../../../output/phase3-qa-holdings.csv',import.meta.url),bytes)}
   }
  }
  if(['Student','Faculty'].includes(fixture.role)){
   const catalog=await get('/api/v1/catalog/books',token);assert.equal(catalog.status,200)
   const payload=await catalog.json();assert.equal(payload.meta.viewer.role,fixture.role);assert.equal(payload.meta.viewer.activeBookCount,0)
   const profile=await(await get('/api/v1/profile/me?accountId='+state.fixtures[0].accountId,token)).json()
   assert.ok(JSON.stringify(profile.data).includes(fixture.schoolId));assert.ok(!JSON.stringify(profile.data).includes(state.fixtures[0].schoolId))
  }
  pass(fixture.role+': Maintenance/import/report permissions, export access and self-service ownership')
 }
 await writeFile(new URL('../../../output/phase3-qa-api-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),checks,findings},null,2))
} finally {await db.end()}
