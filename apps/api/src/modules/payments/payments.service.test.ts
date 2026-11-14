import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createPaymentsService } from './payments.service.ts'
import { HttpError } from '../../core/http-error.ts'

const unreachable = { getConnection: () => { throw new Error('Unexpected database access') } } as unknown as Pool
const actor = { accountId: 1, role: 'Student' }

test('disabled online payments fail before accessing a database or provider', async () => {
  const service = createPaymentsService(unreachable, { enabled: () => false })
  await assert.rejects(service.quote(actor, {}), (error: unknown) => error instanceof HttpError && error.status === 503)
  await assert.rejects(service.read(actor, '00000000-0000-4000-8000-000000000001'),
    (error: unknown) => error instanceof HttpError && error.status === 503)
})

test('staff cannot use a borrower checkout even with another account ID supplied', async () => {
  const service = createPaymentsService(unreachable, { enabled: () => true })
  await assert.rejects(service.quote({ accountId: 1, role: 'Staff' }, {kind:'Fine',targetId:1,channelCode:'GCASH'}),
    (error: unknown) => error instanceof HttpError && error.status === 403)
})

test('invalid owner requests fail validation before acquiring a database connection', async () => {
  const service = createPaymentsService(unreachable, { enabled: () => true })
  await assert.rejects(service.quote(actor, {kind:'Fine',targetId:1,channelCode:'GCASH',total:1}),
    (error: unknown) => error instanceof HttpError && error.status === 422)
})

test('borrower history validates view and pagination, and unavailable installs need no payment tables',async()=>{
  const uninstalled={...unreachable,execute:async()=>[[{installed:false}],[]]} as unknown as Pool
  const service=createPaymentsService(uninstalled,{enabled:()=>false})
  const result=await service.userList(actor,{view:'history'})
  assert.equal(result.enabled,false);assert.deepEqual(result.items,[])
  await assert.rejects(service.userList(actor,{view:'somebody-else'}),error=>(error as HttpError).status===422)
  await assert.rejects(service.userList(actor,{view:['pending']}),error=>(error as HttpError).status===422)
  await assert.rejects(service.userList(actor,{page:10001}),error=>(error as HttpError).status===422)
  await assert.rejects(service.userList({accountId:1,role:'Staff'},{}),error=>(error as HttpError).status===403)
})

test('existing payment history remains readable when the payment provider is switched off',async()=>{
  const statements:string[]=[]
  const connection={async execute(sql:string){statements.push(sql);if(sql.includes('SELECT a.user_id,a.role'))return [[{user_id:19,role:'Student'}],[]];if(sql.includes('COUNT(*)'))return [[{count:0}],[]];return [[],[]]},async beginTransaction(){},async commit(){},async rollback(){},release(){}}
  const database={execute:async()=>[[{installed:true}],[]],getConnection:async()=>connection} as unknown as Pool
  const result=await createPaymentsService(database,{enabled:()=>false}).userList(actor,{view:'history'})
  assert.equal(result.enabled,false);assert.ok(statements.some(sql=>sql.includes('p.account_id=? AND p.user_id=?')))
})
