import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { bestEffort } from './best-effort.ts'

async function fixture() {
  const pg = new PGlite()
  await pg.exec('CREATE TABLE ledger(id int PRIMARY KEY); CREATE TABLE notices(id int PRIMARY KEY)')
  const execute = async (sql: string) => [(await pg.query(sql)).rows] as [unknown]
  return { pg, executor: { execute } as never }
}

test('a failed notification inside a transaction keeps the business write committed', async () => {
  const { pg, executor } = await fixture()
  try {
    await pg.exec('BEGIN; INSERT INTO ledger VALUES (1)')
    await bestEffort(executor, 'notice', () => pg.query('INSERT INTO missing_table VALUES (1)'))
    await pg.exec('INSERT INTO ledger VALUES (2); COMMIT')
    const rows = (await pg.query<{ id: number }>('SELECT id FROM ledger ORDER BY id')).rows
    assert.deepEqual(rows.map(row => row.id), [1, 2])
  } finally { await pg.close() }
})

test('a successful notification inside a transaction commits with the business write', async () => {
  const { pg, executor } = await fixture()
  try {
    await pg.exec('BEGIN; INSERT INTO ledger VALUES (1)')
    await bestEffort(executor, 'notice', () => pg.query('INSERT INTO notices VALUES (9)'))
    await pg.exec('COMMIT')
    assert.equal((await pg.query('SELECT 1 FROM notices WHERE id=9')).rows.length, 1)
    assert.equal((await pg.query('SELECT 1 FROM ledger WHERE id=1')).rows.length, 1)
  } finally { await pg.close() }
})

test('outside a transaction the notification runs directly and a failure is contained', async () => {
  const { pg, executor } = await fixture()
  try {
    await bestEffort(executor, 'notice', () => pg.query('INSERT INTO notices VALUES (3)'))
    await bestEffort(executor, 'notice', () => pg.query('INSERT INTO missing_table VALUES (1)'))
    assert.equal((await pg.query('SELECT 1 FROM notices WHERE id=3')).rows.length, 1)
  } finally { await pg.close() }
})
