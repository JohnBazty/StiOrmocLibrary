import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { createResearchGroupsService, requireResearchGroup } from './research-groups.service.ts'
import { buildResearchCatalogQuery } from './research-catalog.repository.ts'
import { parseResearchCatalogFilters } from './research-catalog.validation.ts'

test('academic groups preserve legacy research, reject stale/unauthorized changes and retain archived classifications', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE users(user_id bigint PRIMARY KEY,account_status text);
      CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint,role text,account_status text);
      CREATE TABLE titles(title_id bigint PRIMARY KEY,lifecycle_status text);
      CREATE TABLE research_records(research_record_id bigint PRIMARY KEY,title_id bigint REFERENCES titles,department_or_program text);
      INSERT INTO users VALUES(1,'Active'),(2,'Active');
      INSERT INTO accounts VALUES(1,1,'Librarian','Active'),(2,2,'Staff','Active');
      INSERT INTO titles VALUES(10,'Active'); INSERT INTO research_records VALUES(20,10,'Original free-text department');`)
    await pg.exec(readFileSync(new URL('../../../../../database/supabase/052_research_academic_groups.sql',import.meta.url),'utf8'))
    const execute = async (sql: string, args: unknown[] = []) => {
      const insert = /^\s*INSERT/i.test(sql), write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
      const result = await pg.query<any>(toPgPlaceholders(sql) + (insert ? ' RETURNING *' : ''),args)
      return [write ? { insertId: Object.values(result.rows[0] ?? {})[0], affectedRows: result.affectedRows } : result.rows]
    }
    const connection = { execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
    const pool = { execute, getConnection: async () => connection } as never
    const service = createResearchGroupsService(pool)
    const groups = await service.list(true)
    assert.equal(groups.length,20)
    assert.equal((await service.assignment(10)).groupId,null)
    const group = groups.find(row => row.program === 'BSIT' && row.yearLevel === 2)!
    const assigned = await service.assign(1,10,{ groupId: group.id, version: 1 })
    assert.equal(assigned.groupId,group.id)
    assert.equal(assigned.legacyDepartment,'Original free-text department')
    await assert.rejects(service.assign(1,10,{ groupId: group.id, version: 1 }), /changed/)
    await assert.rejects(service.assign(2,10,{ groupId: group.id, version: 2 }))
    await assert.rejects(service.save(1,group.id,{ ...group, program: 'CHANGED' }), /preserve/)
    await service.save(1,group.id,{ ...group, active: false })
    assert.ok((await service.list()).some(row => row.id === group.id && !row.active))
    await assert.rejects(requireResearchGroup(connection as never,group.id), /no longer available/)
    await assert.rejects(service.assign(1,10,{ groupId: group.id, version: 2 }), /no longer available/)
    assert.equal((await pg.query('SELECT * FROM research_group_events')).rows.length,2)
    for (const role of ['anon','authenticated']) {
      await pg.exec(`SET ROLE ${role}`)
      await assert.rejects(pg.query('SELECT * FROM research_academic_groups'))
      await assert.rejects(pg.query('SELECT * FROM research_group_events'))
      await pg.exec('RESET ROLE')
    }
    const filtered = buildResearchCatalogQuery(parseResearchCatalogFilters({ groupId: String(group.id) }))
    assert.match(filtered.dataSql,/rr.research_group_id = \?/)
    assert.deepEqual(filtered.dataParameters,[group.id])
  } finally { await pg.close() }
})
