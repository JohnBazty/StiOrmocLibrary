import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { createClearanceScheduleService } from './clearance-schedule.service.ts'

const librarian = { role: 'Librarian', accountId: 1 }
const draft = (group = 'BSIT', extra = {}) => ({ termId: 1, version: 0, group, startsAt: '2026-12-01T08:00:00+08:00', endsAt: '2026-12-03T17:00:00+08:00', requestKey: crypto.randomUUID(), ...extra })
async function fixture(run: (pg: PGlite, service: ReturnType<typeof createClearanceScheduleService>) => Promise<void>) {
  const pg = new PGlite()
  try {
    await pg.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint,role text,account_status text);
      CREATE TABLE users(user_id bigint PRIMARY KEY,course_or_strand text,educational_level text);
      CREATE TABLE student_profiles(account_id bigint,program_strand text,year_grade_level text);
      CREATE TABLE academic_terms(academic_term_id bigint PRIMARY KEY,academic_year text,term_name text,starts_on date,ends_on date,is_active int);
      CREATE TABLE enrollment_semesters(semester_id bigint PRIMARY KEY,academic_year text,term_name text,started_at timestamptz,ended_at timestamptz,created_at timestamptz);
      CREATE TABLE clearance_semester_schedules(academic_term_id bigint PRIMARY KEY,deadline_at timestamptz,row_version int,updated_by bigint,updated_at timestamptz);
      INSERT INTO accounts VALUES(1,1,'Librarian','Active'),(2,7,'Student','Active'),(3,8,'Student','Active'),(4,9,'Student','Active'),(5,10,'Librarian','Deactivated');
      INSERT INTO users VALUES(7,'BSIT','College'),(8,'BSHM','College'),(9,'HUMSS','Grade 12');
      INSERT INTO student_profiles VALUES(2,'BSIT','2nd Year'),(3,'BSHM','3rd Year'),(4,'HUMSS','Grade 12');
      INSERT INTO academic_terms VALUES(1,'2026–2027','First semester','2026-06-01','2026-12-31',1),(2,'2026–2027','Second semester','2027-01-01','2027-05-31',0);
      INSERT INTO clearance_semester_schedules VALUES(1,'2026-12-15T17:00:00+08:00',3,1,'2026-11-01Z');
    `)
    const old = (await pg.query('SELECT * FROM clearance_semester_schedules')).rows
    await pg.exec(readFileSync(new URL('../../../../../database/supabase/050_clearance_group_schedules.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await pg.query('SELECT * FROM clearance_semester_schedules')).rows, old)
    // Match the production pg-pool adapter: writes return a result header, not row arrays.
    const execute = async (sql: string, args: unknown[] = []) => {
      const result = await pg.query(toPgPlaceholders(sql), args)
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) return [{ insertId: Number((result.rows[0] as any)?.schedule_id ?? (result.rows[0] as any)?.event_id ?? 0), affectedRows: result.affectedRows ?? 0, rows: result.rows }]
      return [result.rows]
    }
    const connection = { execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
    const database = { execute, getConnection: async () => connection } as never
    await run(pg, createClearanceScheduleService(database, () => new Date('2026-12-01T08:00:00+08:00')))
  } finally { await pg.close() }
}

test('migration retains legacy deadlines and denies browser access to calendars and audit history', () => fixture(async (pg, service) => {
  const current = await service.current()
  assert.equal(current.windows[0].group, 'All')
  assert.equal(current.windows[0].endsAt, '2026-12-15T09:00:00.000Z')
  const protections = (await pg.query<{ rls: boolean; denied: boolean }>(`SELECT c.relrowsecurity rls,NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') denied FROM pg_class c WHERE c.relname IN ('clearance_schedule_windows','clearance_window_events')`)).rows
  assert.equal(protections.length, 2); assert.ok(protections.every(row => row.rls && row.denied))
}))
test('multiple periods are saved once, ordered and resolved using only the signed-in student profile', () => fixture(async (pg, service) => {
  const input = draft()
  await service.save(librarian, input); await service.save(librarian, input)
  await service.save(librarian, draft('BSIT', { startsAt: '2026-12-10T08:00:00+08:00', endsAt: '2026-12-12T17:00:00+08:00' }))
  const own = await service.mine({ role: 'Student', accountId: 2 })
  assert.deepEqual(own?.windows.map(row => row.group), ['BSIT', 'BSIT'])
  assert.equal(own?.selected?.status, 'Open'); assert.equal(own?.deadlineAt, '2026-12-03T09:00:00.000Z')
  assert.equal((await service.mine({ role: 'Student', accountId: 3 }))?.windows[0].group, 'All')
  await service.save(librarian, draft('Grade 12'))
  assert.equal((await service.mine({ role: 'Student', accountId: 4 }))?.windows[0].group, 'Grade 12')
  assert.equal(await service.mine({ role: 'Faculty', accountId: 4 }), null)
  assert.equal((await pg.query<{ count: number }>(`SELECT count(*)::int count FROM clearance_window_events WHERE action='Created'`)).rows[0].count, 3)
}))
test('overlap is rejected per group while adjacent periods and different groups are allowed', () => fixture(async (_pg, service) => {
  await service.save(librarian, draft())
  await assert.rejects(service.save(librarian, draft('BSIT', { endsAt: '2026-12-04T17:00:00+08:00' })), (error: any) => error.code === 'SCHEDULE_OVERLAP')
  await service.save(librarian, draft('BSIT', { startsAt: '2026-12-03T17:00:00+08:00', endsAt: '2026-12-05T17:00:00+08:00' }))
  await service.save(librarian, draft('BSTM'))
  assert.equal((await service.current()).windows.length, 4)
}))
test('stale edits and cancellations cannot overwrite a newer schedule; cancellation is audited', () => fixture(async (pg, service) => {
  const created = await service.save(librarian, draft())
  const row = created.windows.find(row => row.group === 'BSIT')!
  await service.save(librarian, { ...draft('BSIT'), id: row.id, version: row.version, endsAt: '2026-12-04T17:00:00+08:00' })
  await assert.rejects(service.save(librarian, { ...draft(), id: row.id, version: row.version }), (error: any) => error.code === 'SCHEDULE_CHANGED')
  await assert.rejects(service.cancel(librarian, row.id, { termId: 1, version: row.version }), (error: any) => error.code === 'SCHEDULE_CHANGED')
  await service.cancel(librarian, row.id, { termId: 1, version: row.version + 1 })
  assert.equal((await service.mine({ role: 'Student', accountId: 2 }))?.windows[0].group, 'All')
  const actions = (await pg.query<{ action: string }>('SELECT action FROM clearance_window_events WHERE schedule_id=$1 ORDER BY event_id', [row.id])).rows.map(row => row.action)
  assert.deepEqual(actions, ['Created', 'Updated', 'Cancelled'])
}))
test('only a currently active Librarian may change schedules and request reuse cannot alter a saved period', () => fixture(async (_pg, service) => {
  for (const actor of [{ role: 'Student', accountId: 2 }, { role: 'Admin', accountId: 1 }, { role: 'Librarian', accountId: 5 }]) {
    await assert.rejects(service.save(actor, draft()), (error: any) => error.code === 'SCHEDULE_FORBIDDEN')
  }
  const input = draft(); await service.save(librarian, input)
  await assert.rejects(service.save(librarian, { ...input, group: 'BSHM' }), (error: any) => error.code === 'SCHEDULE_CHANGED')
  await assert.rejects(service.save(librarian, draft('BSHM', { termId: 999 })), (error: any) => error.code === 'SCHEDULE_INVALID')
}))

test('clearance can use an existing enrollment semester without creating or modifying academic terms', () => fixture(async (pg, service) => {
  await pg.exec("UPDATE academic_terms SET is_active=0; INSERT INTO enrollment_semesters VALUES(12,'2026-2027','2nd Semester','2026-11-09Z',NULL,'2026-11-01Z')")
  assert.equal((await service.terms())[0].id, -12)
  assert.equal((await service.current()).termId, -12)
  await service.save(librarian, draft('BSIT', { termId: -12 }))
  assert.equal((await service.mine({ role: 'Student', accountId: 2 }))?.selected?.group, 'BSIT')
  assert.equal((await pg.query<{ count: number }>('SELECT count(*)::int count FROM academic_terms')).rows[0].count, 2)
}))
