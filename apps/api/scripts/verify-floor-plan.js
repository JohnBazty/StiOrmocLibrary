// Isolated migration and transaction checks. No library records are changed.
import mysql from 'mysql2/promise'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { env } from '../src/config/env.js'
import { createFloorPlanRepository } from '../src/modules/floor-plan/floor-plan.repository.ts'
import { createCategoryService } from '../src/modules/catalog/categories/category.service.ts'
const name=`smartlib_floor_test_${randomBytes(6).toString('hex')}`
const options={host:env.db.host,port:env.db.port,user:env.db.user,password:env.db.password,charset:'utf8',timezone:'+08:00'}
const connection=await mysql.createConnection(options)
let pool
try {
  await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8`)
  pool=mysql.createPool({...options,database:name})
  const definitions=[
    'CREATE TABLE accounts (account_id BIGINT UNSIGNED PRIMARY KEY, school_id VARCHAR(100)) ENGINE=InnoDB',
    'CREATE TABLE categories (category_id INT PRIMARY KEY,category_name VARCHAR(100),shelf_location VARCHAR(100),updated_at DATETIME) ENGINE=InnoDB',
    'CREATE TABLE physical_copies (physical_copy_id BIGINT PRIMARY KEY,material_id BIGINT,title_id BIGINT,shelf_location VARCHAR(100),barcode VARCHAR(100),availability_status VARCHAR(30),lifecycle_status VARCHAR(30),row_version INT DEFAULT 1,updated_at DATETIME) ENGINE=InnoDB',
    'CREATE TABLE research_inventory (research_inventory_id BIGINT PRIMARY KEY,title_id BIGINT,shelf_location VARCHAR(100),lifecycle_status VARCHAR(30),row_version INT DEFAULT 1,updated_at DATETIME) ENGINE=InnoDB',
    'CREATE TABLE materials (material_id BIGINT PRIMARY KEY,category_id INT,shelf_location VARCHAR(100),updated_at DATETIME) ENGINE=InnoDB',
    'CREATE TABLE titles (title_id BIGINT PRIMARY KEY,title VARCHAR(100),isbn VARCHAR(30),call_number VARCHAR(100),category_id INT,cover_image_path VARCHAR(255),lifecycle_status VARCHAR(30),record_type VARCHAR(30)) ENGINE=InnoDB',
    'CREATE TABLE authors (title_id BIGINT,author_name VARCHAR(100),author_order INT) ENGINE=InnoDB',
    "INSERT INTO accounts VALUES (1,'TEST-ADMIN')",
    "INSERT INTO categories VALUES (1,'Computing','Shelf A',NULL),(2,'Fiction','Shelf B',NULL)",
    "INSERT INTO physical_copies VALUES (1,1,1,'Shelf A','BC-1','Available','Active',NULL),(2,2,1,'Shelf B','BC-2','Reserved','Active',NULL)",
    "INSERT INTO materials VALUES (1,1,'Shelf A',NULL),(2,1,'Shelf B',NULL)",
    "INSERT INTO titles VALUES (1,'Test book','9780132350884','005.1 TES 2026',1,NULL,'Active','Book')",
    "INSERT INTO authors VALUES (1,'Test author',1)"
  ]
  for(const sql of definitions)await pool.query(sql)
  const migration=await readFile(new URL('../../../database/migrations/20260906_035_floor_plans.sql',import.meta.url),'utf8')
  for(const sql of migration.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(sql)
  await pool.query("INSERT INTO categories VALUES (3,'Legacy category','Legacy shelf',NULL)")
  const reconciliation=await readFile(new URL('../../../database/migrations/20260906_036_reconcile_category_floor_plan_shelves.sql',import.meta.url),'utf8')
  for(const sql of reconciliation.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(sql)
  const categoryAuthority=await readFile(new URL('../../../database/migrations/20260907_037_category_shelf_authority.sql',import.meta.url),'utf8')
  for(const sql of categoryAuthority.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(sql)
  const shelfGrid=await readFile(new URL('../../../database/migrations/20260907_038_shelf_grid_locations.sql',import.meta.url),'utf8')
  for(const sql of shelfGrid.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(sql)
  assert.equal((await pool.query('SELECT shelf_location FROM physical_copies WHERE physical_copy_id=2'))[0][0].shelf_location,'Shelf A')
  await pool.query("UPDATE physical_copies SET shelf_location='Shelf B' WHERE physical_copy_id=2")
  await pool.query("UPDATE materials SET shelf_location='Shelf B' WHERE material_id=2")
  const repo=createFloorPlanRepository(pool)
  const state=await repo.state(true)
  assert.equal((await repo.state()).layout,null)
  assert.equal(state.shelves.length,3)
  assert.ok(state.shelves.some(s=>s.label==='Legacy shelf'),'late category location becomes a managed shelf')
  const shelfA=state.shelves.find(s=>s.label==='Shelf A')
  const shelfB=state.shelves.find(s=>s.label==='Shelf B')
  assert.ok(shelfA&&shelfB)
  assert.equal(shelfA.columnCount,3)
  assert.equal(shelfA.rowCount,5)
  await repo.updateGrid(1,shelfA.id,4,6)
  assert.equal((await repo.state(true)).shelves.find(s=>s.id===shelfA.id).columnCount,4)
  const layout={areas:state.layout.areas,objects:state.shelves.map((s,i)=>({id:`s${s.id}`,areaId:'main',kind:'shelf',shelfId:s.id,label:s.label,note:'',x:50+i*200,y:50,width:120,height:70,rotation:0}))}
  await repo.save(1,0,layout)
  assert.equal((await repo.state()).layout,null,'draft stays private')
  await assert.rejects(repo.save(1,0,layout),e=>e.code==='FLOOR_PLAN_CONFLICT')
  await repo.save(1,1,layout,true)
  assert.equal((await repo.books({categoryId:1})).matches.length,2,'category spans shelves')
  assert.equal((await repo.books({titleId:1,available:'true'})).total,1)
  assert.equal((await repo.books({titleId:1,copyId:2})).items[0].barcode,'BC-2')
  await assert.rejects(repo.save(1,2,{...layout,objects:[]},true),e=>e.code==='SHELF_OCCUPIED')
  const renamed=structuredClone(layout);const shelfAObject=renamed.objects.find(o=>o.shelfId===shelfA.id);shelfAObject.label='Shelf A moved';shelfAObject.x=650
  await repo.save(1,2,renamed,true)
  assert.equal((await repo.books({copyId:1})).items[0].shelfLabel,'Shelf A moved')
  await pool.query("UPDATE categories SET shelf_location='Shelf B' WHERE category_id=1")
  await repo.transfer(1,[1],shelfB.id)
  assert.equal((await repo.books({copyId:1})).items[0].shelfId,shelfB.id)
  await repo.restore(1,1,3)
  assert.equal((await repo.state(true)).layout.objects.find(o=>o.shelfId===shelfA.id).label,'Shelf A moved','restore retains current labels')
  assert.equal((await repo.books({copyId:1})).items[0].shelfId,shelfB.id,'restore retains copy transfers')
  const synchronized=await createCategoryService(pool).update(1,{categoryName:'Computing',shelfLocation:'Shelf A moved'},1)
  assert.equal(synchronized.bookCopies,2)
  assert.equal(synchronized.movedBookCopies,2)
  assert.equal((await repo.books({categoryId:1})).matches.length,1,'category save moves all copies together')
  assert.equal((await pool.query("SELECT COUNT(*) count FROM floor_plan_events WHERE event_type='Category shelf synced'"))[0][0].count,1)
  console.log('PASS: migration, category-shelf reconciliation and authority, draft isolation, revision conflict, category filters, assigned-copy location, populated-shelf removal, rename, transfer, and restore.')
} finally {
  if(pool)await pool.end()
  if(!/^smartlib_floor_test_[a-f0-9]{12}$/.test(name))throw new Error('Invalid disposable database target')
  await connection.query(`DROP DATABASE IF EXISTS \`${name}\``)
  await connection.end()
}
