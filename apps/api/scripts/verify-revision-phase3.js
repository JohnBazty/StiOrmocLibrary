// Run explicitly against configured Supabase. Creates and removes only exact tagged fixtures.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import ExcelJS from 'exceljs'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'
import { db,dbDriver } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { createApp } from '../src/app.js'
import * as service from '../src/modules/catalog/catalog-enhancements.service.ts'
import { readHoldings,mappedRows } from '../src/modules/catalog/holdings-parser.ts'

assert.equal(dbDriver,'postgres')
const tag=`REV3-${randomUUID()}`.toUpperCase(),titleName=`${tag} Quality management`,batchIds=[],titleIds=[],materialIds=[],copyIds=[]
let courseId=0,locationId=0,typeId=0,programId=0,fileId=0
const query=async(sql,values=[])=>{const [rows]=await db.execute(sql,values);return rows}
const tokenFor=a=>jwt.sign({accountId:Number(a.account_id),userId:Number(a.account_id),schoolId:a.school_id,role:a.role,authVersion:Number(a.auth_version)},env.jwt.secret,{algorithm:'HS256',expiresIn:600,issuer:env.jwt.issuer,audience:env.jwt.audience,subject:String(a.account_id)})
const identities=await query("SELECT account_id,school_id,role,auth_version FROM accounts WHERE account_status='Active' AND role IN ('Librarian','Staff','Admin','Student')")
const librarian=identities.find(a=>a.role==='Librarian');assert.ok(librarian,'Need an active Librarian for the integration gate')
const actor=Number(librarian.account_id),app=createApp(),auth={Authorization:`Bearer ${tokenFor(librarian)}`}
const original=await query('SELECT title_id,record_type,lifecycle_status FROM titles ORDER BY title_id'),originalCopies=await query('SELECT physical_copy_id,title_id,material_id,barcode,accession_number,condition_status,availability_status FROM physical_copies ORDER BY physical_copy_id'),originalLoans=await query('SELECT transaction_id,user_id,material_id,transaction_status FROM borrow_transactions ORDER BY transaction_id'),originalAccounts=await query('SELECT account_id,school_id,role,account_status,auth_version FROM accounts ORDER BY account_id')
try{
 const options=await service.catalogOptions(),categoryId=Number(options.categories[0].id)
 const foundation=async(kind,body)=>{const next=await service.saveFoundation(kind,null,body,actor);return Number(next[kind].find(x=>x.name===body.name).id)}
 locationId=await foundation('locations',{name:tag+' shelf'});typeId=await foundation('types',{name:tag+' reference',recordKind:'Book'});programId=await foundation('programs',{name:tag+' program',code:tag.slice(0,38)});courseId=await foundation('courses',{name:tag+' course',code:'REV3',programId})
 const workbook=new ExcelJS.Workbook(),ge=workbook.addWorksheet('GE BOOKS'),tm=workbook.addWorksheet('CHED TM')
 ge.addRows([['Title','Author','Copies','Copyright year','Publication year','Accesion #','Missing'],[titleName,'Fixture author',2,2020,2021,`${tag}-A;${tag}-B`,1],[`${tag} Invalid`,'Fixture author','bad','','','',0]])
 tm.addRows([['Book Title','Author/s','Copies','Year Published'],[titleName,'Fixture author',2,2021]])
 const bytes=Buffer.from(await workbook.xlsx.writeBuffer()),file={buffer:bytes,originalname:tag+'.xlsx',size:bytes.length,mimetype:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
 const sheets=await readHoldings(file),mapping=sheets.map(s=>({...s.mapping,categoryId,location:tag+' shelf',programId})),preview=mappedRows(sheets,mapping);assert.equal(preview.items.length,3)
 const staged=await service.stageHoldings(file,mapping,actor);batchIds.push(staged.batchId)
 assert.equal((await service.stageHoldings(file,mapping,actor)).batchId,staged.batchId)
 let batch=await service.importBatch(staged.batchId),first=batch.rows[0],invalid=batch.rows[1],overlap=batch.rows[2]
 assert.equal(first.overlaps.length,1);assert.ok(invalid.errors.some(e=>e.includes('Copies')))
 assert.equal((await query('SELECT COUNT(*) AS n FROM titles WHERE title=?',[titleName]))[0].n,'0')
 await assert.rejects(service.reviewImport(invalid.id,{...invalid,decision:'new'},actor))
 await service.reviewImport(first.id,{...first,decision:'new'},actor)
 await assert.rejects(service.reviewImport(first.id,{...first,decision:'new'},actor),e=>e.statusCode===409||e.status===409)
 await service.reviewImport(overlap.id,{...overlap,decision:'reuse',reuseRowId:Number(first.id)},actor)
 await service.reviewImport(invalid.id,{...invalid,decision:'skip'},actor)
 let result=await service.commitImport(staged.batchId,actor);assert.equal(result.errors.length,0,JSON.stringify(result.errors));assert.equal(result.imported,2)
 batch=await service.importBatch(staged.batchId);const imported=batch.rows[0].result;titleIds.push(imported.titleId);copyIds.push(...imported.copyIds)
 const copies=await query('SELECT physical_copy_id,material_id,condition_status,availability_status,barcode,accession_number FROM physical_copies WHERE title_id=?',[imported.titleId]);materialIds.push(...copies.map(c=>Number(c.material_id)))
 assert.equal(copies.length,2);assert.equal(copies.filter(c=>c.condition_status==='Lost'&&c.availability_status==='Unavailable').length,1);assert.ok(copies.some(c=>c.accession_number===tag+'-A'))
 assert.equal((await service.commitImport(staged.batchId,actor)).imported,0)
 let detail=await service.publicDetail(imported.titleId);assert.equal(Number(detail.copyrightYear),2020);assert.equal(Number(detail.publicationYear),2021);assert.equal(Number(detail.available),1)
 detail=await service.saveDetails(imported.titleId,{...detail,copyrightYear:2019,edition:'Second',pages:120,synopsis:'Fixture synopsis',glossary:'Term: definition',typeId,programIds:[programId],courseIds:[courseId]},actor)
 assert.equal(detail.synopsis,'Fixture synopsis');assert.equal((await service.publicCatalog({programId,courseId})).items.length,1)
 await assert.rejects(service.saveDetails(imported.titleId,{...detail,version:0,programIds:[programId],courseIds:[courseId]},actor))
 const publicResponse=await request(app).get(`/api/public/catalog/titles/${imported.titleId}`);assert.equal(publicResponse.status,200)
 const publicText=JSON.stringify(publicResponse.body);for(const forbidden of ['storage_path','permission_note','password_hash','account_id','qr_code_data','quotedAmount'])assert.ok(!publicText.includes(forbidden),forbidden)
 assert.equal((await request(app).post(`/api/v1/admin/maintenance/imports/${staged.batchId}/commit`).send({})).status,401)
 for(const role of ['Staff','Admin','Student']){const person=identities.find(a=>a.role===role);if(!person)continue;assert.equal((await request(app).get('/api/v1/admin/maintenance/options').set('Authorization',`Bearer ${tokenFor(person)}`)).status,403,role)}
 assert.equal((await request(app).get('/api/v1/admin/maintenance/options').set(auth)).status,200)
 const pdf=await PDFDocument.create();pdf.addPage([200,200]);const pdfBytes=Buffer.from(await pdf.save())
 assert.equal((await request(app).post(`/api/v1/admin/maintenance/titles/${imported.titleId}/files`).set(auth).field('permissionConfirmed','false').field('permissionNote','Fixture only').attach('digital',pdfBytes,{filename:'fixture.pdf',contentType:'application/pdf'})).status,422)
 const uploaded=await request(app).post(`/api/v1/admin/maintenance/titles/${imported.titleId}/files`).set(auth).field('permissionConfirmed','true').field('permissionNote','Public-domain disposable test fixture').attach('digital',pdfBytes,{filename:tag+'.pdf',contentType:'application/pdf'})
 assert.equal(uploaded.status,200,JSON.stringify(uploaded.body));fileId=Number(uploaded.body.data.files[0].id)
 assert.equal((await request(app).get(`/api/public/catalog/files/${fileId}`)).status,200)
 await db.execute("UPDATE titles SET lifecycle_status='Archived' WHERE title_id=? AND title=?",[imported.titleId,titleName])
 assert.equal((await request(app).get(`/api/public/catalog/files/${fileId}`)).status,404)
 await db.execute("UPDATE titles SET lifecycle_status='Active' WHERE title_id=? AND title=?",[imported.titleId,titleName]);await service.archiveDigital(fileId,actor)
 assert.equal((await request(app).get(`/api/public/catalog/files/${fileId}`)).status,404)
 const privateTables=await query("SELECT relname,relrowsecurity FROM pg_class WHERE relname LIKE 'catalog_%' AND relkind='r' AND relnamespace='public'::regnamespace");assert.ok(privateTables.length>=10);assert.ok(privateTables.every(t=>t.relrowsecurity))
 const grants=await query("SELECT COUNT(*) AS n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'catalog_%' AND grantee IN ('anon','authenticated','PUBLIC')");assert.equal(Number(grants[0].n),0)
 const realPath='C:/Users/JOHN/Downloads/LIBRARY-HOLDINGS-CHED-FINAL.xlsx',real=await fs.readFile(realPath),actual=await service.inspectHoldings({buffer:real,originalname:'LIBRARY-HOLDINGS-CHED-FINAL.xlsx'});assert.equal(actual.length,5);assert.ok(actual.every(s=>s.mapping.columns.title&&s.mapping.columns.author&&s.mapping.columns.copies));console.log('Reference workbook read only: '+actual.map(s=>`${s.name}: ${s.rowCount} rows`).join('; '))
 console.log('PASS: Supabase import review, overlap reuse, ISBN/year/quantity validation, barcode/material bridge, resume/idempotency, metadata, program/course filters, public DTO, role guards, PDF permissions/download/withdrawal, and private tables. No real workbook holdings imported.')
}finally{
 // Resolve IDs from exact tagged source even if a preceding assertion interrupted the run.
 const batches=await query('SELECT batch_id FROM catalog_import_batches WHERE filename=?',[tag+'.xlsx']);for(const b of batches)if(!batchIds.includes(Number(b.batch_id)))batchIds.push(Number(b.batch_id))
 const created=await query('SELECT title_id FROM titles WHERE title LIKE ?',[tag+'%']);for(const t of created)if(!titleIds.includes(Number(t.title_id)))titleIds.push(Number(t.title_id))
 for(const titleId of titleIds){const files=await query('SELECT file_id,storage_path FROM catalog_digital_files WHERE title_id=?',[titleId]);if(files.length){const store=createClient(env.supabase.url,env.supabase.secretKey).storage.from('catalog-digital-files');const removed=await store.remove(files.map(f=>f.storage_path));assert.equal(removed.error,null);await db.execute('DELETE FROM catalog_digital_files WHERE title_id=?',[titleId])}}
 for(const batchId of batchIds){await db.execute('UPDATE catalog_import_rows SET reuse_row_id=NULL WHERE batch_id=?',[batchId]);await db.execute('DELETE FROM catalog_import_batches WHERE batch_id=?',[batchId])}
 for(const titleId of titleIds){const copies=await query('SELECT material_id FROM physical_copies WHERE title_id=?',[titleId]);await db.execute('DELETE FROM physical_copies WHERE title_id=?',[titleId]);await db.execute('DELETE FROM titles WHERE title_id=? AND title LIKE ?',[titleId,tag+'%']);for(const copy of copies)if(copy.material_id)await db.execute('DELETE FROM materials WHERE material_id=? AND title LIKE ?',[copy.material_id,tag+'%'])}
 if(courseId)await db.execute('DELETE FROM catalog_courses WHERE course_id=? AND name=?',[courseId,tag+' course'])
 if(programId)await db.execute('DELETE FROM catalog_programs WHERE program_id=? AND name=?',[programId,tag+' program'])
 if(typeId)await db.execute('DELETE FROM catalog_resource_types WHERE type_id=? AND name=?',[typeId,tag+' reference'])
 if(locationId)await db.execute('DELETE FROM catalog_locations WHERE location_id=? AND name=?',[locationId,tag+' shelf'])
 assert.deepEqual(await query('SELECT title_id,record_type,lifecycle_status FROM titles ORDER BY title_id'),original)
 assert.deepEqual(await query('SELECT physical_copy_id,title_id,material_id,barcode,accession_number,condition_status,availability_status FROM physical_copies ORDER BY physical_copy_id'),originalCopies)
 assert.deepEqual(await query('SELECT transaction_id,user_id,material_id,transaction_status FROM borrow_transactions ORDER BY transaction_id'),originalLoans)
 assert.deepEqual(await query('SELECT account_id,school_id,role,account_status,auth_version FROM accounts ORDER BY account_id'),originalAccounts)
 await db.end();console.log('Fixture cleanup confirmed; existing titles, copies, loans and accounts preserved.')
}
