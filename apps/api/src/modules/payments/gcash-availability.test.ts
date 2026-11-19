import assert from 'node:assert/strict'
import test from 'node:test'
import { createGcashAvailability } from './gcash-availability.ts'

test('GCash disabled fails closed for new checkout and does not change stored payments',async()=>{
 const calls:string[]=[]
 const execute=async(sql:string)=>{calls.push(sql);return [[{enabled:false,version:4}]]}
 const service=createGcashAvailability({execute} as never)
 assert.equal((await service.get()).enabled,false)
 await assert.rejects(service.requireAvailable(),{code:'GCASH_UNAVAILABLE'})
 assert.ok(calls.every(sql=>sql.startsWith('SELECT')))
})
