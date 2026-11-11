import assert from 'node:assert/strict'
import test from 'node:test'
import {createPaymentsRepository} from './payments.repository.ts'

test('borrower payment lists scope rows and counts to the account and linked user, hiding draft quotes',async()=>{
  const queries:Array<{sql:string;values:unknown[]}>=[]
  const query={async execute(sql:string,values:unknown[]=[]){queries.push({sql,values});return [sql.includes('COUNT(*)')?[{count:2}]:[]]}} as never
  const repository=createPaymentsRepository(query)
  await repository.userList({state:null,channel:null,kind:null,page:2,limit:25},7,19,'pending')
  assert.equal(queries.length,2)
  for(const {sql,values} of queries){assert.match(sql,/p\.account_id=\?/);assert.match(sql,/p\.user_id=\?/);assert.ok(values.includes(7));assert.ok(values.includes(19));assert.match(sql,/Prepared.*Creating.*Active.*Review/);assert.doesNotMatch(sql,/'Quoted'/)}
  assert.deepEqual(queries[0].values.slice(-2),[25,25])
})

test('payment history includes terminal attempts and applies the same ownership predicate to its count',async()=>{
  const statements:string[]=[]
  const query={async execute(sql:string){statements.push(sql);return [sql.includes('COUNT(*)')?[{count:0}]:[]]}} as never
  await createPaymentsRepository(query).userList({state:null,channel:null,kind:'Printing',page:1,limit:25},7,19,'history')
  for(const sql of statements){assert.match(sql,/Succeeded.*Expired.*Cancelled/);assert.match(sql,/p\.account_id=\? AND p\.user_id=\?/);assert.match(sql,/p\.print_request_id IS NOT NULL/)}
})
