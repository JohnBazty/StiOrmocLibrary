import assert from 'node:assert/strict'
import test from 'node:test'
import { createCsvStream, iterateInventoryRows, type InventoryExportRow } from './catalog-export.service.ts'
import type { Pool } from '../../config/db.js'
import { parseCatalogSearchFilters, buildCatalogSearchQuery } from '../catalog/catalog-search.repository.ts'

test('Dewey CSV preserves leading zeroes and decimal precision separately from call numbers',async()=>{
  async function* rows(){yield {recordType:'Book',title:'Test',authors:'',isbn:'',category:'',publicationYear:'',accessionNumber:'',barcode:'',shelfLocation:'',condition:'',availability:'',researchCode:'',adviser:'',deweyCode:'005.100'} as InventoryExportRow}
  const chunks:Buffer[]=[]
  for await(const chunk of createCsvStream(rows()))chunks.push(Buffer.from(chunk))
  const csv=Buffer.concat(chunks).toString('utf8')
  assert.match(csv,/"Dewey Number"/);assert.match(csv,/"005\.100"/)
})
test('assigned/unassigned filters match catalog and export copies, excluding research',async()=>{
  for(const status of ['assigned','unassigned']){
    const filters=parseCatalogSearchFilters({deweyStatus:status})
    assert.equal(filters.deweyStatus,status)
    assert.match(buildCatalogSearchQuery(filters).dataSql,new RegExp(`dewey_classification_id IS ${status==='assigned'?'NOT ':''}NULL`))
    const calls:string[]=[]
    const database={execute:async(sql:string)=>{calls.push(sql);return [[]]}} as unknown as Pool
    for await(const _row of iterateInventoryRows(database,filters)){/* empty fixture */}
    assert.equal(calls.length,1)
    assert.match(calls[0],new RegExp(`dewey_classification_id IS ${status==='assigned'?'NOT ':''}NULL`))
  }
  assert.throws(()=>parseCatalogSearchFilters({deweyStatus:'bad'}),{status:422})
})
