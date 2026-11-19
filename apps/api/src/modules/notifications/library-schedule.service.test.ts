import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { createLibraryScheduleService } from './library-schedule.service.ts'
import { HttpError } from '../../core/http-error.ts'

test('real SQL schedule changes preserve historical closures, reject stale editors and forbidden Staff, and roll back invalid hours', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE users(user_id bigint PRIMARY KEY,account_status text);
      CREATE TABLE accounts(account_id bigint PRIMARY KEY,user_id bigint,role text,account_status text);
      CREATE TABLE library_profile_settings(settings_id int PRIMARY KEY);
      CREATE TABLE attendance_operation_settings(settings_id int PRIMARY KEY,preclosing_minutes int);
      CREATE TABLE library_operating_schedule(day_of_week int PRIMARY KEY,is_open int,opens_at time,closes_at time,updated_by_user_id bigint,updated_at timestamp);
      CREATE TABLE library_closed_days(closed_date date PRIMARY KEY,reason varchar(191),created_by_user_id bigint);
      INSERT INTO users VALUES(1,'Active'),(2,'Active');
      INSERT INTO accounts VALUES(1,1,'Librarian','Active'),(2,2,'Staff','Active');
      INSERT INTO library_profile_settings VALUES(1); INSERT INTO attendance_operation_settings VALUES(1,5);
      INSERT INTO library_operating_schedule SELECT i,1,'07:00','17:00',1,NULL FROM generate_series(1,7) i;
      INSERT INTO library_closed_days VALUES('2026-01-01','Retained history',1),('2026-12-01','Cancelled event',1);`)
    const execute = async (sql: string, args: unknown[] = []) => { const result = await pg.query(toPgPlaceholders(sql), args); return [result.rows, []] }
    const connection = { execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
    const service = createLibraryScheduleService({ execute, getConnection: async () => connection } as never, () => new Date('2026-11-18T01:00:00Z'))
    const before = await service.current()
    const draft = { ...before, upcomingClosures: [{ date: '2026-12-25', reason: 'Holiday' }] }
    await assert.rejects(service.save(2, draft), error => error instanceof HttpError && error.status === 403)
    const changed = await service.save(1, draft)
    assert.notEqual(changed.revision, before.revision)
    assert.deepEqual(changed.upcomingClosures, draft.upcomingClosures)
    const history = await pg.query("SELECT reason FROM library_closed_days WHERE closed_date='2026-01-01'")
    assert.equal((history.rows[0] as any).reason, 'Retained history')
    await assert.rejects(service.save(1, draft), error => error instanceof HttpError && error.code === 'LIBRARY_SCHEDULE_CHANGED')
    const invalid = structuredClone(changed)
    invalid.weekly[0].opensAt = '08:00'
    invalid.weekly[1].closesAt = '07:03'
    await assert.rejects(service.save(1, invalid), error => error instanceof HttpError && error.code === 'LIBRARY_SCHEDULE_TOO_SHORT')
    assert.equal((await service.current()).revision, changed.revision)
  } finally { await pg.close() }
})
