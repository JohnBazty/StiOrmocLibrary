import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { gridCount, validateLayout } from './floor-plan.validation.ts'
import { floorPlanRouter } from './floor-plan.routes.ts'
const layout={areas:[{id:'main',name:'Library',width:800,height:600,background:null}],objects:[{id:'s1',areaId:'main',kind:'shelf',label:'F-A',shelfId:1,note:'',x:50,y:50,width:100,height:80,rotation:0}]}
test('layout rejects duplicate shelves, missing areas, malformed objects and objects beyond the floor',()=>{
  assert.equal(validateLayout(layout).objects[0].shelfId,1)
  assert.throws(()=>validateLayout({...layout,objects:[...layout.objects,{...layout.objects[0],id:'s2'}]}))
  assert.throws(()=>validateLayout({...layout,objects:[{...layout.objects[0],areaId:'missing'}]}))
  assert.throws(()=>validateLayout({...layout,objects:[{...layout.objects[0],x:799}]}))
  assert.throws(()=>validateLayout({...layout,objects:[{...layout.objects[0],x:0,rotation:45}]}))
  assert.throws(()=>validateLayout({...layout,areas:[{...layout.areas[0],background:'https://example.com/map.svg'}]}))
})
test('shelf grids accept practical dimensions and reject invalid sizes',()=>{
  assert.equal(gridCount(3,'Columns'),3)
  assert.equal(gridCount('5','Rows'),5)
  assert.throws(()=>gridCount(0,'Rows'))
  assert.throws(()=>gridCount(13,'Columns'))
})
test('retired layout mutation and draft routes cannot be used by any role',async()=>{
  for(const role of ['Student','Faculty','Librarian','Admin']){
    const app=express();app.use(express.json());app.use((req,res,next)=>{res.locals.authenticatedUser={accountId:1,role};next()});app.use('/map',floorPlanRouter)
    for(const path of ['/publish','/shelves','/transfer','/background','/versions/1/restore'])assert.equal((await request(app).post(`/map${path}`).send({})).status,404)
    assert.equal((await request(app).get('/map/editor')).status,404)
    assert.equal((await request(app).put('/map/draft').send({})).status,404)
    assert.equal((await request(app).patch('/map/shelves/1/grid').send({columnCount:3,rowCount:5})).status,404)
  }
})

test('shelf grid migration is additive and stores exact copy positions',async()=>{
  const {readFile}=await import('node:fs/promises')
  const sql=await readFile(new URL('../../../../../database/migrations/20260907_038_shelf_grid_locations.sql',import.meta.url),'utf8')
  assert.match(sql,/floor_plan_shelves[\s\S]*column_count[\s\S]*row_count/i)
  assert.match(sql,/physical_copies[\s\S]*shelf_column[\s\S]*shelf_row/i)
  assert.doesNotMatch(sql,/DROP (TABLE|COLUMN)/i)
})
