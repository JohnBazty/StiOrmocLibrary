import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { createHostedPaymentStore } from './hosted-payment-store.ts'
import type { Attempt } from './payments.preview.ts'
import { emptyFunds } from './money-out.rules.ts'

async function fixture() {
  const pg = new PGlite()
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  await pg.exec(readFileSync(new URL('../../../../../database/supabase/044_hosted_payment_preview.sql', import.meta.url), 'utf8'))
  const execute = async (sql: string, values: unknown[] = []) => {
    const r = await pg.query(toPgPlaceholders(sql), values)
    return /^\s*(UPDATE|INSERT|DELETE)/i.test(sql) ? [{ affectedRows: r.affectedRows }, r] : [r.rows, r]
  }
  return { pg, pool: { execute } as unknown as Pool }
}

test('hosted payment history survives a new instance and failed provider response; writes require a lease', async () => {
  const { pg, pool } = await fixture()
  try {
    const a = createHostedPaymentStore(pool), b = createHostedPaymentStore(pool)
    await assert.rejects(a.funds.save(emptyFunds()), { code: 'PAYMENT_STORAGE_LOCK_REQUIRED' })
    const evidence = [{ paymentId: randomUUID(), state: 'Creating', requestKey: randomUUID() }] as Attempt[]
    await assert.rejects(a.locked(async () => {
      await a.attempts.save(evidence)
      await assert.rejects(b.locked(async () => {}), { code: 'PAYMENT_STORAGE_BUSY' })
      throw new Error('Provider response lost')
    }), /Provider response lost/)
    assert.deepEqual(await b.attempts.load(), evidence)
    await b.locked(async () => { await b.funds.save(emptyFunds()) })
    assert.deepEqual(await a.funds.load(), emptyFunds())
  } finally { await pg.close() }
})

test('expired lease is recoverable and a stale writer cannot overwrite or release the new lease', async () => {
  const { pg, pool } = await fixture()
  try {
    const a = createHostedPaymentStore(pool), replacement = randomUUID()
    await a.locked(async () => {
      await pg.query("UPDATE hosted_payment_preview SET lease_owner=$1,lease_until=clock_timestamp()+interval '120 seconds'", [replacement])
      await assert.rejects(a.attempts.save([]), { code: 'PAYMENT_STORAGE_LOCK_LOST' })
    })
    assert.equal((await pg.query<{ lease_owner: string }>('SELECT lease_owner FROM hosted_payment_preview')).rows[0].lease_owner, replacement)
    await pg.exec("UPDATE hosted_payment_preview SET lease_until=clock_timestamp()-interval '1 second'")
    await a.locked(async () => { await a.attempts.save([]) })
  } finally { await pg.close() }
})

test('hosted ledger is unavailable to browser roles and does not modify school financial tables', async () => {
  const { pg } = await fixture()
  try {
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`SET ROLE ${role}`)
      await assert.rejects(pg.query('SELECT attempts FROM public.hosted_payment_preview'), { code: '42501' })
      await assert.rejects(pg.query("UPDATE public.hosted_payment_preview SET attempts='[]'::jsonb"), { code: '42501' })
      await pg.exec('RESET ROLE')
    }
    const tables = await pg.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    assert.deepEqual(tables.rows.map(r => r.tablename), ['hosted_payment_preview'])
  } finally { await pg.close() }
})
