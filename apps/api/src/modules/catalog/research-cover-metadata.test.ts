import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { db } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { publicCatalog, publicDetail } from './catalog-enhancements.service.ts'

test('public research covers receive the active department in search and details, without borrowing or book changes',async()=>{
 const pg=new PGlite()
 try{
  await pg.exec(`
   CREATE TABLE titles(title_id BIGINT,title TEXT,record_type TEXT,cover_image_path TEXT,isbn TEXT,publisher TEXT,publication_year INT,call_number TEXT,category_id BIGINT,lifecycle_status TEXT);
   CREATE TABLE categories(category_id BIGINT,category_name TEXT);
   CREATE TABLE authors(title_id BIGINT,author_name TEXT,author_order INT);
   CREATE TABLE catalog_title_details(title_id BIGINT,copyright_year INT,edition TEXT,page_count INT,synopsis TEXT,glossary_text TEXT,row_version INT,type_id BIGINT);
   CREATE TABLE catalog_resource_types(type_id BIGINT,name TEXT);
   CREATE TABLE catalog_title_programs(title_id BIGINT,program_id BIGINT);
   CREATE TABLE catalog_programs(program_id BIGINT,name TEXT,code TEXT);
   CREATE TABLE catalog_title_courses(title_id BIGINT,course_id BIGINT);
   CREATE TABLE catalog_courses(course_id BIGINT,name TEXT,program_id BIGINT,code TEXT);
   CREATE TABLE physical_copies(physical_copy_id BIGINT,title_id BIGINT,material_id BIGINT,lifecycle_status TEXT,availability_status TEXT,condition_status TEXT,accession_number TEXT,barcode TEXT,shelf_location TEXT,shelf_column INT DEFAULT 1,shelf_row INT DEFAULT 1,row_version INT DEFAULT 1);
   CREATE TABLE materials(material_id BIGINT,availability_status TEXT);
   CREATE TABLE research_records(research_record_id BIGINT,title_id BIGINT,department_or_program TEXT,abstract_text TEXT,viewing_status TEXT);
   CREATE TABLE research_inventory(research_inventory_id BIGINT,title_id BIGINT,accession_number TEXT,barcode TEXT,shelf_location TEXT,shelf_column INT DEFAULT 1,shelf_row INT DEFAULT 1,row_version INT DEFAULT 1,condition_state TEXT,availability_status TEXT,lifecycle_status TEXT);
   CREATE TABLE catalog_digital_files(file_id BIGINT,title_id BIGINT,original_name TEXT,byte_size INT,created_at TIMESTAMPTZ,lifecycle_status TEXT);
   INSERT INTO titles(title_id,title,record_type,publication_year,lifecycle_status) VALUES
    (1,'Coastal Study','Research/Thesis',2026,'Active'),(2,'Sample Book','Book',2025,'Active'),(3,'Archived Study','Research/Thesis',2024,'Active');
   INSERT INTO authors VALUES(1,'Sample Author',1),(2,'Book Author',1);
   INSERT INTO research_records VALUES(1,1,'OLD','Old abstract','Archived'),(2,1,'BSTM','Current abstract','Available for Viewing'),(3,3,'BSIT','Archived abstract','Archived');
  `)
  mock.method(db,'execute',(async(sql:string,values:unknown[]=[])=>{
   const result=await pg.query(toPgPlaceholders(sql),values)
   return [result.rows,result]
  }) as typeof db.execute)
  const catalog=await publicCatalog({kind:'Research/Thesis'})
  assert.equal(catalog.items.length,1)
  assert.equal(catalog.items[0].department,'BSTM')
  assert.equal(catalog.items[0].publicationYear,2026)
  assert.deepEqual(catalog.items[0].programs,[])
  const detail=await publicDetail(1) as Record<string,unknown>
  assert.equal(detail.department,'BSTM')
  assert.equal(detail.title,'Coastal Study')
  assert.deepEqual(detail.copies,[])
  const books=await publicCatalog({kind:'Book'})
  assert.equal(books.items[0].kind,'Book')
  assert.equal(books.items[0].department,null)
 }finally{mock.restoreAll();await pg.close()}
})
