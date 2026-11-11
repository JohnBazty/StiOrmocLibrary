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
