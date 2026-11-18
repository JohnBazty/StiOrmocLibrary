import assert from 'node:assert/strict'
import test from 'node:test'
import { createAvailabilityReader, parseAvailabilityIds, readCatalogAvailability } from './catalog-availability.ts'

test('availability input is bounded and rejects injection, fractions and invalid IDs', () => {
  assert.deepEqual(parseAvailabilityIds('2,1,2'), [2,1])
  for (const value of [undefined, ['1'], '', '0', '-1', '1.5', '1 OR 1=1', '9007199254740992', Array.from({length:26},(_,i)=>i+1).join(',')]) {
    assert.throws(() => parseAvailabilityIds(value))
  }
})

test('public polling shares pending reads, briefly caches counts, and evicts failed reads',async()=>{
  let now=0,calls=0,fail=false
  const reader=createAvailabilityReader({execute:async()=>{calls++;if(fail)throw new Error('Unavailable');return [[{id:1,active:true,copyCount:1,available:1}]]}} as never,()=>now)
  const [a,b]=await Promise.all([reader('1,2'),reader('2,1')])
  assert.deepEqual(a,b);assert.equal(calls,1)
  now=200;await reader('1,2');assert.equal(calls,1)
  now=251;await reader('1,2');assert.equal(calls,2)
  now=502;fail=true;await assert.rejects(reader('1,2'))
  fail=false;await reader('1,2');assert.equal(calls,4)
})

test('selected-copy polling stays bounded to the requested visible title and omits metadata',async()=>{
  const database={execute:async(sql:string,values:unknown[])=>{
    if(sql.includes('SUM(CASE'))return [[{id:1,active:true,kind:'Book',copyCount:1,available:1}]]
    assert.deepEqual(values,[1]);assert.match(sql,/WHERE title_id=\?/)
    assert.doesNotMatch(sql,/authors|catalog_digital_files|accounts/)
    return [[{id:11,accession:'QA-11',barcode:'QA-11',shelf:'QA shelf',condition:'Good',availability:'Available'}]]
  }} as never
  const result=await readCatalogAvailability(database,'1','1')
  assert.equal(result.selectedCopies?.[0].id,11)
  await assert.rejects(readCatalogAvailability(database,'1','2'))
  assert.throws(()=>createAvailabilityReader(database)('1',['1']))
})
test('availability exposes only safe counts, marks inactive/missing records, and uses parameters', async () => {
  const db = { execute: async (sql: string, values: unknown[]) => {
    assert.deepEqual(values, [7,8,9])
    assert.match(sql, /IN \(\?,\?,\?\)/)
    assert.match(sql, /m.availability_status='Available'/)
    assert.doesNotMatch(sql, /accounts|borrow_transactions|storage_path/)
    return [[{id:7,active:true,copyCount:'4',available:'2',secret:'never exposed'}, {id:8,active:false,copyCount:3,available:3}]]
  } }
  assert.deepEqual(await readCatalogAvailability(db as never, '7,8,9'), {items:[
    {id:7,active:true,copyCount:4,available:2}, {id:8,active:false,copyCount:0,available:0}, {id:9,active:false,copyCount:0,available:0},
  ]})
})
