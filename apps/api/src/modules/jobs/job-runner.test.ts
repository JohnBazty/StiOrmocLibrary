import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { authorizedJobToken, runOperationalJobs,runPaymentRecovery,startOperationalJobWorker } from './job-runner.ts'

test('scheduled runner requires a configured 32-character bearer secret', () => {
  const secret = '0123456789abcdef0123456789abcdef'
  assert.equal(authorizedJobToken(`Bearer ${secret}`, secret), true)
  assert.equal(authorizedJobToken(`Bearer ${secret}x`, secret), false)
  assert.equal(authorizedJobToken(`Bearer ${secret}`, 'short'), false)
  assert.equal(authorizedJobToken(undefined, secret), false)
})

test('payment recovery uses one bounded existing runner and isolates sanitized failures',async()=>{
  assert.deepEqual(await runPaymentRecovery({} as never,async()=>({processed:2,pending:1,reviewed:0})),{processed:2,pending:1,reviewed:0})
  const result=await runPaymentRecovery({} as never,async()=>{throw new Error('Private provider response')})
  assert.equal('failed' in result&&result.failed,true)
  assert.doesNotMatch(JSON.stringify(result),/Private provider/)
})

test('an already claimed minute skips all operational scans', async () => {
  const statements: string[] = []
  const database = { async execute(sql: string) { statements.push(sql); return [{ affectedRows: 0 }] } } as unknown as Pool
  const result = await runOperationalJobs(new Date('2026-09-27T10:00:00Z'), database)
  assert.equal(result.skipped, true)
  assert.equal(statements.length, 1)
  assert.match(statements[0], /last_success_at/)
})

test('worker shutdown waits for its current database operation and prevents later runs',async()=>{
  let release!:()=>void,calls=0,finished=false
  const waiting=new Promise<void>(resolve=>{release=resolve})
  const database={async execute(){calls++;await waiting;return [{affectedRows:0}]}} as unknown as Pool
  const worker=startOperationalJobWorker(database)
  const active=worker.run()
  const stopping=worker.stop().then(()=>{finished=true})
  await Promise.resolve()
  assert.equal(calls,1)
  assert.equal(finished,false,'Closing the database now would interrupt the running job')
  release();await active;await stopping
  assert.equal(finished,true)
  await worker.run()
  assert.equal(calls,1,'A stopped worker must not start another run')
})
