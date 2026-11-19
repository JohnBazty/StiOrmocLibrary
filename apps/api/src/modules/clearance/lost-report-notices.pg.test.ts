import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { createClearanceService } from './clearance.service.ts'

test('lost reporting commits Pending plus deduplicated librarian notices and retry never duplicates them', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE users(user_id bigint PRIMARY KEY,user_role text,account_status text);
      CREATE TABLE accounts(account_id bigint,user_id bigint,role text,account_status text);
      CREATE TABLE materials(material_id bigint,title text);
      CREATE TABLE physical_copies(physical_copy_id bigint,title_id bigint);
      CREATE TABLE titles(title_id bigint,title text);
      CREATE TABLE borrow_transactions(transaction_id bigint PRIMARY KEY,user_id bigint,material_id bigint,physical_copy_id bigint,transaction_status text,reported_lost_at timestamptz,updated_at timestamptz);
      CREATE TABLE lost_book_reports(lost_book_report_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,transaction_id bigint UNIQUE,user_id bigint,physical_copy_id bigint,purchase_price_snapshot numeric,replacement_charge numeric,reported_at timestamptz,report_status text DEFAULT 'Pending');
      CREATE TABLE admin_notifications(event_type text,actor_user_id bigint,borrow_transaction_id bigint,message_title text,message_body text);
      CREATE TABLE notifications(user_id bigint,message_title text,message_body text,trigger_type text,source_type text,source_id bigint,action_path text,priority text,dedupe_key text,scheduled_for timestamptz,delivered_at timestamptz,UNIQUE(user_id,dedupe_key));
      INSERT INTO users VALUES(7,'Faculty','Active'),(8,'Librarian','Active'),(9,'Librarian','Archived');
      INSERT INTO accounts VALUES(1,7,'Faculty','Active'),(2,8,'Librarian','Active'),(3,9,'Librarian','Active');
      INSERT INTO materials VALUES(10,'1984');
      INSERT INTO borrow_transactions VALUES(20,7,10,NULL,'Borrowed',NULL,NOW());`)
    const execute = async (sql: string, args: unknown[] = []) => {
      const insert = /^\s*INSERT/i.test(sql)
      const result = await pg.query<any>(toPgPlaceholders(sql) + (insert ? ' RETURNING *' : ''), args)
      return [insert ? { insertId: result.rows[0]?.lost_book_report_id, affectedRows: result.affectedRows } : result.rows]
    }
    const connection = { execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
    const service = createClearanceService({ getConnection: async () => connection } as never)
    const actor = { accountId: 1, role: 'Faculty' }
    const first = await service.reportLost(actor, 20)
    const retry = await service.reportLost(actor, 20)
    assert.equal(first.status, 'Pending')
    assert.equal(retry.lostBookReportId, first.lostBookReportId)
    const notices = (await pg.query<any>('SELECT * FROM notifications ORDER BY user_id')).rows
    assert.equal(notices.length, 2)
    assert.equal(notices[0].action_path, '/faculty/clearance')
    assert.equal(notices[1].user_id, 8)
    assert.equal(notices[1].action_path, '/librarian/clearance')
    assert.equal((await pg.query('SELECT * FROM admin_notifications')).rows.length, 1)
    assert.equal((await pg.query<any>('SELECT transaction_status FROM borrow_transactions')).rows[0].transaction_status, 'Borrowed')
    await assert.rejects(service.reportLost({ accountId: 2, role: 'Faculty' }, 20))
  } finally { await pg.close() }
})
