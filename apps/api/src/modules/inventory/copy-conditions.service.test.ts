import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import type { Pool } from '../../config/db.js'
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test'
const { createCopyConditionsService } = await import('./copy-conditions.service.ts')

async function fixture() {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE accounts(account_id BIGINT PRIMARY KEY); INSERT INTO accounts VALUES(9);
    CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,condition_status VARCHAR(30) NOT NULL DEFAULT 'Good');
    INSERT INTO physical_copies VALUES(1,'Good');`)
  await pg.exec(await readFile(new URL('../../../../../database/supabase/079_copy_conditions.sql', import.meta.url), 'utf8'))
  const execute = async (sql: string, values: readonly unknown[] = []) => {
    const write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
    const result = await pg.query<Record<string, unknown>>(toPgPlaceholders(sql) + (/^\s*INSERT/i.test(sql) && !/RETURNING/i.test(sql) ? ' RETURNING *' : ''), [...values])
    return write ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }] : [result.rows]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
  const pool = { execute, query: execute, getConnection: async () => connection } as unknown as Pool
  return { pg, service: createCopyConditionsService(pool) }
}

test('lists the five base conditions first and adds a custom condition that behaves like one of them', async () => {
  const { pg, service } = await fixture()
  try {
    assert.deepEqual((await service.list()).map(c => c.name), ['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'])
    const water = await service.create(9, { name: '  Water   damage ', behavesAs: 'Damaged', description: 'Pages swollen or stained by water.' })
    assert.equal(water.name, 'Water damage'); assert.equal(water.behavesAs, 'Damaged'); assert.equal(water.isBase, false)
    await assert.rejects(service.create(9, { name: 'water DAMAGE', behavesAs: 'Damaged' }), { code: 'COPY_CONDITION_DUPLICATE' })
    await assert.rejects(service.create(9, { name: 'Sparkly', behavesAs: 'Shiny' }), { code: 'COPY_CONDITION_INVALID' })
    await assert.rejects(service.create(9, { name: 'x', behavesAs: 'Good' }), { code: 'COPY_CONDITION_INVALID' })
  } finally { await pg.close() }
})

test('base conditions keep their name and behaviour; a used custom condition is retired, not deleted or re-pointed', async () => {
  const { pg, service } = await fixture()
  try {
    const good = (await service.list()).find(c => c.name === 'Good')!
    const edited = await service.update(9, good.conditionId, { description: 'Clean and complete.', updatedAt: good.updatedAt })
    assert.equal(edited.description, 'Clean and complete.')
    await assert.rejects(service.update(9, good.conditionId, { name: 'Excellent', updatedAt: edited.updatedAt }), { code: 'COPY_CONDITION_BASE_LOCKED' })
    await assert.rejects(service.update(9, good.conditionId, { isActive: false, updatedAt: edited.updatedAt }), { code: 'COPY_CONDITION_BASE_LOCKED' })
    await assert.rejects(service.remove(9, good.conditionId), { code: 'COPY_CONDITION_BASE_LOCKED' })

    const torn = await service.create(9, { name: 'Torn cover', behavesAs: 'Fair' })
    await assert.rejects(service.update(9, torn.conditionId, { description: 'stale', updatedAt: '2000-01-01T00:00:00.000000Z' }), { code: 'COPY_CONDITION_CHANGED' })
    await pg.query("UPDATE physical_copies SET condition_status='Fair',condition_detail_id=$1 WHERE physical_copy_id=1", [torn.conditionId])
    const used = (await service.list()).find(c => c.conditionId === torn.conditionId)!
    assert.equal(used.copies, 1)
    await assert.rejects(service.update(9, torn.conditionId, { behavesAs: 'Good', updatedAt: used.updatedAt }), { code: 'COPY_CONDITION_IN_USE' })
    await assert.rejects(service.remove(9, torn.conditionId), { code: 'COPY_CONDITION_IN_USE' })
    const retired = await service.update(9, torn.conditionId, { isActive: false, updatedAt: used.updatedAt })
    assert.equal(retired.isActive, false)

    const unused = await service.create(9, { name: 'Spine loose', behavesAs: 'For Repair' })
    await service.remove(9, unused.conditionId)
    assert.equal((await service.list()).some(c => c.conditionId === unused.conditionId), false)
  } finally { await pg.close() }
})

test('resolve gives the base condition to store and the custom detail, and refuses a retired one', async () => {
  const { pg, service } = await fixture()
  try {
    const water = await service.create(9, { name: 'Water damage', behavesAs: 'Damaged' })
    assert.deepEqual(await service.resolve(water.conditionId), { conditionState: 'Damaged', detailId: water.conditionId, name: 'Water damage' })
    const fair = (await service.list()).find(c => c.name === 'Fair')!
    assert.deepEqual(await service.resolve(fair.conditionId), { conditionState: 'Fair', detailId: null, name: 'Fair' })
    await service.update(9, water.conditionId, { isActive: false, updatedAt: water.updatedAt })
    await assert.rejects(service.resolve(water.conditionId), { code: 'COPY_CONDITION_RETIRED' })
    await assert.rejects(service.resolve(99999), { code: 'COPY_CONDITION_NOT_FOUND' })
  } finally { await pg.close() }
})
